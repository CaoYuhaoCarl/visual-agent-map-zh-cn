import { renderTemplate } from "../../../core/step-runner";
import { inLanguage } from "../../../core/steps/_shared/fragments";
import { getUiLanguage, uiLocale } from "../../../i18n";
import searchBudgetExhaustedEn from "./search-budget-exhausted.en.md";
import searchBudgetExhaustedZh from "./search-budget-exhausted.zh.md";
import searchBudgetExhaustedCn from "./search-budget-exhausted.zh-CN.md";

/**
 * Steering messages the runtime sends into a turn that is already running. They are not steps: nothing is
 * rendered up front and no reply is parsed. Their text lives in Markdown files next to this module.
 */
export function searchBudgetExhaustedMessage(language: string = getUiLanguage()): string {
  return renderTemplate(
    inLanguage(
      { zh: searchBudgetExhaustedZh, en: searchBudgetExhaustedEn, cn: searchBudgetExhaustedCn },
      uiLocale(language)
    ),
    {}
  );
}
