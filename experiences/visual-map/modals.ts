// Modals and task helpers used by the Visual Map view; moved from view.ts unchanged.
import type VisualAgentMapPlugin from "../../main";
import { t, type TranslationKey } from "../../i18n";
import { App, Modal, Notice, Setting, TFile } from "obsidian";
import { ReferencePicker, type ReferenceTopic } from "../../ui/reference-picker";
import { type ReferenceGroup } from "../../ai/reference-materials";
import { DebugLogModal } from "../../ui/modals/debug-log-modal";
import { clone, type MapDocument, parseMap, serializeMap } from "../../map-model";
import {
  normalizeReasoningLevel,
  type ModelSource,
  type NotePatch,
  type ResearchDepth,
  type ResearchMode,
  type Settings,
  type TopicInfo,
  type VisualMode
} from "../../repository";
import type { AiResult, Suggestion } from "../../ai/types";
import { syncModelSelect } from "../../core/model-discovery";
import { templateField } from "./research-fields";

export type SynthesisContent = "full" | "summary";
export interface TaskOptions {
  synthesisContent?: SynthesisContent;
  referenceGroups?: ReferenceGroup[];
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
  outputLanguage?: Settings["language"];
  requirements?: string;
  researchMode: ResearchMode;
  researchDepth: ResearchDepth;
  visualMode: VisualMode;
  multiLayer?: boolean;
  shallowResearch?: boolean;
  layers?: number;
  firstLayerCount?: number;
  childrenPerParent?: number;
  /** This run's explicit content template choice; recorded on the topic when given. */
  detailTemplateId?: string;
}
export function renderSynthesisContent(parent: HTMLElement, topics: string[]): HTMLSelectElement {
  const label = parent.createEl("label", { cls: "vam-field" });
  label.createSpan({ text: t("ui.synthesis_content") });
  const select = label.createEl("select");
  select.setAttr("aria-label", t("ui.synthesis_content"));
  select.createEl("option", { value: "full", text: t("ui.synthesis_content_full") });
  select.createEl("option", { value: "summary", text: t("ui.synthesis_content_summary") });
  select.value = "full";
  const hint = parent.createEl("p", { cls: "vam-hint", text: t("ui.synthesis_content_full_hint") });
  hint.setAttr("aria-live", "polite");
  select.addEventListener("change", () =>
    hint.setText(t(select.value === "summary" ? "ui.synthesis_content_summary_hint" : "ui.synthesis_content_full_hint"))
  );
  parent.createEl("p", { cls: "vam-hint", text: t("ui.synthesis_content_scope") });
  parent.createEl("p", { cls: "vam-hint", text: t("ui.synthesis_content_locked_hint") });
  parent.createEl("strong", { text: t("ui.synthesis_source_topics") });
  if (topics.length) {
    const list = parent.createEl("ul");
    for (const title of topics) list.createEl("li", { text: title });
  } else parent.createEl("p", { cls: "vam-hint", text: t("ui.synthesis_no_source_topics") });
  return select;
}
export function researchDepthDescription(depth: ResearchDepth): string {
  const description =
    depth === "fast"
      ? t("ui.quick_aim_for_up_to_1_web_search_and_2_main_sources_answer_t")
      : depth === "deep"
        ? t("ui.deep_aim_for_up_to_6_web_searches_and_10_main_sources_compar")
        : t("ui.standard_aim_for_up_to_3_web_searches_and_5_main_sources_sum");
  return `${description} ${t("ui.web_and_image_searches_share_the_search_limit_search_counts")}`;
}
export function imageReferencesFromMarkdown(markdown: string): string {
  const lines = markdown.split("\n");
  const blocks = lines.flatMap((line, index) =>
    /^\s*!\[[^\]]*\]\(https?:\/\/[^\s)]+\)/i.test(line)
      ? [
          lines
            .slice(Math.max(0, index - 2), Math.min(lines.length, index + 4))
            .join("\n")
            .trim()
        ]
      : []
  );
  return [...new Set(blocks)].join("\n\n");
}
export class PartialChildBatchError extends Error {}
export interface AgentTaskHandle {
  finished: Promise<void>;
}
export interface TaskSourceSettings {
  topics: () => Promise<ReferenceTopic[]>;
  readTopic: (
    topic: ReferenceTopic,
    signal: AbortSignal,
    progress: (message: string) => void
  ) => Promise<{ path: string; content: string }[]>;
  currentTopicId: string;
  currentLabel: string;
  synthesisLabel?: string;
  synthesisTopics?: string[];
}
export function quickShape(
  layers: number,
  firstLayerCount: number,
  childrenPerParent: number
): { counts: bigint[]; total: bigint } {
  if (
    ![layers, firstLayerCount].every(Number.isSafeInteger) ||
    layers < 1 ||
    layers > 15 ||
    firstLayerCount < 1 ||
    (layers > 1 && (!Number.isSafeInteger(childrenPerParent) || childrenPerParent < 1))
  )
    throw new Error(t("ui.levels_first_level_count_and_children_per_topic_must_be_posi"));
  const counts: bigint[] = [];
  let count = BigInt(firstLayerCount),
    total = BigInt(0);
  for (let level = 0; level < layers; level++) {
    counts.push(count);
    total += count;
    if (level + 1 < layers) count *= BigInt(childrenPerParent);
  }
  return { counts, total };
}
export function quickSuggestions(
  items: Suggestion[],
  layers: number,
  firstLayerCount: number,
  childrenPerParent: number
): Suggestion[] {
  const shape = quickShape(layers, firstLayerCount, childrenPerParent);
  if (shape.total > BigInt(15))
    throw new Error(t("ui.this_would_create_0_subtopics_exceeding_the_limit_of_15_redu", shape.total.toString()));
  const invalid = (): never => {
    throw new Error(t("ui.ai_did_not_follow_the_requested_level_counts_and_parent_chil"));
  };
  const byTitle = new Map<string, Suggestion>();
  for (const item of items) {
    if (!item.title?.trim() || byTitle.has(item.title.trim())) invalid();
    byTitle.set(item.title.trim(), item);
  }
  const grouped: Suggestion[][] = [];
  let previous = new Set<string>();
  for (let level = 0; level < layers; level++) {
    const current = items.filter(item =>
      level === 0 ? !item.parentTitle?.trim() : previous.has(item.parentTitle?.trim() || "")
    );
    if (current.length !== Number(shape.counts[level])) invalid();
    if (
      level > 0 &&
      [...previous].some(
        title => current.filter(item => item.parentTitle?.trim() === title).length !== childrenPerParent
      )
    )
      invalid();
    grouped.push(current);
    previous = new Set(current.map(item => item.title.trim()));
  }
  const selected = grouped.flat();
  if (selected.length !== items.length) invalid();
  return selected;
}
export class TaskModal extends Modal {
  constructor(
    app: App,
    private value: string,
    private submit: (value: string, run: boolean, options: TaskOptions, rules: string) => void,
    private titleText = t("ui.custom_ai_task"),
    private description = t("ui.describe_what_you_want_ai_to_do_next"),
    private rules = "",
    private mode: ResearchMode = "research",
    private depth: ResearchDepth = "normal",
    private visual: VisualMode = "auto",
    _allowSave = true,
    private expand = false,
    private referenceSettings?: TaskSourceSettings,
    private synthesisTopics?: string[],
    private currentLanguage: Settings["language"] = "zh-TW",
    private modelId = "",
    private reasoningId = "auto",
    private targetLabel = ""
  ) {
    super(app);
  }
  onOpen(): void {
    this.titleEl.setText(this.titleText);
    this.contentEl.createEl("p", { text: this.description, cls: "vam-modal-intro" });
    const label = this.contentEl.createEl("label", { cls: "vam-field" });
    label.createSpan({ text: t("ui.additional_requirements") });
    const input = label.createEl("textarea", { cls: "vam-task-input" });
    input.rows = 3;
    input.setAttr("aria-label", t("ui.additional_requirements"));
    this.contentEl.createEl("p", { text: t("ui.requirements_this_task_only"), cls: "vam-hint" });
    this.contentEl.createEl("p", { text: t("ui.summary_fields_hint"), cls: "vam-hint" });
    const languageLabel = this.contentEl.createEl("label", { cls: "vam-field" });
    languageLabel.createSpan({ text: t("ui.output_language") });
    const languageSelect = languageLabel.createEl("select");
    languageSelect.setAttr("aria-label", t("ui.output_language"));
    languageSelect.createEl("option", { value: "zh-TW", text: "繁體中文" });
    languageSelect.createEl("option", { value: "en", text: "English" });
    languageSelect.value = this.currentLanguage;
    if (this.rules.trim()) this.contentEl.createEl("p", { text: t("ui.legacy_rules_not_applied"), cls: "vam-hint" });
    const synthesis = this.synthesisTopics ? renderSynthesisContent(this.contentEl, this.synthesisTopics) : undefined;
    const referenceLabel = this.expand
      ? this.referenceSettings?.currentLabel
      : (this.referenceSettings?.synthesisLabel ?? this.referenceSettings?.currentLabel);
    const references = this.referenceSettings
      ? new ReferencePicker(
          this.app,
          this.contentEl,
          this.referenceSettings.topics,
          this.referenceSettings.readTopic,
          this.referenceSettings.currentTopicId,
          referenceLabel ?? "",
          this.mode !== "local",
          this.visual !== "off"
        )
      : null;
    const executionSummary = this.contentEl.createEl("p", { cls: "vam-hint", attr: { "aria-live": "polite" } });
    const updateSummary = (): void => {
      const selected = references?.selection();
      const result = this.synthesisTopics
        ? t("ui.review_synthesis_draft")
        : this.expand
          ? t("ui.expand_subtopics")
          : t("ui.current_understanding");
      executionSummary.setText(
        t(
          "ui.ai_task_summary",
          this.modelId,
          this.reasoningId,
          references?.describe() ?? `0 ${t("ui.markdown_files")}`,
          t(selected?.webSearch ? "ui.on" : "ui.off"),
          this.targetLabel ? `${this.targetLabel} · ${result}` : result
        )
      );
    };
    this.contentEl.addEventListener("change", updateSummary);
    updateSummary();
    const depthLabel = this.contentEl.createEl("label", { cls: "vam-field" });
    depthLabel.createSpan({ text: t("ui.research_depth") });
    const depthHint = this.contentEl.createEl("p", { cls: "vam-hint", text: researchDepthDescription(this.depth) });
    const depth = this.contentEl.createEl("select", { cls: "vam-depth-select" });
    depth.setAttr("aria-label", t("ui.research_depth"));
    for (const [value, key] of [
      ["fast", "ui.fast_quick_overview"],
      ["normal", "ui.normal_standard_research"],
      ["deep", "ui.deep_in_depth_research"]
    ] as const)
      depth.createEl("option", { value, text: t(key) });
    depth.value = this.depth;
    depth.addEventListener("change", () => depthHint.setText(researchDepthDescription(depth.value as ResearchDepth)));
    const layers = this.expand ? this.contentEl.createEl("label", { cls: "vam-field" }) : null;
    const multiLayer = layers?.createEl("input", { type: "checkbox" });
    if (multiLayer) multiLayer.checked = true;
    if (layers) layers.createSpan({ text: t("ui.create_two_levels_and_research_each_topic_briefly_up_to_15") });
    const save = async (run: boolean): Promise<void> => {
      const value = this.value;
      const synthesisContent: SynthesisContent = synthesis?.value === "summary" ? "summary" : "full";
      if (synthesis) synthesis.disabled = true;
      const sources = await references?.ready();
      const shallowResearch = multiLayer?.checked ?? false;
      this.close();
      this.submit(
        value,
        run,
        {
          ...(synthesis ? { synthesisContent } : {}),
          referenceGroups: sources?.groups ?? [],
          requirements: input.value.trim(),
          outputLanguage: languageSelect.value as Settings["language"],
          researchMode: sources?.webSearch ? "research" : "local",
          researchDepth: depth.value as ResearchDepth,
          visualMode: sources?.imageSearch ? (this.visual === "on" ? "on" : "auto") : "off",
          multiLayer: shallowResearch
        },
        ""
      );
    };
    new Setting(this.contentEl)
      .addButton(b => b.setButtonText(t("ui.cancel")).onClick(() => this.close()))
      .addButton(b =>
        b
          .setButtonText(t("ui.confirm_and_run"))
          .setCta()
          .onClick(() => {
            void save(true).catch(error => new Notice(String(error)));
          })
      );
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}
export class NextStepModal extends Modal {
  private closed = false;
  private runPending = false;
  private settingsPending: Promise<void> = Promise.resolve();
  private settingsError: string | null = null;
  constructor(
    app: App,
    private topic: string,
    private depth: ResearchDepth,
    private childrenCount: number,
    private pendingCount: number,
    private plugin: VisualAgentMapPlugin,
    private research: (
      options: TaskOptions,
      focus: string,
      done: (result: AiResult) => void,
      failed: (message: string) => void,
      accepted: () => void
    ) => Promise<void>,
    private expand: (
      options: TaskOptions,
      direction: string,
      found: (items: Suggestion[], create: (items: Suggestion[]) => Promise<void>) => void,
      failed: (message: string, retryable?: boolean) => void,
      created: () => void,
      accepted: () => void
    ) => Promise<void>,
    private synthesize: (
      options: TaskOptions,
      direction: string | null,
      failed: (message: string) => void,
      accepted: () => void
    ) => Promise<void>,
    private modelSettings?: {
      model: string;
      modelSource: ModelSource;
      reasoning: string;
      rules?: string;
      path?: string;
      save: (patch: NotePatch) => Promise<void>;
      running?: boolean;
      stop?: () => void;
      quickError?: string;
      sources?: TaskSourceSettings;
      synthesisPending?: { directions: Suggestion[]; discard: () => void };
      templates?: { id: string; name: string }[];
      currentTemplate?: string;
      /** The topic's research state and how many of its direct children are researched, for the suggested mode. */
      topicStatus?: "idea" | "running" | "completed" | "error";
      childrenCompleted?: number;
    }
  ) {
    super(app);
  }
  /** Suggests the next step from where the topic stands: frontier → research, settled leaf → expand, settled branch → synthesize. */
  private suggestedMode(): "research" | "expand" | "synthesize" {
    const settings = this.modelSettings;
    if (settings?.synthesisPending) return "synthesize";
    if (settings?.topicStatus !== "completed") return "research";
    if (!this.childrenCount) return "expand";
    return settings.childrenCompleted === this.childrenCount ? "synthesize" : "research";
  }
  private taskSignal?: AbortSignal;
  private taskController?: AbortController;
  private unsubscribeModels?: () => void;
  /** One data-source picker shared by every step, so choices survive switching steps. */
  private addReferencePicker(
    panel: HTMLElement
  ):
    | {
        picker: ReferencePicker;
        disclosure: HTMLElement;
        forMode: (mode: "research" | "expand" | "synthesize") => void;
      }
    | undefined {
    const sources = this.modelSettings?.sources;
    if (!sources) return undefined;
    const disclosure = panel.createEl("details", { cls: "vam-next-source-details" });
    disclosure.open = false;
    const summary = disclosure.createEl("summary");
    const summaryRow = summary.createSpan({ cls: "vam-next-source-summary-row" });
    summaryRow.createEl("strong", { text: t("ui.data_sources") });
    const selection = summaryRow.createSpan({ cls: "vam-next-source-summary" });
    const pickerContent = disclosure.createDiv();
    const picker = new ReferencePicker(
      this.app,
      pickerContent,
      sources.topics,
      sources.readTopic,
      sources.currentTopicId,
      sources.currentLabel
    );
    const updateSelection = (): void => selection.setText(picker.describe());
    pickerContent.addEventListener("change", updateSelection);
    updateSelection();
    // Synthesis works from existing findings, so it defaults to no web search until the user chooses otherwise.
    const forMode = (mode: "research" | "expand" | "synthesize"): void => {
      const synthesize = mode === "synthesize";
      picker.setCurrentLabel(synthesize ? (sources.synthesisLabel ?? sources.currentLabel) : sources.currentLabel);
      picker.setNetworkDefault(!synthesize, !synthesize);
      updateSelection();
    };
    return { picker, disclosure, forMode };
  }
  private requirementsInput?: HTMLTextAreaElement;
  private renderRequirements(): void {
    const disclosure = this.contentEl.createEl("details", { cls: "vam-next-requirements" });
    disclosure.open = false;
    disclosure.createEl("summary", { text: t("ui.additional_requirements") });
    this.requirementsInput = disclosure.createEl("textarea", { cls: "vam-next-focus" });
    this.requirementsInput.rows = 3;
    this.requirementsInput.setAttr("aria-label", t("ui.additional_requirements"));
    disclosure.createEl("p", { text: t("ui.requirements_this_task_only"), cls: "vam-hint" });
    if (this.modelSettings?.rules?.trim())
      this.contentEl.createEl("p", { text: t("ui.legacy_rules_not_applied"), cls: "vam-hint" });
  }
  private requirements(): string {
    return this.requirementsInput?.value.trim() ?? "";
  }
  onClose(): void {
    this.closed = true;
    this.taskController?.abort();
    this.unsubscribeModels?.();
  }
  private async readySettings(): Promise<void> {
    await this.settingsPending;
    if (this.settingsError) throw new Error(this.settingsError);
  }
  private renderModelSettings(): void {
    if (!this.modelSettings) return;
    const settings = this.modelSettings;
    const advanced = this.contentEl.createEl("details", { cls: "vam-advanced vam-next-model" });
    advanced.createEl("summary", { text: t("ui.model_and_advanced_settings") });
    const error = advanced.createEl("p", { cls: "vam-hint" });
    const save = (patch: NotePatch): void => {
      this.settingsError = null;
      error.setText("");
      this.settingsPending = this.settingsPending
        .then(() => settings.save(patch))
        .catch(cause => {
          this.settingsError = cause instanceof Error ? cause.message : String(cause);
          error.setText(this.settingsError);
        });
    };
    const modelLabel = advanced.createEl("label", { cls: "vam-field" });
    modelLabel.createSpan({ text: t("ui.model") });
    const model = modelLabel.createEl("select");
    model.setAttr("aria-label", t("ui.model"));
    model.add(new Option(this.plugin.modelLabel(settings.model), settings.model));
    model.value = settings.model;
    const optionList =
      typeof this.plugin.availableModels === "function"
        ? this.plugin.availableModels()
        : this.plugin.settings.models
            .split(/[\n,]/)
            .map((value: string) => value.trim())
            .filter(Boolean);
    const options = new Set<string>(optionList);
    const syncModels = (): void => {
      syncModelSelect(
        model,
        this.plugin.availableModels(),
        id => this.plugin.modelLabel(id),
        t("ui.current_model_is_unavailable")
      );
      options.clear();
      this.plugin.availableModels().forEach(id => options.add(id));
    };
    syncModels();
    const discovery = advanced.createDiv("vam-model-discovery-status");
    const discoveryText = discovery.createSpan({ cls: "vam-hint" });
    const retry = discovery.createEl("button", { text: t("ui.check_again") });
    const updateDiscovery = (): void => {
      const codex = this.plugin.modelDiscoveryState("codex"),
        claude = this.plugin.modelDiscoveryState("claude");
      discoveryText.setText(
        `Codex: ${codex.status}${codex.error ? ` · ${codex.error}` : ""} | Claude CLI candidates: ${claude.status}`
      );
      retry.disabled = codex.status === "loading";
      syncModels();
    };
    this.unsubscribeModels?.();
    this.unsubscribeModels = this.plugin.subscribeModelDiscovery(() => {
      if (!this.closed) updateDiscovery();
    });
    retry.addEventListener("click", () => {
      void this.plugin.refreshModelDiscovery("codex");
      void this.plugin.refreshModelDiscovery("claude");
    });
    updateDiscovery();
    void this.plugin.refreshModelDiscovery("codex");
    void this.plugin.refreshModelDiscovery("claude");
    const sourceLabels: Record<ModelSource, string> = {
      workspace: t("ui.workspace_default"),
      inherited: t("ui.inherited_at_creation"),
      manual: t("ui.manually_selected")
    };
    const modelSummary = advanced.createEl("p", {
      cls: "vam-hint",
      text: t("ui.0_1_reasoning_can_be_adjusted_per_topic", settings.model, sourceLabels[settings.modelSource])
    });
    model.value = settings.model;
    model.addEventListener("change", () => {
      if (!options.has(model.value)) return;
      settings.model = model.value;
      settings.modelSource = "manual";
      modelSummary.setText(
        t("ui.0_1_reasoning_can_be_adjusted_per_topic", settings.model, sourceLabels[settings.modelSource])
      );
      save({ model: settings.model, modelSource: settings.modelSource });
    });
    const reasoningLabel = advanced.createEl("label", { cls: "vam-field" });
    reasoningLabel.createSpan({ text: t("ui.reasoning_level") });
    const reasoning = reasoningLabel.createEl("select");
    reasoning.setAttr("aria-label", t("ui.reasoning_level"));
    for (const [value, label] of [
      ["auto", t("ui.auto")],
      ["low", t("ui.low")],
      ["medium", t("ui.medium")],
      ["high", t("ui.high")]
    ])
      reasoning.createEl("option", { value, text: label });
    reasoning.value = normalizeReasoningLevel(settings.reasoning);
    reasoning.addEventListener("change", () => {
      settings.reasoning = normalizeReasoningLevel(reasoning.value);
      save({ reasoning: normalizeReasoningLevel(reasoning.value) });
    });
  }
  private async run(
    panel: HTMLElement,
    button: HTMLButtonElement,
    work: () => Promise<void>,
    needsUsage = true
  ): Promise<void> {
    if (button.disabled || this.runPending || (this.taskController && !this.taskController.signal.aborted)) return;
    this.runPending = true;
    button.disabled = true;
    const start = async (): Promise<void> => {
      if (this.closed) return;
      button.disabled = true;
      const failureHelp = panel.querySelector<HTMLElement>(".vam-ai-failure-help");
      if (failureHelp) failureHelp.hidden = true;
      const controller = new AbortController();
      this.taskController = controller;
      this.taskSignal = controller.signal;
      const tasksBefore = new Set(this.plugin.activeTasks?.keys?.() ?? []);
      const status = panel.querySelector<HTMLElement>(".vam-next-status");
      status?.setText(t("ui.ai_running_ai"));
      let cancel = panel.querySelector<HTMLButtonElement>(".vam-task-cancel");
      if (!cancel) cancel = panel.createEl("button", { text: t("ui.cancel"), cls: "vam-task-cancel" });
      cancel.hidden = false;
      cancel.onclick = () => controller.abort();
      try {
        await this.readySettings();
        if (this.closed || controller.signal.aborted) return;
        await work();
      } catch (error) {
        this.failed(
          panel,
          button,
          controller.signal.aborted ? t("ui.ai_task_cancelled") : error instanceof Error ? error.message : String(error)
        );
      } finally {
        const backgroundTaskRunning = [...(this.plugin.activeTasks?.keys?.() ?? [])].some(
          path => !tasksBefore.has(path)
        );
        const release = (): void => {
          if (!this.closed) cancel.hidden = true;
          if (this.taskController === controller) {
            this.taskSignal = undefined;
            this.taskController = undefined;
          }
        };
        if (backgroundTaskRunning) {
          const waitForTasks = (): void => {
            if (this.taskController !== controller) return;
            if ([...(this.plugin.activeTasks?.keys?.() ?? [])].some(path => !tasksBefore.has(path)))
              window.setTimeout(waitForTasks, 250);
            else release();
          };
          window.setTimeout(waitForTasks, 250);
        } else release();
      }
    };
    try {
      const model = this.modelSettings?.model ?? this.plugin.settings.cliModel;
      const started = needsUsage
        ? await this.plugin.confirmAiUsage(model, start)
        : (await this.plugin.aiReadyForModel(model)) && (await start(), true);
      if (!started) button.disabled = false;
    } catch (error) {
      this.failed(panel, button, error instanceof Error ? error.message : String(error));
    } finally {
      this.runPending = false;
    }
  }
  private launchSynthesis(
    panel: HTMLElement,
    button: HTMLButtonElement,
    direction: string | null,
    buildOptions: (signal: AbortSignal) => TaskOptions | Promise<TaskOptions>
  ): void {
    void this.run(panel, button, async () => {
      const controller = this.taskController;
      if (!controller) return;
      const options = await buildOptions(controller.signal);
      if (this.closed || controller.signal.aborted) return;
      let launchAccepted = false;
      let launchFailed = false;
      const release = (): void => {
        if (this.taskController === controller) {
          this.taskSignal = undefined;
          this.taskController = undefined;
        }
        if (!this.closed) {
          const cancel = panel.querySelector<HTMLButtonElement>(".vam-task-cancel");
          if (cancel) cancel.hidden = true;
        }
      };
      const launch = this.synthesize(
        options,
        direction,
        message => {
          if (this.closed) {
            new Notice(message);
            return;
          }
          release();
          launchFailed = true;
          this.failedAi(panel, button, message);
        },
        () => {}
      );
      // The view registers the task before its first await, so the node already shows it running.
      // Close right away; a failure from here on arrives as a Notice and the node's state.
      if (!launchFailed && !this.closed && !controller.signal.aborted && this.taskController === controller) {
        launchAccepted = true;
        release();
        this.close();
      }
      await launch;
      if (!this.closed && !launchAccepted && !launchFailed) {
        release();
        this.failed(panel, button, t("ui.ai_task_cancelled"));
      }
    });
  }
  private failed(panel: HTMLElement, button: HTMLButtonElement, message: string): void {
    if (this.closed) return;
    panel.querySelector<HTMLElement>(".vam-next-status")?.setText(message);
    button.disabled = false;
  }
  private failedAi(panel: HTMLElement, button: HTMLButtonElement, message: string): void {
    this.failed(panel, button, message);
    if (this.closed) return;
    let help = panel.querySelector<HTMLElement>(".vam-ai-failure-help");
    if (!help) {
      help = panel.createDiv("vam-ai-failure-help");
      help.createEl("p", { text: t("ui.ai_failure_next_steps"), cls: "vam-hint" });
      help
        .createEl("button", { text: t("ui.open_debug_log") })
        .addEventListener("click", () =>
          new DebugLogModal(
            this.app,
            this.plugin.logs,
            this.plugin.exchanges,
            () => this.plugin.settings.aiExchangeLoggingEnabled
          ).open()
        );
    }
    help.hidden = false;
  }
  private proposals(
    panel: HTMLElement,
    suggestions: Suggestion[],
    create: (items: Suggestion[]) => Promise<void>,
    button: HTMLButtonElement,
    consumed: () => void,
    options: TaskOptions
  ): void {
    if (this.closed) return;
    const result = panel.querySelector<HTMLElement>(".vam-next-result")!;
    result.empty();
    result.createEl("h4", { text: t("ui.ai_subtopic_proposals") });
    result.createEl("p", { text: t("ui.select_subtopics_to_create_you_can_edit_their_names_and_task") });
    const rows: {
      item: Suggestion;
      check: HTMLInputElement;
      title: HTMLInputElement;
      task: HTMLTextAreaElement;
      contribution: HTMLTextAreaElement;
    }[] = [];
    const list = result.createDiv("vam-proposal-list");
    for (const item of suggestions) {
      const row = list.createDiv("vam-proposal");
      if (item.parentTitle) row.createEl("p", { text: t("ui.child_of_0", item.parentTitle) });
      const check = row.createEl("input", { type: "checkbox" });
      check.checked = true;
      check.setAttr("aria-label", t("ui.select_proposal_0", item.title));
      const titleField = row.createEl("label", { cls: "vam-proposal-field" });
      titleField.createSpan({ text: t("ui.subtopic_name") });
      const title = titleField.createEl("input", { type: "text", value: item.title });
      title.setAttr("aria-label", t("ui.proposal_name"));
      const taskField = row.createEl("label", { cls: "vam-proposal-field" });
      taskField.createSpan({ text: t("ui.research_task") });
      const task = taskField.createEl("textarea", { text: item.task });
      task.rows = 2;
      task.setAttr("aria-label", t("ui.proposal_task"));
      const contributionField = row.createEl("label", { cls: "vam-proposal-field" });
      contributionField.createSpan({ text: t("ui.contribution_to_the_parent_topic") });
      const contribution = contributionField.createEl("textarea", { text: item.contribution });
      contribution.rows = 2;
      contribution.placeholder = t("ui.contribution_to_the_parent_topic");
      contribution.setAttr("aria-label", t("ui.contribution_to_the_parent_topic"));
      rows.push({ item, check, title, task, contribution });
    }
    const confirm = result.createEl("button", { text: t("ui.create_subtopics"), cls: "mod-cta" });
    confirm.addEventListener("click", () => {
      void (async () => {
        const selected = rows.filter(row => row.check.checked && row.title.value.trim());
        if (!selected.length) {
          panel.querySelector<HTMLElement>(".vam-next-status")?.setText(t("ui.select_at_least_one_subtopic"));
          return;
        }
        const renamed = new Map(
          selected.filter(row => !row.item.parentTitle).map(row => [row.item.title, row.title.value.trim()])
        );
        const names = selected.filter(row => !row.item.parentTitle).map(row => row.title.value.trim());
        if (new Set(names).size !== names.length) {
          this.failed(panel, button, t("ui.first_level_topic_names_must_be_unique"));
          return;
        }
        if (selected.some(row => row.item.parentTitle && !renamed.has(row.item.parentTitle))) {
          this.failed(panel, button, t("ui.select_the_parent_topic_before_its_child"));
          return;
        }
        void this.run(
          panel,
          confirm,
          async () => {
            options.signal = this.taskSignal;
            panel.querySelector<HTMLElement>(".vam-next-status")?.setText(t("ui.creating_subtopics"));
            try {
              await create(
                selected.map(row => ({
                  title: row.title.value.trim(),
                  task: row.task.value.trim(),
                  contribution: row.contribution.value.trim(),
                  parentTitle: row.item.parentTitle ? renamed.get(row.item.parentTitle)! : ""
                }))
              );
              if (options.shallowResearch) {
                this.taskSignal = undefined;
                this.taskController = undefined;
                this.close();
                return;
              }
              result.empty();
              consumed();
              panel.querySelector<HTMLElement>(".vam-next-status")?.setText(t("ui.subtopics_created"));
              confirm.disabled = false;
              button.disabled = false;
            } catch (error) {
              if (error instanceof PartialChildBatchError) {
                result.empty();
                consumed();
                button.disabled = true;
              }
              throw error;
            }
          },
          false
        );
      })();
    });
    panel.querySelector<HTMLElement>(".vam-next-status")?.setText(t("ui.review_ai_suggested_subtopics"));
  }
  onOpen(): void {
    this.modalEl.addClass("vam-next-modal");
    this.titleEl.setText(t("ui.how_would_you_like_to_explore_next"));
    // The decision comes first: where the topic stands, then the three next steps; output settings follow the panel.
    const intro = this.contentEl.createEl("p", { cls: "vam-modal-intro vam-next-topic" });
    intro.createSpan({ text: t("ui.current_topic_0", this.topic) });
    const topicStatus = this.modelSettings?.topicStatus;
    if (topicStatus)
      intro.createSpan({
        cls: `vam-status vam-status-${topicStatus}`,
        text: t(
          topicStatus === "completed"
            ? "ui.researched"
            : topicStatus === "running"
              ? "ui.ai_running"
              : topicStatus === "error"
                ? "ui.task_error"
                : "ui.to_research"
        )
      });
    const initialMode = this.suggestedMode();
    // One action bar below the scrolling content: Close plus the current step's primary action.
    const actions = this.modalEl.createDiv("vam-next-actions");
    const closeButton = actions.createEl("button", { text: t("ui.close"), cls: "vam-next-close" });
    closeButton.addEventListener("click", () => this.close());
    const confirm = actions.createEl("button", { text: t("ui.confirm_research_task"), cls: "mod-cta" });
    confirm.dataset.topicRun = t("ui.confirm_research_task");
    confirm.disabled = !!this.modelSettings?.running;
    let synthAction: HTMLButtonElement | undefined;
    // The three steps are one choice: a radio group with arrow-key movement, not three toggles.
    const cards = this.contentEl.createDiv("vam-next-cards");
    cards.setAttr("role", "radiogroup");
    cards.setAttr("aria-label", t("ui.how_would_you_like_to_explore_next"));
    let show: (mode: "research" | "expand" | "synthesize") => void;
    const card = (
      title: TranslationKey,
      description: TranslationKey,
      mode: "research" | "expand" | "synthesize"
    ): HTMLButtonElement => {
      const button = cards.createEl("button", { cls: "vam-next-card" });
      const copy = button.createSpan();
      copy.createEl("strong", { text: t(title) });
      copy.createSpan({ text: t(description) });
      button.setAttr("role", "radio");
      button.setAttr("aria-checked", mode === initialMode ? "true" : "false");
      button.tabIndex = mode === initialMode ? 0 : -1;
      button.addEventListener("click", () => show(mode));
      button.addEventListener("keydown", event => {
        const order = ["research", "expand", "synthesize"] as const;
        const step = ["ArrowRight", "ArrowDown"].includes(event.key)
          ? 1
          : ["ArrowLeft", "ArrowUp"].includes(event.key)
            ? -1
            : 0;
        if (!step) return;
        event.preventDefault();
        const next = order[(order.indexOf(mode) + step + order.length) % order.length];
        show(next);
        cardFor[next].focus();
      });
      if (mode === initialMode) {
        button.addClass("is-active");
        button.createSpan({ text: t("ui.suggested"), cls: "vam-next-suggested" });
      }
      return button;
    };
    const researchCard = card("ui.research_deeper", "ui.find_answers_for_this_topic_at_your_chosen_depth", "research");
    const expandCard = card(
      "ui.expand_the_map",
      "ui.discuss_directions_or_explore_multiple_levels_with_shallow_r",
      "expand"
    );
    const synthesizeCard = card(
      "ui.synthesize_findings",
      "ui.find_shared_conclusions_differences_and_next_steps_across_su",
      "synthesize"
    );
    const cardFor = { research: researchCard, expand: expandCard, synthesize: synthesizeCard };
    if (this.modelSettings?.running) {
      const running = this.contentEl.createDiv("vam-next-running");
      running.createSpan({ text: t("ui.ai_running_ai") });
      if (this.modelSettings.stop)
        running
          .createEl("button", { text: t("ui.stop_research") })
          .addEventListener("click", () => this.modelSettings?.stop?.());
    } else if (this.modelSettings?.quickError)
      this.contentEl.createEl("p", { cls: "vam-hint", text: this.modelSettings.quickError });
    const research = this.contentEl.createDiv("vam-next-research");
    research.createEl("p", { text: t("ui.start_from_this_node_s_question_update_only_this_node") });
    const depthSet = research.createEl("fieldset", { cls: "vam-next-depth-set" });
    depthSet.createEl("legend", { text: t("ui.research_depth") });
    const depths = depthSet.createDiv("vam-next-depths");
    const radios: HTMLInputElement[] = [];
    for (const [value, key] of [
      ["fast", "ui.quick"],
      ["normal", "ui.standard"],
      ["deep", "ui.deep"]
    ] as const) {
      const option = depths.createEl("label");
      const radio = option.createEl("input", { type: "radio", attr: { name: "vam-next-depth", value } });
      radio.checked = this.depth === value;
      radios.push(radio);
      option.createSpan({ text: t(key) });
    }
    const depthDisclosure = research.createEl("details", { cls: "vam-next-depth-help" });
    depthDisclosure.open = false;
    depthDisclosure.createEl("summary", { text: t("ui.depth_guidance") });
    const depthHint = depthDisclosure.createEl("p", { cls: "vam-hint", text: researchDepthDescription(this.depth) });
    radios.forEach(radio =>
      radio.addEventListener("change", () => {
        if (radio.checked) depthHint.setText(researchDepthDescription(radio.value as ResearchDepth));
      })
    );
    research.createEl("p", { cls: "vam-next-status" });
    confirm.addEventListener("click", () => {
      void this.run(research, confirm, async () => {
        const controller = this.taskController;
        const selected = await sharedSources?.picker.ready();
        if (this.closed || !controller || controller.signal.aborted) return;
        const options: TaskOptions = {
          referenceGroups: selected?.groups ?? [],
          outputLanguage: languageSelect.value as Settings["language"],
          researchMode: selected?.webSearch ? "research" : "local",
          researchDepth: (radios.find(radio => radio.checked)?.value || "normal") as ResearchDepth,
          visualMode: selected?.imageSearch ? "auto" : "off",
          requirements: this.requirements(),
          ...(templateId() ? { detailTemplateId: templateId() } : {}),
          signal: controller.signal,
          onProgress: message => {
            if (!this.closed && !controller.signal.aborted)
              research.querySelector<HTMLElement>(".vam-next-status")?.setText(message);
          }
        };
        let launchAccepted = false;
        let launchFailed = false;
        const release = (): void => {
          if (this.taskController === controller) {
            this.taskSignal = undefined;
            this.taskController = undefined;
          }
          if (!this.closed) {
            const cancel = research.querySelector<HTMLButtonElement>(".vam-task-cancel");
            if (cancel) cancel.hidden = true;
          }
        };
        const accepted = (): void => {
          if (this.closed || controller.signal.aborted || this.taskController !== controller) return;
          this.taskSignal = undefined;
          this.taskController = undefined;
          const cancel = research.querySelector<HTMLButtonElement>(".vam-task-cancel");
          if (cancel) cancel.hidden = true;
          launchAccepted = true;
          this.close();
        };
        await this.research(
          options,
          "",
          () => {
            if (this.closed) return;
            release();
            this.close();
          },
          message => {
            if (this.closed) {
              new Notice(message);
              return;
            }
            release();
            launchFailed = true;
            this.failedAi(research, confirm, message);
          },
          accepted
        );
        if (!this.closed && !launchAccepted && !launchFailed) {
          release();
          this.failed(research, confirm, t("ui.ai_task_cancelled"));
        }
      });
    });
    const expandPanel = this.contentEl.createDiv("vam-next-research vam-next-choice");
    expandPanel.createEl("p", { text: t("ui.review_one_level_or_set_the_first_level_count_and_the_number") });
    const modes = expandPanel.createDiv("vam-next-depths vam-next-segmented");
    modes.setAttr("role", "radiogroup");
    modes.setAttr("aria-label", t("ui.expand_the_map"));
    const guided = modes.createEl("button", { text: t("ui.choose_directions_together"), cls: "is-active" });
    const quick = modes.createEl("button", { text: t("ui.quickly_explore_a_map") });
    for (const [option, checked] of [
      [guided, true],
      [quick, false]
    ] as const) {
      option.setAttr("role", "radio");
      option.setAttr("aria-checked", String(checked));
      option.tabIndex = checked ? 0 : -1;
      option.addEventListener("keydown", event => {
        if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) return;
        event.preventDefault();
        const other = option === guided ? quick : guided;
        setExpandMode(other === quick);
        other.focus();
      });
    }
    let multiLayer = false;
    const setExpandMode = (value: boolean): void => {
      multiLayer = value;
      guided.classList.toggle("is-active", !value);
      quick.classList.toggle("is-active", value);
      guided.setAttr("aria-checked", String(!value));
      quick.setAttr("aria-checked", String(value));
      guided.tabIndex = value ? -1 : 0;
      quick.tabIndex = value ? 0 : -1;
      modeHint.setText(
        value
          ? t("ui.ai_creates_a_starter_map_at_the_chosen_size_shallow_research")
          : this.pendingCount
            ? t("ui.you_have_pending_proposals_review_them_here")
            : t("ui.ai_suggests_one_level_of_subtopics_review_or_edit_them_befor")
      );
      quickLimits.classList.toggle("is-hidden", !value);
      expandFooterText.setText(
        shallow.checked
          ? t("ui.research_each_subtopic_after_creation_and_use_codex_quota")
          : t("ui.create_subtopics_without_research")
      );
      expandButton.setText(
        value
          ? t("ui.create_starter_map_now")
          : this.pendingCount
            ? t("ui.review_ai_subtopic_suggestions")
            : t("ui.get_expansion_directions")
      );
      expandButton.dataset.topicRun = expandButton.textContent ?? "";
      expandButton.disabled = !!this.modelSettings?.running || (value && !!quickError);
    };
    guided.addEventListener("click", () => setExpandMode(false));
    quick.addEventListener("click", () => setExpandMode(true));
    const modeHint = expandPanel.createEl("p", {
      text: this.pendingCount
        ? t("ui.you_have_pending_proposals_review_them_here")
        : t("ui.ai_suggests_one_level_of_subtopics_review_or_edit_them_befor")
    });
    const quickLimits = expandPanel.createDiv("vam-quick-limits is-hidden");
    const layersLabel = quickLimits.createEl("label", { cls: "vam-field" });
    layersLabel.createSpan({ text: t("ui.number_of_levels") });
    const layersInput = layersLabel.createEl("input", {
      type: "number",
      attr: { min: "1", max: "15", step: "1", value: "2" }
    });
    layersInput.value = "2";
    quickLimits.createEl("p", { text: t("ui.expansion_levels_exclude_current_topic"), cls: "vam-hint" });
    const firstLabel = quickLimits.createEl("label", { cls: "vam-field" });
    firstLabel.createSpan({ text: t("ui.first_level_subtopics") });
    const firstInput = firstLabel.createEl("input", {
      type: "number",
      attr: { min: "1", max: "15", step: "1", value: "3" }
    });
    firstInput.value = "3";
    const childrenLabel = quickLimits.createEl("label", { cls: "vam-field" });
    childrenLabel.createSpan({ text: t("ui.children_per_parent_topic") });
    const childrenInput = childrenLabel.createEl("input", {
      type: "number",
      attr: { min: "1", max: "15", step: "1", value: "2" }
    });
    childrenInput.value = "2";
    const childrenHint = quickLimits.createEl("p", {
      text: t("ui.children_count_unused_for_one_level"),
      cls: "vam-hint"
    });
    childrenHint.hidden = true;
    const totalHint = quickLimits.createEl("p", { cls: "vam-hint" });
    totalHint.setAttr("aria-live", "polite");
    let quickError = "";
    const updateTotal = (): void => {
      try {
        const layers = Number(layersInput.value),
          firstLayerCount = Number(firstInput.value),
          childrenPerParent = Number(childrenInput.value);
        childrenInput.disabled = layers === 1;
        childrenHint.hidden = !childrenInput.disabled;
        const shape = quickShape(layers, firstLayerCount, childrenPerParent);
        quickError =
          shape.total > BigInt(15)
            ? t("ui.this_would_create_0_subtopics_exceeding_the_limit_of_15_redu", shape.total.toString())
            : "";
        totalHint.setText(
          quickError || t("ui.topics_by_level_0_1_total", shape.counts.map(String).join(" → "), shape.total.toString())
        );
      } catch (error) {
        quickError = error instanceof Error ? error.message : String(error);
        totalHint.setText(quickError);
      }
      totalHint.classList.toggle("is-error", !!quickError);
    };
    layersInput.addEventListener("input", () => {
      updateTotal();
      expandButton.disabled = !!this.modelSettings?.running || (multiLayer && !!quickError);
    });
    firstInput.addEventListener("input", () => {
      updateTotal();
      expandButton.disabled = !!this.modelSettings?.running || (multiLayer && !!quickError);
    });
    childrenInput.addEventListener("input", () => {
      updateTotal();
      expandButton.disabled = !!this.modelSettings?.running || (multiLayer && !!quickError);
    });
    updateTotal();
    const shallowLabel = expandPanel.createEl("label", { cls: "vam-field vam-next-toggle" });
    const shallow = shallowLabel.createEl("input", { type: "checkbox" });
    shallow.checked = false;
    shallowLabel.createSpan({ text: t("ui.run_shallow_research_on_each_created_subtopic") });
    expandPanel.createEl("p", {
      cls: "vam-hint",
      text: t("ui.shallow_research_for_expanded_subtopics_0", researchDepthDescription("fast"))
    });
    const expandFooterText = actions.createSpan({
      text: t("ui.create_subtopics_after_confirmation_without_running_research"),
      cls: "vam-next-actions-note"
    });
    const expandButton = actions.createEl("button", {
      text: this.pendingCount ? t("ui.review_ai_subtopic_suggestions") : t("ui.get_expansion_directions"),
      cls: "mod-cta"
    });
    expandButton.dataset.topicRun = expandButton.textContent ?? "";
    expandButton.disabled = !!this.modelSettings?.running;
    expandPanel.createEl("p", { cls: "vam-next-status" });
    expandPanel.createDiv("vam-next-result");
    const consumed = (): void => {
      this.pendingCount = 0;
      setExpandMode(multiLayer);
    };
    shallow.addEventListener("change", () => {
      setExpandMode(multiLayer);
    });
    expandButton.addEventListener("click", () => {
      void this.run(
        expandPanel,
        expandButton,
        async () => {
          const selected = await sharedSources?.picker.ready();
          const options: TaskOptions = {
            referenceGroups: selected?.groups ?? [],
            outputLanguage: languageSelect.value as Settings["language"],
            requirements: this.requirements(),
            researchMode: selected?.webSearch ? "research" : "local",
            multiLayer,
            shallowResearch: shallow.checked,
            researchDepth: "fast",
            visualMode: shallow.checked && selected?.imageSearch ? "auto" : "off",
            ...(templateId() ? { detailTemplateId: templateId() } : {}),
            signal: this.taskSignal,
            onProgress: message => expandPanel.querySelector<HTMLElement>(".vam-next-status")?.setText(message)
          };
          if (multiLayer) {
            const layers = Number(layersInput.value),
              firstLayerCount = Number(firstInput.value),
              childrenPerParent = Number(childrenInput.value);
            const shape = quickShape(layers, firstLayerCount, childrenPerParent);
            if (shape.total > BigInt(15))
              throw new Error(
                t("ui.this_would_create_0_subtopics_exceeding_the_limit_of_15_redu", shape.total.toString())
              );
            options.layers = layers;
            options.firstLayerCount = firstLayerCount;
            options.childrenPerParent = layers === 1 ? 1 : childrenPerParent;
            await this.expand(
              options,
              "",
              () => {},
              (message, retryable) => {
                if (retryable === false) {
                  this.failed(expandPanel, expandButton, message);
                  expandButton.disabled = true;
                } else this.failedAi(expandPanel, expandButton, message);
              },
              () => this.close(),
              () => {
                this.taskSignal = undefined;
                this.taskController = undefined;
                this.close();
              }
            );
            return;
          }
          await this.expand(
            options,
            "",
            (items, create) => this.proposals(expandPanel, items, create, expandButton, consumed, options),
            (message, retryable) => {
              consumed();
              if (retryable === false) this.failed(expandPanel, expandButton, message);
              else this.failedAi(expandPanel, expandButton, message);
              if (retryable === false) expandButton.disabled = true;
            },
            () => this.close(),
            () => {
              this.taskSignal = undefined;
              this.taskController = undefined;
              this.close();
            }
          );
        },
        multiLayer || !this.pendingCount
      );
    });
    const synthesizePanel = this.contentEl.createDiv("vam-next-research vam-next-choice");
    synthesizePanel.createEl("p", {
      text: this.childrenCount
        ? t("ui.ai_suggests_synthesis_angles_first_the_parent_topic_changes")
        : t("ui.this_topic_has_no_direct_subtopics_you_can_choose_other_note")
    });
    {
      const pending = this.modelSettings?.synthesisPending;
      if (pending) {
        const synthStatus = synthesizePanel.createEl("p", { cls: "vam-next-status" });
        const synthResult = synthesizePanel.createDiv("vam-next-result");
        synthStatus.setText(t("ui.choose_or_edit_a_synthesis_direction_then_get_a_draft"));
        for (const item of pending.directions) {
          const choice = synthResult.createDiv("vam-next-angle");
          choice.createEl("strong", { text: item.title });
          choice.createEl("p", { text: item.contribution || item.task });
          choice.createEl("button", { text: t("ui.choose_this_direction") }).addEventListener("click", () => {
            direction.value = item.task || item.title;
          });
        }
        const direction = synthResult.createEl("textarea", {
          cls: "vam-next-focus",
          text: pending.directions[0]?.task || pending.directions[0]?.title || ""
        });
        direction.setAttr("aria-label", t("ui.synthesis_direction"));
        const draftButton = actions.createEl("button", { text: t("ui.get_synthesis_draft"), cls: "mod-cta" });
        synthAction = draftButton;
        draftButton.disabled = !!this.modelSettings?.running;
        draftButton.addEventListener("click", () =>
          this.launchSynthesis(synthesizePanel, draftButton, direction.value.trim(), signal => ({
            outputLanguage: languageSelect.value as Settings["language"],
            requirements: this.requirements(),
            researchMode: "local",
            researchDepth: this.depth,
            visualMode: "off",
            signal,
            onProgress: message => synthStatus.setText(message)
          }))
        );
        synthResult.createEl("button", { text: t("ui.discard_synthesis") }).addEventListener("click", () => {
          pending.discard();
          this.close();
        });
      } else {
        const synthesisContent = renderSynthesisContent(
          synthesizePanel,
          this.modelSettings?.sources?.synthesisTopics ?? []
        );
        synthesizePanel.createEl("p", { cls: "vam-hint", text: t("ui.synthesis_web_default_hint") });
        const synthButton = actions.createEl("button", {
          text: t("ui.get_synthesis_suggestions_first"),
          cls: "mod-cta"
        });
        synthAction = synthButton;
        synthButton.dataset.topicRun = t("ui.get_synthesis_suggestions_first");
        synthButton.disabled = !!this.modelSettings?.running;
        const synthStatus = synthesizePanel.createEl("p", { cls: "vam-next-status" });
        synthesizePanel.createDiv("vam-next-result");
        synthButton.addEventListener("click", () =>
          this.launchSynthesis(synthesizePanel, synthButton, null, async signal => {
            const content: SynthesisContent = synthesisContent.value === "summary" ? "summary" : "full";
            synthesisContent.disabled = true;
            const selected = await sharedSources?.picker.ready();
            const options: TaskOptions = {
              synthesisContent: content,
              referenceGroups: selected?.groups ?? [],
              outputLanguage: languageSelect.value as Settings["language"],
              requirements: this.requirements(),
              researchMode: selected?.webSearch ? "research" : "local",
              researchDepth: this.depth,
              visualMode: selected?.imageSearch ? "auto" : "off",
              ...(templateId() ? { detailTemplateId: templateId() } : {}),
              signal,
              onProgress: message => synthStatus.setText(message)
            };
            if (!this.childrenCount && !options.referenceGroups?.some(group => group.documents.length))
              throw new Error(t("ui.choose_another_note_source_first"));
            return options;
          })
        );
      }
    }
    const sharedSources = this.addReferencePicker(this.contentEl);
    show = mode => {
      for (const [name, button, panel] of [
        ["research", researchCard, research],
        ["expand", expandCard, expandPanel],
        ["synthesize", synthesizeCard, synthesizePanel]
      ] as const) {
        button.classList.toggle("is-active", name === mode);
        button.setAttr("aria-checked", name === mode ? "true" : "false");
        button.tabIndex = name === mode ? 0 : -1;
        panel.style.display = name === mode ? "" : "none";
      }
      sharedSources?.forMode(mode);
      // A pending synthesis draft uses only the chosen direction, so it has no sources to pick.
      if (sharedSources)
        sharedSources.disclosure.hidden = mode === "synthesize" && !!this.modelSettings?.synthesisPending;
      confirm.hidden = mode !== "research";
      expandButton.hidden = mode !== "expand";
      expandFooterText.hidden = mode !== "expand";
      if (synthAction) synthAction.hidden = mode !== "synthesize";
    };
    this.renderRequirements();
    const output = this.contentEl.createEl("details", { cls: "vam-next-output" });
    output.open = false;
    const outputSummary = output.createEl("summary").createSpan({ cls: "vam-next-source-summary-row" });
    outputSummary.createEl("strong", { text: t("ui.output_settings") });
    const outputValue = outputSummary.createSpan({ cls: "vam-next-source-summary" });
    const compactSettings = output.createDiv("vam-next-compact-settings");
    const languageLabel = compactSettings.createEl("label", { cls: "vam-next-language" });
    languageLabel.createSpan({ text: t("ui.output_language") });
    const languageSelect = languageLabel.createEl("select");
    languageSelect.createEl("option", { value: "zh-TW", text: "繁體中文" });
    languageSelect.createEl("option", { value: "en", text: "English" });
    languageSelect.value = this.plugin.settings.language;
    languageSelect.setAttr("aria-label", t("ui.output_language"));
    const templateId = templateField(
      compactSettings,
      this.modelSettings?.templates ?? [],
      t("ui.detail_template_keep_0", this.modelSettings?.currentTemplate ?? "")
    );
    const describeOutput = (): void =>
      outputValue.setText(
        [languageSelect.value === "en" ? "English" : "繁體中文", this.modelSettings?.currentTemplate]
          .filter(Boolean)
          .join(" · ")
      );
    languageSelect.addEventListener("change", describeOutput);
    describeOutput();
    show(initialMode);
    cardFor[initialMode].focus();
    this.renderModelSettings();
    this.contentEl.createEl("p", {
      text: t("ui.if_an_ai_task_exceeds_3_minutes_vam_attempts_to_interrupt_it"),
      cls: "vam-hint"
    });
  }
}
export class AiDraftModal extends Modal {
  constructor(
    app: App,
    private summary: string,
    private detail: string,
    private confirmLabel: string,
    private confirm: () => void
  ) {
    super(app);
  }
  onOpen(): void {
    this.titleEl.setText(t("ui.review_synthesis_draft"));
    this.contentEl.createEl("strong", { text: t("ui.current_understanding") });
    this.contentEl.createEl("p", { text: this.summary });
    this.contentEl.createEl("strong", { text: t("ui.markdown_detail_draft") });
    const detail = this.contentEl.createEl("textarea", { cls: "vam-task-input", text: this.detail });
    detail.rows = 18;
    detail.readOnly = true;
    new Setting(this.contentEl)
      .addButton(button => button.setButtonText(t("ui.cancel")).onClick(() => this.close()))
      .addButton(button =>
        button
          .setButtonText(this.confirmLabel)
          .setCta()
          .onClick(() => {
            this.close();
            this.confirm();
          })
      );
  }
}
export class SynthesisDraftModal extends Modal {
  constructor(
    app: App,
    private summary: string,
    private detail: string,
    private confirm: (summary: string, detail: string) => Promise<void>,
    private discard: () => void
  ) {
    super(app);
  }
  onOpen(): void {
    this.titleEl.setText(t("ui.review_synthesis_draft"));
    this.contentEl.createEl("strong", { text: t("ui.current_understanding") });
    const summary = this.contentEl.createEl("textarea", { cls: "vam-task-input", text: this.summary });
    summary.rows = 4;
    summary.setAttr("aria-label", t("ui.current_understanding"));
    this.contentEl.createEl("strong", { text: t("ui.markdown_detail_draft") });
    const detail = this.contentEl.createEl("textarea", { cls: "vam-task-input", text: this.detail });
    detail.rows = 16;
    detail.setAttr("aria-label", t("ui.markdown_detail_draft"));
    const status = this.contentEl.createEl("p", { cls: "vam-next-status" });
    new Setting(this.contentEl)
      .addButton(button => button.setButtonText(t("ui.cancel")).onClick(() => this.close()))
      .addButton(button =>
        button.setButtonText(t("ui.discard_synthesis")).onClick(() => {
          this.discard();
          this.close();
        })
      )
      .addButton(button =>
        button
          .setButtonText(t("ui.confirm_update_to_parent_topic"))
          .setCta()
          .onClick(() => {
            button.setDisabled(true);
            void this.confirm(summary.value, detail.value).then(
              () => this.close(),
              error => {
                status.setText(error instanceof Error ? error.message : String(error));
                button.setDisabled(false);
              }
            );
          })
      );
  }
}
export class ChildProposalModal extends Modal {
  constructor(
    app: App,
    private suggestions: Suggestion[],
    private submit: (items: Suggestion[]) => void
  ) {
    super(app);
  }
  onOpen(): void {
    this.titleEl.setText(t("ui.ai_subtopic_proposals"));
    this.contentEl.createEl("p", { text: t("ui.select_subtopics_to_create_you_can_edit_their_names_and_task") });
    const rows: {
      item: Suggestion;
      check: HTMLInputElement;
      title: HTMLInputElement;
      task: HTMLTextAreaElement;
      contribution: HTMLTextAreaElement;
    }[] = [];
    for (const item of this.suggestions) {
      const row = this.contentEl.createDiv("vam-proposal");
      if (item.parentTitle) row.createEl("p", { text: t("ui.child_of_0", item.parentTitle) });
      const check = row.createEl("input", { type: "checkbox" });
      check.checked = true;
      check.setAttr("aria-label", t("ui.select_proposal_0", item.title));
      const titleField = row.createEl("label", { cls: "vam-proposal-field" });
      titleField.createSpan({ text: t("ui.subtopic_name") });
      const title = titleField.createEl("input", { type: "text", value: item.title });
      title.setAttr("aria-label", t("ui.proposal_name"));
      const taskField = row.createEl("label", { cls: "vam-proposal-field" });
      taskField.createSpan({ text: t("ui.research_task") });
      const task = taskField.createEl("textarea", { text: item.task });
      task.rows = 2;
      task.setAttr("aria-label", t("ui.proposal_task"));
      const contributionField = row.createEl("label", { cls: "vam-proposal-field" });
      contributionField.createSpan({ text: t("ui.contribution_to_the_parent_topic") });
      const contribution = contributionField.createEl("textarea", { text: item.contribution });
      contribution.rows = 2;
      contribution.placeholder = t("ui.contribution_to_the_parent_topic");
      contribution.setAttr("aria-label", t("ui.contribution_to_the_parent_topic"));
      rows.push({ item, check, title, task, contribution });
    }
    new Setting(this.contentEl)
      .addButton(b => b.setButtonText(t("ui.cancel")).onClick(() => this.close()))
      .addButton(b =>
        b
          .setButtonText(t("ui.create_subtopics"))
          .setCta()
          .onClick(() => {
            const selected = rows.filter(row => row.check.checked && row.title.value.trim());
            const renamed = new Map(
              selected.filter(row => !row.item.parentTitle).map(row => [row.item.title, row.title.value.trim()])
            );
            const rootNames = selected.filter(row => !row.item.parentTitle).map(row => row.title.value.trim());
            if (new Set(rootNames).size !== rootNames.length) {
              new Notice(t("ui.first_level_topic_names_must_be_unique"));
              return;
            }
            if (selected.some(row => row.item.parentTitle && !renamed.has(row.item.parentTitle))) {
              new Notice(t("ui.select_the_parent_topic_before_its_child"));
              return;
            }
            this.close();
            this.submit(
              selected.map(row => ({
                title: row.title.value.trim(),
                task: row.task.value.trim(),
                contribution: row.contribution.value.trim(),
                parentTitle: row.item.parentTitle ? renamed.get(row.item.parentTitle)! : ""
              }))
            );
          })
      );
  }
}
export class IntegrationModal extends Modal {
  constructor(
    app: App,
    private names: string[],
    _defaultRules: string,
    private submit: (title: string, goal: string, rules: string) => void
  ) {
    super(app);
  }
  onOpen(): void {
    this.titleEl.setText(t("ui.confirm_topic_synthesis"));
    this.contentEl.createEl("p", {
      text: t("ui.synthesize_0_source_topics_ai_reads_their_full_knowledge_and", this.names.length),
      cls: "vam-modal-intro"
    });
    const sources = this.contentEl.createDiv("vam-integration-sources");
    sources.createEl("strong", { text: t("ui.source_topics") });
    for (const name of this.names) sources.createDiv({ text: name });
    const titleLabel = this.contentEl.createEl("label", { cls: "vam-field" });
    titleLabel.createSpan({ text: t("ui.new_topic_name") });
    const title = titleLabel.createEl("input", { type: "text", value: t("ui.synthesize_topics") });
    title.setAttr("aria-label", t("ui.new_topic_name"));
    const goalLabel = this.contentEl.createEl("label", { cls: "vam-field" });
    goalLabel.createSpan({ text: t("ui.synthesis_goal") });
    const goal = goalLabel.createEl("textarea", {
      text: t("ui.identify_shared_conclusions_key_differences_tradeoffs_and_ne")
    });
    goal.rows = 4;
    goal.setAttr("aria-label", t("ui.synthesis_goal"));
    const save = (): void => {
      if (!title.value.trim() || !goal.value.trim()) return;
      this.close();
      this.submit(title.value.trim(), goal.value.trim(), "");
    };
    new Setting(this.contentEl)
      .addButton(button => button.setButtonText(t("ui.cancel")).onClick(() => this.close()))
      .addButton(button => button.setButtonText(t("ui.next_set_ai_sources")).setCta().onClick(save));
    title.focus();
    title.select();
  }
}
export class MapConflictModal extends Modal {
  private settled = false;
  constructor(
    app: App,
    private local: MapDocument,
    private disk: MapDocument,
    private resolve: (map: MapDocument) => void
  ) {
    super(app);
  }
  onOpen(): void {
    this.titleEl.setText(t("ui.mind_map_changed_externally"));
    this.contentEl.createEl("p", { text: t("ui.both_the_map_and_map_md_have_changed_choose_a_version_or_edi") });
    const input = this.contentEl.createEl("textarea", {
      cls: "vam-task-input",
      text: JSON.stringify(this.disk, null, 2)
    });
    input.rows = 16;
    const finish = (map: MapDocument): void => {
      this.settled = true;
      this.close();
      this.resolve(map);
    };
    new Setting(this.contentEl)
      .addButton(button => button.setButtonText(t("ui.use_file_contents")).onClick(() => finish(clone(this.disk))))
      .addButton(button => button.setButtonText(t("ui.keep_editor_contents")).onClick(() => finish(clone(this.local))))
      .addButton(button =>
        button
          .setButtonText(t("ui.save_merged_contents"))
          .setCta()
          .onClick(() => {
            try {
              finish(parseMap(serializeMap(JSON.parse(input.value) as MapDocument)));
            } catch (error) {
              new Notice(
                error instanceof Error
                  ? t("ui.invalid_merged_contents_0", error.message)
                  : t("ui.invalid_merged_contents")
              );
            }
          })
      );
  }
  onClose(): void {
    if (!this.settled) this.resolve(clone(this.disk));
  }
}
export class NoteCollectionModal extends Modal {
  constructor(
    app: App,
    private titleText: string,
    private files: TFile[],
    private actions: { label: string; run: (file: TFile) => void }[]
  ) {
    super(app);
  }
  onOpen(): void {
    this.titleEl.setText(this.titleText);
    if (!this.files.length) this.contentEl.createEl("p", { text: t("ui.no_notes_yet") });
    for (const file of this.files) {
      const row = this.contentEl.createDiv("vam-collection-row");
      row.createSpan({ text: file.basename });
      const actions = row.createDiv("vam-collection-actions");
      for (const action of this.actions)
        actions.createEl("button", { text: action.label }).addEventListener("click", () => {
          this.close();
          action.run(file);
        });
    }
    new Setting(this.contentEl).addButton(button => button.setButtonText(t("ui.close")).onClick(() => this.close()));
  }
}
export class TopicPickerModal extends Modal {
  constructor(
    app: App,
    private titleText: string,
    private topics: TopicInfo[],
    private choose: (topic: TopicInfo) => void
  ) {
    super(app);
  }
  onOpen(): void {
    this.titleEl.setText(this.titleText);
    for (const topic of this.topics)
      new Setting(this.contentEl)
        .setName(topic.title)
        .setDesc(topic.root)
        .addButton(button =>
          button.setButtonText(t("ui.select")).onClick(() => {
            this.close();
            this.choose(topic);
          })
        );
    if (!this.topics.length) this.contentEl.createEl("p", { text: t("ui.no_other_topics") });
    new Setting(this.contentEl).addButton(button => button.setButtonText(t("ui.cancel")).onClick(() => this.close()));
  }
}
