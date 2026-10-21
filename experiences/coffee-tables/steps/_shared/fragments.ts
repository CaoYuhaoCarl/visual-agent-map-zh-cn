import { renderTemplate } from "../../../../core/step-runner";
import observerFormatTemplate from "./observer-format.md";
import observerFormatTemplateCN from "./observer-format.zh-CN.md";
import builtinStyleCN from "./builtin-style.zh-CN.md";
import InsightUpdateFooterZH from "./insight-update-footer.zh.md";
import InsightUpdateFooterEN from "./insight-update-footer.en.md";
import InsightUpdateFooterCN from "./insight-update-footer.zh-CN.md";
import ObserverTitlesZH from "./observer-titles.zh.md";
import ObserverTitlesEN from "./observer-titles.en.md";
import ObserverTitlesCN from "./observer-titles.zh-CN.md";
import ObserverSourceZH from "./observer-source.zh.md";
import ObserverSourceEN from "./observer-source.en.md";
import ObserverSourceCN from "./observer-source.zh-CN.md";
import ObserverRefreshOnlyZH from "./observer-refresh-only.zh.md";
import ObserverRefreshOnlyEN from "./observer-refresh-only.en.md";
import ObserverRefreshOnlyCN from "./observer-refresh-only.zh-CN.md";
import SegmentSummaryZH from "./segment-summary.zh.md";
import SegmentSummaryEN from "./segment-summary.en.md";
import SegmentSummaryCN from "./segment-summary.zh-CN.md";
import MergeLevelDetailedZH from "./merge-level-detailed.zh.md";
import MergeLevelDetailedEN from "./merge-level-detailed.en.md";
import MergeLevelDetailedCN from "./merge-level-detailed.zh-CN.md";
import MergeLevelBalancedZH from "./merge-level-balanced.zh.md";
import MergeLevelBalancedEN from "./merge-level-balanced.en.md";
import MergeLevelBalancedCN from "./merge-level-balanced.zh-CN.md";
import MergeLevelCompactZH from "./merge-level-compact.zh.md";
import MergeLevelCompactEN from "./merge-level-compact.en.md";
import MergeLevelCompactCN from "./merge-level-compact.zh-CN.md";
import DetailLevelBriefZH from "./detail-level-brief.zh.md";
import DetailLevelBriefEN from "./detail-level-brief.en.md";
import DetailLevelBriefCN from "./detail-level-brief.zh-CN.md";
import DetailLevelStandardZH from "./detail-level-standard.zh.md";
import DetailLevelStandardEN from "./detail-level-standard.en.md";
import DetailLevelStandardCN from "./detail-level-standard.zh-CN.md";
import DetailLevelDetailedZH from "./detail-level-detailed.zh.md";
import DetailLevelDetailedEN from "./detail-level-detailed.en.md";
import DetailLevelDetailedCN from "./detail-level-detailed.zh-CN.md";
import GuidanceMergeDetailedZH from "./guidance-merge-detailed.zh.md";
import GuidanceMergeDetailedEN from "./guidance-merge-detailed.en.md";
import GuidanceMergeDetailedCN from "./guidance-merge-detailed.zh-CN.md";
import GuidanceMergeBalancedZH from "./guidance-merge-balanced.zh.md";
import GuidanceMergeBalancedEN from "./guidance-merge-balanced.en.md";
import GuidanceMergeBalancedCN from "./guidance-merge-balanced.zh-CN.md";
import GuidanceMergeCompactZH from "./guidance-merge-compact.zh.md";
import GuidanceMergeCompactEN from "./guidance-merge-compact.en.md";
import GuidanceMergeCompactCN from "./guidance-merge-compact.zh-CN.md";
import GuidanceDetailBriefZH from "./guidance-detail-brief.zh.md";
import GuidanceDetailBriefEN from "./guidance-detail-brief.en.md";
import GuidanceDetailBriefCN from "./guidance-detail-brief.zh-CN.md";
import GuidanceDetailStandardZH from "./guidance-detail-standard.zh.md";
import GuidanceDetailStandardEN from "./guidance-detail-standard.en.md";
import GuidanceDetailStandardCN from "./guidance-detail-standard.zh-CN.md";
import GuidanceDetailDetailedZH from "./guidance-detail-detailed.zh.md";
import GuidanceDetailDetailedEN from "./guidance-detail-detailed.en.md";
import GuidanceDetailDetailedCN from "./guidance-detail-detailed.zh-CN.md";
import ContextExistingInsights from "./context-existing-insights.md";
import ContextExistingInsightsCN from "./context-existing-insights.zh-CN.md";
import ContextInvitedGuestsZH from "./context-invited-guests.zh.md";
import ContextInvitedGuestsEN from "./context-invited-guests.en.md";
import ContextInvitedGuestsCN from "./context-invited-guests.zh-CN.md";
import ContextReference from "./context-reference.md";
import ContextReferenceCN from "./context-reference.zh-CN.md";
import TableLeadInNew from "./table-lead-in-new.md";
import TableLeadInNewCN from "./table-lead-in-new.zh-CN.md";
import TableLeadInContinue from "./table-lead-in-continue.md";
import TableLeadInContinueCN from "./table-lead-in-continue.zh-CN.md";

