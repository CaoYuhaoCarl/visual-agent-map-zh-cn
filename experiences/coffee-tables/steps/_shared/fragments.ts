import { renderTemplate } from "../../../../core/step-runner";
import observerFormatTemplate from "./observer-format.md";
import InsightUpdateFooterZH from "./insight-update-footer.zh.md";
import InsightUpdateFooterEN from "./insight-update-footer.en.md";
import ObserverTitlesZH from "./observer-titles.zh.md";
import ObserverTitlesEN from "./observer-titles.en.md";
import ObserverSourceZH from "./observer-source.zh.md";
import ObserverSourceEN from "./observer-source.en.md";
import ObserverRefreshOnlyZH from "./observer-refresh-only.zh.md";
import ObserverRefreshOnlyEN from "./observer-refresh-only.en.md";
import SegmentSummaryZH from "./segment-summary.zh.md";
import SegmentSummaryEN from "./segment-summary.en.md";
import MergeLevelDetailedZH from "./merge-level-detailed.zh.md";
import MergeLevelDetailedEN from "./merge-level-detailed.en.md";
import MergeLevelBalancedZH from "./merge-level-balanced.zh.md";
import MergeLevelBalancedEN from "./merge-level-balanced.en.md";
import MergeLevelCompactZH from "./merge-level-compact.zh.md";
import MergeLevelCompactEN from "./merge-level-compact.en.md";
import DetailLevelBriefZH from "./detail-level-brief.zh.md";
import DetailLevelBriefEN from "./detail-level-brief.en.md";
import DetailLevelStandardZH from "./detail-level-standard.zh.md";
import DetailLevelStandardEN from "./detail-level-standard.en.md";
import DetailLevelDetailedZH from "./detail-level-detailed.zh.md";
import DetailLevelDetailedEN from "./detail-level-detailed.en.md";

/**
 * Prompt text shared by more than one Coffee Tables step. Each fragment is a Markdown file next to this module; a
 * trailing file newline is removed so the text equals the string it replaced.
 */
const text = (template: string): string => renderTemplate(template, {});
type Pair = { readonly zh: string; readonly en: string };
const pair = (zh: string, en: string): Pair => ({ zh: text(zh), en: text(en) });

/** A template, not text: `observerFormat` fills its placeholders with `renderTemplate`. */
export const OBSERVER_FORMAT_TEMPLATE: string = observerFormatTemplate;
export const INSIGHT_UPDATE_FOOTER: Pair = pair(InsightUpdateFooterZH, InsightUpdateFooterEN);
export const OBSERVER_TITLES: Pair = pair(ObserverTitlesZH, ObserverTitlesEN);
export const OBSERVER_SOURCE: Pair = pair(ObserverSourceZH, ObserverSourceEN);
export const OBSERVER_REFRESH_ONLY: Pair = pair(ObserverRefreshOnlyZH, ObserverRefreshOnlyEN);
export const SEGMENT_SUMMARY: Pair = pair(SegmentSummaryZH, SegmentSummaryEN);

export const MERGE_LEVEL = {
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
