import {
  packReferenceChunks,
  referenceBatches,
  referenceCatalog,
  resolveDetailReferences,
  resolveSummaryReferences
} from "../ai/reference-materials";
import { buildPreparedTaskContext, estimateTokens } from "../ai/context-builder";
import { effectiveReasoningLevel, normalizeReasoningLevel } from "../ai/task-policy";
import { canonicalDetail } from "../ai/result-utils";
import { normalizeDetailHeadings, normalizeMathDelimiters } from "../ai/markdown-blocks";
import { checkCounts, countIssueText } from "../ai/detail-templates";
import type { AiResult, ReasoningLevel, TaskContext } from "../ai/types";
import { translate, t, type UiLanguage } from "../i18n";
import { CLAUDE_MODEL_CHOICES, providerForModel } from "../ai/providers/provider";
import type { CodexAppServerRuntime, CodexWebSearchEvent } from "../ai/runtime/codex-app-server";
import type { ClaudeCodeCliRuntime } from "../ai/runtime/claude-code-cli";
import type { AiExchangeLog } from "../ai-exchange-log";
import { runtimeStepProvider, type ExchangeSink } from "./runtime-step-provider";
import { prepareStep, StepRunner } from "./step-runner";
import { referenceTask } from "./steps/reference/step";
import { taskResponseShape } from "./steps/task/schemas";
import { repairCounts, sourceRegistry } from "./steps/task/fragments";
import { createTaskStep, taskStepId, type TaskStepRole } from "./steps/task/step";
import { chartStep, ChartRejected } from "./steps/chart/step";
import { applyCharts, existingDiagrams, type ChartCode } from "./steps/chart/insert";
import { readerFacingDetail } from "./steps/task/render";

export { extractJsonObject } from "./steps/task/parse";

export interface AiTaskServiceOptions {
  pluginDirectory: () => string;
  language: () => UiLanguage;
  defaultReasoning: () => ReasoningLevel;
  exchangeLoggingEnabled: () => boolean;
  exchanges: () => AiExchangeLog | null;
  codexRuntime: (directory: string, local: boolean) => CodexAppServerRuntime;
  claudeRuntime: (directory: string) => ClaudeCodeCliRuntime;
  /** True when Obsidian's mermaid parses the diagram. Absent: the chart step skips the parse check. */
  mermaidParses?: (code: string) => Promise<boolean>;
}

export class AiTaskService {
  constructor(private readonly options: AiTaskServiceOptions) {}

  async askModel(
    input: TaskContext,
    model: string,
    reasoning?: unknown,
    signal?: AbortSignal,
    onExchange?: (id: string) => void,
    onRequestAccepted?: () => void,
    /** Receives provider web activity in the Codex webSearch event shape; results may contain snippets only, not page bodies. */
    onWebSearchEvent?: (event: CodexWebSearchEvent) => void
  ): Promise<AiResult> {
    return this.execute(input, model, reasoning, signal, onExchange, onRequestAccepted, onWebSearchEvent);
  }

