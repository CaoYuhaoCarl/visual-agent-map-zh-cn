/**
 * Budget limits of the AIM flow. Production uses DEFAULT_AIM_FLOW_LIMITS and nothing in settings, UI or the
 * shipped bundle can change them. Tests inject other values through the AimManualFlow constructor, and the
 * smoke build (tests/smoke/build-smoke.mjs) replaces this whole module with tests/smoke/flow-limits.smoke.ts.
 */
export interface AimFlowLimits {
  /** Answered user questions required before the Planner may conclude. */
  readonly minAnsweredBeforeConclusion: number;
  /** Research turns before the budget is exhausted. */
  readonly maxResearchTurns: number;
  /** Concurrent subtopic research tasks when the plan declares its dependencies. */
  readonly researchParallelism: number;
  /** Whether research and final-delivery research phases may use provider web search. */
  readonly webSearch: boolean;
  /**
   * When the last research turn still asks for more research, continue with the evidence gathered instead of
   * saving a partial result. Only changes that exit; no parser or acceptance check is relaxed.
   */
  readonly acceptGapAtBudget: boolean;
  /**
   * Smoke only. When final delivery acceptance still asks for more research and the budget is spent, publish the
   * delivery as the conclusion, labelled profile=smoke and with the rejection reason kept. No parser is relaxed.
   */
  readonly publishDeliveryAtBudget: boolean;
}

export const DEFAULT_AIM_FLOW_LIMITS: AimFlowLimits = Object.freeze({
  minAnsweredBeforeConclusion: 3,
  maxResearchTurns: 2,
  researchParallelism: 2,
  webSearch: true,
  acceptGapAtBudget: false,
  publishDeliveryAtBudget: false
});

/** Limits the flow uses unless a test injects others; the smoke build swaps this module for its own. */
export const ACTIVE_AIM_FLOW_LIMITS: AimFlowLimits = DEFAULT_AIM_FLOW_LIMITS;

/** Production has nothing to announce; the smoke build's module shows a visible notice that test overrides are active. */
export const announceTestOverrides = (_notify: (message: string) => void): void => {};