/**
 * Prompt text shared by more than one Coffee Tables step. Each fragment is a Markdown file next to this module; a
 * trailing file newline is removed so the text equals the string it replaced.
 */
const text = (template: string): string => renderTemplate(template, {});
type LocalizedText = { readonly zh: string; readonly en: string; readonly "zh-CN": string };
const localized = (zh: string, en: string, cn: string): LocalizedText => ({
  zh: text(zh),
  en: text(en),
  "zh-CN": text(cn)
});

/** A template, not text: `observerFormat` fills its placeholders with `renderTemplate`. */
export const OBSERVER_FORMAT_TEMPLATE: string = observerFormatTemplate;
export const OBSERVER_FORMAT_TEMPLATE_CN: string = observerFormatTemplateCN;
export const BUILTIN_STYLE_CN: string = text(builtinStyleCN);
export const INSIGHT_UPDATE_FOOTER = localized(InsightUpdateFooterZH, InsightUpdateFooterEN, InsightUpdateFooterCN);
export const OBSERVER_TITLES = localized(ObserverTitlesZH, ObserverTitlesEN, ObserverTitlesCN);
export const OBSERVER_SOURCE = localized(ObserverSourceZH, ObserverSourceEN, ObserverSourceCN);
export const OBSERVER_REFRESH_ONLY = localized(ObserverRefreshOnlyZH, ObserverRefreshOnlyEN, ObserverRefreshOnlyCN);
export const SEGMENT_SUMMARY = localized(SegmentSummaryZH, SegmentSummaryEN, SegmentSummaryCN);

export const MERGE_LEVEL = {
  "zh-CN": {
    detailed: text(MergeLevelDetailedCN),
    balanced: text(MergeLevelBalancedCN),
    compact: text(MergeLevelCompactCN)
  },
  zh: {
    detailed: text(MergeLevelDetailedZH),
    balanced: text(MergeLevelBalancedZH),
    compact: text(MergeLevelCompactZH)
  },
  en: {
    detailed: text(MergeLevelDetailedEN),
    balanced: text(MergeLevelBalancedEN),
    compact: text(MergeLevelCompactEN)
  }
} as const;

export const DETAIL_LEVEL = {
  "zh-CN": {
    brief: text(DetailLevelBriefCN),
    standard: text(DetailLevelStandardCN),
    detailed: text(DetailLevelDetailedCN)
  },
  zh: {
    brief: text(DetailLevelBriefZH),
    standard: text(DetailLevelStandardZH),
    detailed: text(DetailLevelDetailedZH)
  },
  en: {
    brief: text(DetailLevelBriefEN),
    standard: text(DetailLevelStandardEN),
    detailed: text(DetailLevelDetailedEN)
  }
} as const;

/** One-line merge and detail sentences of the observer preferences block (`observerGuidance`). */
export const GUIDANCE_MERGE_LEVEL = {
  "zh-CN": {
    detailed: text(GuidanceMergeDetailedCN),
    balanced: text(GuidanceMergeBalancedCN),
    compact: text(GuidanceMergeCompactCN)
  },
  zh: {
    detailed: text(GuidanceMergeDetailedZH),
    balanced: text(GuidanceMergeBalancedZH),
    compact: text(GuidanceMergeCompactZH)
  },
  en: {
    detailed: text(GuidanceMergeDetailedEN),
    balanced: text(GuidanceMergeBalancedEN),
    compact: text(GuidanceMergeCompactEN)
  }
} as const;

export const GUIDANCE_DETAIL_LEVEL = {
  "zh-CN": {
    brief: text(GuidanceDetailBriefCN),
    standard: text(GuidanceDetailStandardCN),
    detailed: text(GuidanceDetailDetailedCN)
  },
  zh: {
    brief: text(GuidanceDetailBriefZH),
    standard: text(GuidanceDetailStandardZH),
    detailed: text(GuidanceDetailDetailedZH)
  },
  en: {
    brief: text(GuidanceDetailBriefEN),
    standard: text(GuidanceDetailStandardEN),
    detailed: text(GuidanceDetailDetailedEN)
  }
} as const;

/**
 * Labels that introduce a block of saved context inside the prompt (`prompt-parts.ts`). The existing-insights and
 * reference labels retain their legacy Traditional Chinese in English and zh-TW prompts.
 */
export const CONTEXT_EXISTING_INSIGHTS: string = text(ContextExistingInsights);
export const CONTEXT_EXISTING_INSIGHTS_CN: string = text(ContextExistingInsightsCN);
export const CONTEXT_INVITED_GUESTS = localized(ContextInvitedGuestsZH, ContextInvitedGuestsEN, ContextInvitedGuestsCN);
export const CONTEXT_REFERENCE: string = text(ContextReference);
export const CONTEXT_REFERENCE_CN: string = text(ContextReferenceCN);

/** Opening and continuation instructions; legacy locales retain their original text. */
export const TABLE_LEAD_IN_NEW: string = text(TableLeadInNew);
export const TABLE_LEAD_IN_CONTINUE: string = text(TableLeadInContinue);
export const TABLE_LEAD_IN_NEW_CN: string = text(TableLeadInNewCN);
export const TABLE_LEAD_IN_CONTINUE_CN: string = text(TableLeadInContinueCN);
