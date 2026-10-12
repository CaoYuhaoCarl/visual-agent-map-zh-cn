import { renderTemplate } from "../../../../core/step-runner";
import plannerCoverageRule from "./planner-coverage-rule.md";
import searcherTargetRule from "./searcher-target-rule.md";
import userQuestionRule from "./user-question-rule.md";
import floorAskRule from "./floor-ask-rule.md";
import outcomeExpectationRule from "./outcome-expectation-rule.md";
import evidenceLookupRule from "./evidence-lookup-rule.md";
import evidenceLookupFieldRule from "./evidence-lookup-field-rule.md";

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
