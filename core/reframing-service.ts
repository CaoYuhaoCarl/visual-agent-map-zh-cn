import { translate, uiLocale } from "../i18n";
import { randomUUID } from "node:crypto";
import { CLAUDE_MODEL_CHOICES } from "../ai/providers/provider";
import type { AiTaskServiceOptions } from "./ai-task-service";
import { runtimeStepProvider, type RuntimeStepControls } from "./runtime-step-provider";
import { prepareStep, StepRunner, type PreparedStep } from "./step-runner";
import {
  parseReframeDraft,
  REFRAME_SCHEMA,
  REFRAME_TOKEN_BUDGET,
  reframeStep,
  type ReframeDraft,
  type ReframeRequest
} from "./steps/reframe/step";

export { parseReframeDraft, REFRAME_SCHEMA, REFRAME_TOKEN_BUDGET };
export type { ReframeDraft, ReframeRequest };
export type PreparedReframe = PreparedStep<ReframeRequest, ReframeDraft>;
/**
 * `prompt` and `schema` are those of `prepared`; `prepared` is what a runner that calls a model must send
 * (`StepRunner.send` accepts nothing else).
 */
export type ReframeRunner = (
  request: ReframeRequest,
  prompt: string,
  schema: unknown,
  signal: AbortSignal,
  prepared: PreparedReframe
) => Promise<string>;
export function buildReframePrompt(request: ReframeRequest): string {
  return reframeStep.render(request);
}
export function providerReframeRunner(
  options: AiTaskServiceOptions,
  activeTasks: Map<string, AbortController>
): ReframeRunner {
  return async (request, _prompt, _schema, signal, prepared) => {
    const key = `reframe:${randomUUID()}`,
      controller = new AbortController();
    const abort = (): void => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) controller.abort();
    activeTasks.set(key, controller);
    const effort = request.reasoning === "auto" ? "low" : request.reasoning;
    // A reply that arrives after the stop is refused before the provider logs it as received.
    const refuseIfStopped = (): void => {
      if (controller.signal.aborted) throw new Error("Reframing stopped");
    };
    const log = (): ReturnType<AiTaskServiceOptions["exchanges"]> =>
      options.exchangeLoggingEnabled() ? options.exchanges() : null;
    const provider = runtimeStepProvider({
      claude: () => ({
        runTask: async (prompt, model, level, schema, controls) => {
          if (!CLAUDE_MODEL_CHOICES.some(choice => choice.id === request.model))
            throw new Error("Unsupported Claude model");
          const raw = await options
            .claudeRuntime(options.pluginDirectory())
            .runTask(prompt, model, level, schema, controls);
          refuseIfStopped();
          return raw;
        }
      }),
      codex: local => ({
        runTask: async (prompt, model, level, schema, controls) => {
          const raw = await options
            .codexRuntime(options.pluginDirectory(), local)
            .runTask(prompt, model, level, schema, controls);
          refuseIfStopped();
          return raw;
        }
      }),
      exchanges: log,
      localCodex: true
    });
    let id: string | undefined;
    const controls: RuntimeStepControls = {
      model: request.model,
      effort,
      topic: `Reframing · ${request.question}`,
      finish: "caller",
      onExchange: exchangeId => {
        id = exchangeId;
      },
      task: { textOnly: true, searchBudget: 0, signal: controller.signal }
    };
    try {
      const { raw } = await new StepRunner(provider).send(prepared, controls);
      prepared.parse(raw);
      if (id) {
        log()?.parsed(id);
        log()?.completed(id);
      }
      return raw;
    } catch (error) {
      if (id) log()?.failed(id, error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      signal.removeEventListener("abort", abort);
      activeTasks.delete(key);
    }
  };
}
export class ReframingService {
  constructor(private readonly run: ReframeRunner) {}
  async reframe(request: ReframeRequest, signal: AbortSignal): Promise<ReframeDraft> {
    const checkCancelled = (): void => {
      if (signal.aborted) throw new Error(translate(uiLocale(request.language), "error.reframing_stopped"));
    };
    checkCancelled();
    if (request.targetCore !== "understand") throw new Error("Unsupported reframing target");
    const prepared = prepareStep(reframeStep, request);
    const raw = await this.run(request, prepared.prompt, REFRAME_SCHEMA, signal, prepared);
    checkCancelled();
    return prepared.parse(raw);
  }
}
