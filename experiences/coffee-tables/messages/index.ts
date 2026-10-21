import { renderTemplate } from "../../../core/step-runner";
import steerComment from "./steer-comment.en.md";
import steerGuestQuestion from "./steer-guest-question.en.md";
import steerRedirect from "./steer-redirect.en.md";
import steerCommentCN from "./steer-comment.zh-CN.md";
import steerGuestQuestionCN from "./steer-guest-question.zh-CN.md";
import steerRedirectCN from "./steer-redirect.zh-CN.md";

/**
 * Steering lines the engine sends into a Coffee Tables turn that is already running (through the runtime's
 * `registerIntervention` hook). They are not steps: nothing is parsed from a reply.
 * English and zh-TW retain their original English text; zh-CN uses static Simplified Chinese resources.
 */
export function steerCommentMessage(text: string, language = "en"): string {
  return renderTemplate(language === "zh-CN" ? steerCommentCN : steerComment, { text });
}

/** `target` is the guest the user addressed; without one the question goes to "a guest". */
export function steerGuestQuestionMessage(text: string, target?: string, language = "en"): string {
  return renderTemplate(language === "zh-CN" ? steerGuestQuestionCN : steerGuestQuestion, {
    who: target || (language === "zh-CN" ? "一位嘉宾" : "a guest"),
    text
  });
}

export function steerRedirectMessage(text: string, language = "en"): string {
  return renderTemplate(language === "zh-CN" ? steerRedirectCN : steerRedirect, { text });
}
