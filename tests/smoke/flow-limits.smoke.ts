/**
 * Smoke replacement for experiences/aim/flow-limits.ts. Only tests/smoke/build-smoke.mjs aliases this module in,
 * and only into a bundle written outside the repository; the production main.js never contains it.
 * Prompts are not shortened: only the budget numbers the templates already embed differ (see PROMPT_LOGIC.md).
 */
export interface AimFlowLimits {
  readonly minAnsweredBeforeConclusion: number;
  readonly maxResearchTurns: number;
  readonly researchParallelism: number;
  readonly webSearch: boolean;
  readonly acceptGapAtBudget: boolean;
  readonly publishDeliveryAtBudget: boolean;
}

/** Same values as production: constants derived from the defaults (view.ts floor hint, scheduler default) stay unchanged. */
export const DEFAULT_AIM_FLOW_LIMITS: AimFlowLimits = Object.freeze({
  minAnsweredBeforeConclusion: 3,
  maxResearchTurns: 2,
  researchParallelism: 2,
  webSearch: true,
  acceptGapAtBudget: false,
  publishDeliveryAtBudget: false
});

/** Injected by esbuild `define` per smoke case; absent (for example in L1 tests) means web search on. */
declare const __VAM_SMOKE_WEB_SEARCH__: boolean | undefined;

export const SMOKE_PROFILE_MARKER = "VAM_SMOKE_PROFILE_ACTIVE";

export const SMOKE_AIM_FLOW_LIMITS: AimFlowLimits = Object.freeze({
  minAnsweredBeforeConclusion: 1,
  maxResearchTurns: 2,
  researchParallelism: 1,
  webSearch: typeof __VAM_SMOKE_WEB_SEARCH__ === "boolean" ? __VAM_SMOKE_WEB_SEARCH__ : true,
  acceptGapAtBudget: true,
  publishDeliveryAtBudget: true
});

export const ACTIVE_AIM_FLOW_LIMITS: AimFlowLimits = SMOKE_AIM_FLOW_LIMITS;

export const announceTestOverrides = (notify: (message: string) => void): void => {
  notify(
    `Test overrides active [profile=smoke, ${SMOKE_PROFILE_MARKER}]: AIM needs ${SMOKE_AIM_FLOW_LIMITS.minAnsweredBeforeConclusion} answer, ` +
      `${SMOKE_AIM_FLOW_LIMITS.researchParallelism} parallel task, web search ${SMOKE_AIM_FLOW_LIMITS.webSearch ? "on" : "off"}. ` +
      "Results are smoke evidence, not a full E2E PASS."
  );
};