  /** `role` names the two reference rounds so they are logged as their own steps; every other request is a task or AIM step. */
  private async execute(
    input: TaskContext,
    model: string,
    reasoning: unknown,
    signal: AbortSignal | undefined,
    onExchange: ((id: string) => void) | undefined,
    onRequestAccepted: (() => void) | undefined,
    onWebSearchEvent: ((event: CodexWebSearchEvent) => void) | undefined,
    role?: TaskStepRole
  ): Promise<AiResult> {
    if (
      input.timeoutMs !== undefined &&
      (!Number.isInteger(input.timeoutMs) || input.timeoutMs < 180_000 || input.timeoutMs > 600_000)
    )
      throw new Error("Invalid AI task timeout.");
    const provider = providerForModel(model);
    if (provider === "claude" && !CLAUDE_MODEL_CHOICES.some(choice => choice.id === model)) {
      throw new Error(t("ui.claude_model_is_not_supported_0", model));
    }

    if (estimateTokens(input.sourceContext) > 32_000) throw new Error(t("ui.source_context_exceeds_budget"));
    let context = input;
    let accepted = onRequestAccepted;
    const referenceGroups = context.referenceGroups ?? [];
    if (referenceGroups.some(group => group.documents.length)) {
      // Reference extraction sends model requests before the main one. The first accepted request
      // counts as the task starting, so callers can move it to the background without waiting.
      let acceptedOnce = false;
      accepted = onRequestAccepted
        ? (): void => {
            if (acceptedOnce) return;
            acceptedOnce = true;
            onRequestAccepted();
          }
        : undefined;
      // A merge that fits one batch sends the documents as they are: an extraction pass would paraphrase (and may drop)
      // the very text being merged, and costs a second request. Over-budget sources still go through extraction.
      const direct = context.referenceDelivery === "direct" ? referenceBatches(referenceGroups) : [];
      const findings =
        direct.length === 1
          ? direct[0]
          : await this.extractReferenceFindings(context, model, reasoning, signal, accepted);
      context = {
        ...context,
        sourceContext: [context.sourceContext, findings, sourceRegistry(referenceCatalog(referenceGroups))]
          .filter(Boolean)
          .join("\n\n"),
        referenceGroups: undefined
      };
    }

    const totalStarted = Date.now();
    const prepared = buildPreparedTaskContext(context, model, 32_000, provider);
    if (prepared.context.sourceContext !== context.sourceContext) {
      throw new Error(t("ui.source_context_exceeds_budget"));
    }
    context = prepared.context;
    const pluginDirectory = this.options.pluginDirectory();
    const outputLanguage = context.outputLanguage ?? this.options.language();
    const shape = taskResponseShape(context);
    const step = prepareStep(createTaskStep(taskStepId(context, role), shape.schema), {
      context,
      language: outputLanguage,
      providerLabel: provider === "claude" ? "Claude Code" : "Codex App Server",
      strictGapAudit: shape.isAimGapAudit,
      webResearch: shape.isIsolatedWebResearch,
      contract: shape.contract
    });

    console.debug("Visual Agent Map AI metrics", prepared.metrics);
    const providerStarted = Date.now();
    const effort = effectiveReasoningLevel(
      context,
      normalizeReasoningLevel(reasoning ?? this.options.defaultReasoning())
    );
    const exchanges = this.options.exchangeLoggingEnabled() ? this.options.exchanges() : null;
    let exchangeId = "";
    // Turning exchange logging off while a task runs stops recording from then on, so every write re-checks the setting.
    const recording =
      <Args extends unknown[]>(write: ((...args: Args) => void) | undefined) =>
      (...args: Args): void => {
        if (this.options.exchangeLoggingEnabled()) write?.(...args);
      };
    const sink: ExchangeSink | null = exchanges && {
      begin: entry => exchanges.begin(entry),
      sent: recording((id: string, request: string, prompt?: string) => exchanges.sent(id, request, prompt)),
      received: recording((id: string, response: string) => exchanges.received(id, response)),
      completed: recording((id: string) => exchanges.completed(id)),
      failed: recording((id: string, error: string) => exchanges.failed(id, error))
    };

    // Set once the first request's entry is closed because the repair request replaced it; the catch must not reopen it.
    let supersededClosed = false;
    let countIssues: ReturnType<typeof checkCounts> | undefined;
    let stage = t("log.stage_starting_ai");
    try {
      const controls = {
        signal,
        ...(input.timeoutMs !== undefined
          ? {
              timeoutMs: Math.min(600_000, Math.max(180_000, input.timeoutMs)),
              // The timeout is an interface message: it follows the interface language, not the content language.
              timeoutMessage: translate(
                this.options.language(),
                "ui.aim_task_timeout",
                Math.ceil(Math.min(600_000, Math.max(180_000, input.timeoutMs)) / 60_000)
              )
            }
          : {}),
        ...(context.aimIsolatedResearch
          ? { webSearchOnly: context.researchMode !== "local", textOnly: context.researchMode === "local" }
          : {}),
        onAccepted: accepted,
        // Search depth guides investigation; it does not impose a per-task query cap.
        // Codex uses 0 as no steering budget; Claude receives webSearch separately.
        searchBudget: 0,
        webSearch: context.researchMode !== "local",
        onRequest: (): void => {
          stage = t("log.stage_waiting_reply");
        }
      };
      // The provider logs begin, sent and received; this method ends the entry with parsed or its own failed message.
      const runner = new StepRunner(
        runtimeStepProvider({
          claude: () => this.options.claudeRuntime(pluginDirectory),
          codex: local => this.options.codexRuntime(pluginDirectory, local),
          exchanges: () => sink,
          localCodex: context.researchMode === "local"
        })
      );
      const { raw } = await runner.send(step, {
        model,
        effort,
        topic: context.title,
        mode: context.mode ?? "task",
        task: { ...controls, onWebSearchEvent },
        finish: "caller",
        requestLog: "request",
        onExchange: id => {
          exchangeId = id;
          onExchange?.(id);
        }
      });
      stage = t("log.stage_parsing_reply");
      let result = step.parse(raw);
      if (readerFacingDetail(input)) {
        result.detail = normalizeMathDelimiters(normalizeDetailHeadings(result.detail));
        result.summary = normalizeMathDelimiters(result.summary);
      }
      if (referenceGroups.length) result.summary = resolveSummaryReferences(result.summary, referenceGroups);
      // Runs without sources too, so a source footnote kept from the previous detail keeps its definition.
      if (referenceGroups.length || /\[\^/.test(result.detail))
        result.detail = resolveDetailReferences(result.detail, referenceGroups, input.detail, input.detailTemplate);
      if (this.options.exchangeLoggingEnabled()) exchanges?.parsed(exchangeId);
      const template = input.detailTemplate;
      if (
        template &&
        template.sections.some(section => section.count) &&
        input.mode !== "decompose" &&
        input.detailFormat !== "adaptive"
      ) {
        let issues = checkCounts(canonicalDetail(result.detail, outputLanguage, template), template);
        if (issues.length && !input.countRepair) {
          const firstExchangeId = exchangeId;
          try {
            const repaired = await this.execute(
              {
                ...input,
                detail: result.detail,
                summary: result.summary,
                task: repairCounts(
                  outputLanguage,
                  issues.map(issue => `- ### ${issue.section}: ${countIssueText(issue, outputLanguage)}`).join("\n")
                ),
                workingFindings: "",
                sourceContext: "",
                referenceGroups: [],
                researchMode: "local",
                countRepair: true
              },
              model,
              reasoning,
              signal,
              onExchange,
              undefined,
              undefined,
              role
            );
            // Only the detail comes from the repair; it runs local, so its summary, suggestions and visual
            // references would replace the first reply's with less.
            result = { ...result, detail: repaired.detail };
            issues = checkCounts(canonicalDetail(result.detail, outputLanguage, template), template);
          } catch (error) {
            if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
          } finally {
            // The repair has its own entry, which the caller finishes; close the first one that it supersedes.
            if (this.options.exchangeLoggingEnabled()) exchanges?.completed(firstExchangeId);
            supersededClosed = true;
          }
        }
        result.formatIssues = issues;
        countIssues = issues;
      }
      if (
        input.addCharts &&
        !input.countRepair &&
        !input.intermediateDetail &&
        input.promptProfile !== "aim" &&
        (input.mode === "task" || input.mode === "synthesize")
      ) {
        stage = t("log.stage_adding_charts");
        const withCharts = await this.addCharts(
          input,
          result.detail,
          countIssues,
          outputLanguage,
          provider,
          model,
          signal,
          sink
        );
        result = { ...result, detail: withCharts };
      }
      console.debug("Visual Agent Map AI metrics", {
        ...prepared.metrics,
        providerMs: Date.now() - providerStarted,
        totalMs: Date.now() - totalStarted
      });
      return result;
    } catch (error) {
      if (this.options.exchangeLoggingEnabled() && !supersededClosed)
        exchanges?.failed(
          exchangeId,
          t("log.stage_failure_0_1", stage, error instanceof Error ? error.message : String(error))
        );
      throw error;
    }
  }

  /**
   * The chart step: one local, tool-free model call that proposes diagrams for the finished note. Any failure other than
   * a stop leaves the detail unchanged, so a note is never worse for having been offered diagrams.
   */
  private async addCharts(
    input: TaskContext,
    detail: string,
    countIssues: ReturnType<typeof checkCounts> | undefined,
    language: UiLanguage,
    provider: "claude" | "codex",
    model: string,
    signal: AbortSignal | undefined,
    sink: ExchangeSink | null
  ): Promise<string> {
    const existing = existingDiagrams(detail);
    const remaining = 3 - existing.count;
    if (remaining <= 0 || !detail.trim()) return detail;
    const pluginDirectory = this.options.pluginDirectory();
    const step = prepareStep(chartStep, {
      title: input.title,
      detail,
      language,
      existingCount: existing.count,
      existingTypes: existing.types,
      remaining
    });
    let exchangeId = "";
    const runner = new StepRunner(
      runtimeStepProvider({
        claude: () => this.options.claudeRuntime(pluginDirectory),
        codex: local => this.options.codexRuntime(pluginDirectory, local),
        exchanges: () => sink,
        localCodex: true
      })
    );
    const refuse = (code: ChartCode): string => {
      console.warn("Visual Agent Map chart step", code);
      if (exchangeId && this.options.exchangeLoggingEnabled())
        this.options.exchanges()?.failed(exchangeId, translate(this.options.language(), "log.chart_not_added_0", code));
      return detail;
    };
    try {
      const { raw } = await runner.send(step, {
        model,
        effort: "low",
        topic: input.title,
        mode: input.mode ?? "task",
        task: {
          signal,
          timeoutMs: 180_000,
          timeoutMessage: translate(this.options.language(), "ui.ai_task_exceeded_0_minutes", 3),
          webSearch: false,
          textOnly: true,
          searchBudget: 0
        },
        finish: "caller",
        requestLog: "request",
        onExchange: id => {
          exchangeId = id;
        }
      });
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const charts = step.parse(raw);
      const applied = await applyCharts(detail, charts, { remaining, parses: this.options.mermaidParses });
      if (!applied.ok) return refuse(applied.code);
      const template = input.detailTemplate;
      if (countIssues && template && input.detailFormat !== "adaptive") {
        const after = checkCounts(canonicalDetail(applied.detail, language, template), template);
        if (JSON.stringify(after) !== JSON.stringify(countIssues)) return refuse("counts_changed");
      }
      if (this.options.exchangeLoggingEnabled() && exchangeId) {
        this.options.exchanges()?.parsed(exchangeId);
        this.options.exchanges()?.completed(exchangeId);
      }
      return applied.detail;
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
        if (exchangeId && this.options.exchangeLoggingEnabled())
          this.options.exchanges()?.failed(exchangeId, error instanceof Error ? error.message : String(error));
        throw error;
      }
      return refuse(error instanceof ChartRejected ? error.code : "runtime_error");
    }
  }

