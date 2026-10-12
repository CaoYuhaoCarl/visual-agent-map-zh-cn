import { renderTemplate } from "../../../../core/step-runner";
import plannerCoverageRule from "./planner-coverage-rule.md";
import searcherTargetRule from "./searcher-target-rule.md";
import userQuestionRule from "./user-question-rule.md";
import floorAskRule from "./floor-ask-rule.md";
import outcomeExpectationRule from "./outcome-expectation-rule.md";
import evidenceLookupRule from "./evidence-lookup-rule.md";
import evidenceLookupFieldRule from "./evidence-lookup-field-rule.md";
import evidenceLookupFollowup from "./evidence-lookup-followup.md";
import topicRootAnswer from "./topic-root-answer.md";
import passageReference from "./passage-reference.md";
import reuseTargetExpectedValue from "./reuse-target-expected-value.md";
import reuseTargetValidityReason from "./reuse-target-validity-reason.md";

/** Rule text shared by several AIM phases. Each is a Markdown file whose own trailing newline is removed. */
const text = (template: string): string => renderTemplate(template, {});

export const PLANNER_COVERAGE_RULE = text(plannerCoverageRule);
export const SEARCHER_TARGET_RULE = text(searcherTargetRule);
/** Every question goes to the user, so it must be about their goal, not about this workflow. */
export const USER_QUESTION_RULE = text(userQuestionRule);
export const FLOOR_ASK_RULE = text(floorAskRule);
export const OUTCOME_EXPECTATION_RULE = text(outcomeExpectationRule);
export const EVIDENCE_LOOKUP_RULE = text(evidenceLookupRule);
/** Same lookup rule for phases whose response schema carries aim.evidenceRequestIds. */
export const EVIDENCE_LOOKUP_FIELD_RULE = text(evidenceLookupFieldRule);

/** Answer description of a branch whose question node is the topic root; it feeds the source fingerprint, so its bytes are fixed. */
export const TOPIC_ROOT_ANSWER = text(topicRootAnswer);
/** Stored on a synthesized reuse target in the plan (sent to the evidence-reuse audit and shown in the UI); persisted values must stay byte-identical. */
export const REUSE_TARGET_EXPECTED_VALUE = text(reuseTargetExpectedValue);
export const REUSE_TARGET_VALIDITY_REASON = text(reuseTargetValidityReason);
/** Replaces a long passage that already appears elsewhere in the same request. */
export const PASSAGE_REFERENCE = text(passageReference);
/** Appends the full text of the evidence a phase asked to look up to that phase's own task. */
export const renderEvidenceLookupFollowup = (task: string, evidence: string): string =>
  renderTemplate(evidenceLookupFollowup, { task, evidence });
