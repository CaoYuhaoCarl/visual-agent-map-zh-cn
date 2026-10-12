import { stepLabel, type StepProvider } from "../../core/step-runner";
import type { CoffeeRequest, CoffeeRuntime } from "./types";

/** Per-call controls the engine hands to the provider: the session, abort signal and streaming hooks. */
export type CoffeeStepControls = Omit<CoffeeRequest, "prompt" | "step">;

/**
 * The only place in Coffee Tables that invokes the model runtime. It forwards the prompt and controls unchanged
 * (abort, streaming and intervention hooks stay with the runtime) and tags the request with `stepId@version`.
 */
export function coffeeStepProvider(runtime: CoffeeRuntime): StepProvider<CoffeeStepControls> {
  return {
    complete: call =>
      runtime({
        ...call.controls,
        prompt: call.prompt,
        step: stepLabel({ id: call.stepId, version: call.version })
      })
  };
}
