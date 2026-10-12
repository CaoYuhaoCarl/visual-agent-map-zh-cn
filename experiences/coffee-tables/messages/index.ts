import { renderTemplate } from "../../../core/step-runner";
import steerComment from "./steer-comment.en.md";
import steerGuestQuestion from "./steer-guest-question.en.md";
import steerRedirect from "./steer-redirect.en.md";

/**
 * Steering lines the engine sends into a Coffee Tables turn that is already running (through the runtime's
 * `registerIntervention` hook). They are not steps: nothing is parsed from a reply. The text is English in every
 * interface language, as it was when it was inline, and lives in Markdown files next to this module.
 */
export function steerCommentMessage(text: string): string {
  return renderTemplate(steerComment, { text });
}

/** `target` is the guest the user addressed; without one the question goes to "a guest". */
export function steerGuestQuestionMessage(text: string, target?: string): string {
  return renderTemplate(steerGuestQuestion, { who: target || "a guest", text });
}

export function steerRedirectMessage(text: string): string {
  return renderTemplate(steerRedirect, { text });
}
