import { randomUUID } from "node:crypto";
import type { AiExchangeLog } from "../ai-exchange-log";
import { providerForModel, providerModelId } from "../ai/providers/provider";
import type { ClaudeCodeCliRuntime, ClaudeTaskControls } from "../ai/runtime/claude-code-cli";
import type { CodexAppServerRuntime } from "../ai/runtime/codex-app-server";
import { stepLabel, type StepProvider } from "./step-runner";

/** Everything the Claude and Codex runtimes accept as per-call controls (abort, streaming, steering, timeouts). */
export type RuntimeTaskControls = ClaudeTaskControls & NonNullable<Parameters<CodexAppServerRuntime["runTask"]>[4]>;

/** The per-call controls a step hands to {@link runtimeStepProvider}. */
export interface RuntimeStepControls {
  /** Model id as stored in settings; a `claude:` prefix selects Claude Code, anything else Codex. */
  model: string;
  effort: string;
  /** Exchange log title for this call, for example `Reframing · <question>`. */
  topic: string;
  mode?: string;
  /** Forwarded to `runTask` unchanged (`signal`, `onText`, `onSteer`, `textOnly`, ...); `onRequest` is chained, not replaced. */
  task?: RuntimeTaskControls;
  /**
   * Who ends the exchange log entry after the reply arrives. "completed" (default): the provider logs `completed`
   * and, on a runtime error, `failed` with the error message. "caller": the provider stops after `received` and logs
   * nothing on error (it rethrows); the caller finishes the entry with `parsed`, `completed` or `failed` and its own
   * message, using the id from `onExchange`.
   */
  finish?: "completed" | "caller";
  /** Receives the exchange log id once the entry exists, so the caller can mark a later parse failure with `failed`. */
  onExchange?: (id: string) => void;
  /**
   * What the exchange log stores as the sent request. "request-and-prompt" (default): `{ request, prompt }`.
   * "request": only the runtime's request object, as callers that logged it before steps existed did.
   */
  requestLog?: "request-and-prompt" | "request";
}

/** The part of the exchange log the provider writes; a caller can pass a guarded view of the real log. */
export type ExchangeSink = Pick<AiExchangeLog, "begin" | "sent" | "received" | "completed" | "failed">;

export interface RuntimeStepProviderOptions {
  claude: () => Pick<ClaudeCodeCliRuntime, "runTask">;
  /** `local` selects the runtime without web search, matching `AiTaskServiceOptions.codexRuntime`. */
  codex: (local: boolean) => Pick<CodexAppServerRuntime, "runTask">;
  /** The exchange log, or null when exchange logging is off. Read per call so a settings change applies at once. */
  exchanges: () => ExchangeSink | null;
  /** Use the Codex runtime without web search. Steps that only transform supplied text set this. */
  localCodex?: boolean;
}

/**
 * The one adapter from a Step Runner call to the Claude or Codex runtime. It routes by model, passes the step's
 * schema as the response schema, forwards the controls unchanged, and records the exchange with the
 * `stepId@version` label so the AI exchange log shows which step produced the prompt.
 *
 * A reply that arrives is logged as received and completed; the provider cannot see the step's parser, so a caller
 * whose parse can still fail uses `onExchange` to mark the entry failed.
 */
export function runtimeStepProvider(options: RuntimeStepProviderOptions): StepProvider<RuntimeStepControls> {
  return {
    async complete(call) {
      const {
        model,
        effort,
        topic,
        mode = "task",
        task = {},
        onExchange,
        finish = "completed",
        requestLog = "request-and-prompt"
      } = call.controls;
      const exchanges = options.exchanges();
      const id = randomUUID();
      exchanges?.begin({
        id,
        startedAt: new Date().toISOString(),
        topic,
        mode,
        model,
        effort,
        step: stepLabel({ id: call.stepId, version: call.version })
      });
      if (exchanges) onExchange?.(id);
      try {
        const controls: RuntimeTaskControls = {
          ...task,
          onRequest: (data: unknown): void => {
            task.onRequest?.(data);
            exchanges?.sent(
              id,
              JSON.stringify(requestLog === "request" ? data : { request: data, prompt: call.prompt }, null, 2),
              call.prompt
            );
          }
        };
        const raw =
          providerForModel(model) === "claude"
            ? await options.claude().runTask(call.prompt, providerModelId(model), effort, call.schema, controls)
            : await options
                .codex(options.localCodex === true)
                .runTask(call.prompt, model, effort, call.schema, controls);
        exchanges?.received(id, raw);
        if (finish === "completed") exchanges?.completed(id);
        return raw;
      } catch (error) {
        if (finish === "completed") exchanges?.failed(id, error instanceof Error ? error.message : String(error));
        throw error;
      }
    }
  };
}