  private async extractReferenceFindings(
    context: TaskContext,
    model: string,
    reasoning: unknown,
    signal?: AbortSignal,
    onRequestAccepted?: () => void
  ): Promise<string> {
    let working = referenceBatches(context.referenceGroups ?? []);
    let round = 0;
    while (true) {
      round++;
      const batches = round === 1 ? working : packReferenceChunks(working);
      const findings: string[] = [];
      for (let index = 0; index < batches.length; index++) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        context.onProgress?.(t("ui.reference_processing_progress", index + 1, batches.length));
        const result = await this.execute(
          {
            title: context.title,
            summary: "",
            rules: "",
            detail: "",
            task: referenceTask(round === 1 ? "extract" : "reduce", this.options.language()),
            ancestors: "",
            sourceContext: batches[index],
            mode: "task",
            researchMode: "local",
            researchDepth: "fast",
            visualMode: "off",
            intermediateDetail: true
          },
          model,
          reasoning,
          signal,
          undefined,
          onRequestAccepted,
          undefined,
          round === 1 ? "reference-extract" : "reference-reduce"
        );
        if (!result.detail.trim()) throw new Error(t("ui.reference_processing_empty_result"));
        findings.push(result.detail.trim());
      }
      const joined = findings.map(value => `Evidence:\n${value}`).join("\n\n");
      if (joined.length <= 18_000) {
        context.onProgress?.("");
        return joined;
      }
      if (joined.length >= working.reduce((sum, value) => sum + value.length, 0)) {
        throw new Error(t("ui.reference_processing_could_not_reduce"));
      }
      working = findings;
    }
  }
}
