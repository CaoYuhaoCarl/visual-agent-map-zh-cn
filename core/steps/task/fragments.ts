import { renderTemplate } from "../../step-runner";
import type { UiLanguage } from "../../../i18n";
import { inLanguage, type FragmentPair } from "../_shared/fragments";
import SourceRegistryTemplate from "./source-registry.md";
import AdaptiveDetailStructureZH from "./adaptive-detail-structure.zh.md";
import AdaptiveDetailStructureEN from "./adaptive-detail-structure.en.md";
import DecomposeZH from "./decompose.zh.md";
import DecomposeEN from "./decompose.en.md";
import DefaultTaskZH from "./default-task.zh.md";
import DefaultTaskEN from "./default-task.en.md";
import DetailStructureZH from "./detail-structure.zh.md";
import DetailStructureEN from "./detail-structure.en.md";
import GeneralTaskZH from "./general-task.zh.md";
import GeneralTaskEN from "./general-task.en.md";
import JsonZH from "./json.zh.md";
import JsonEN from "./json.en.md";
import LabelDetailZH from "./label-detail.zh.md";
import LabelDetailEN from "./label-detail.en.md";
import LabelFindingsZH from "./label-findings.zh.md";
import LabelFindingsEN from "./label-findings.en.md";
import OutputLanguageZH from "./output-language.zh.md";
import OutputLanguageEN from "./output-language.en.md";
import SynthesizeZH from "./synthesize.zh.md";
import SynthesizeEN from "./synthesize.en.md";
import VisualAutoZH from "./visual-auto.zh.md";
import VisualAutoEN from "./visual-auto.en.md";
import VisualEmbedZH from "./visual-embed.zh.md";
import VisualEmbedEN from "./visual-embed.en.md";
import VisualNoneZH from "./visual-none.zh.md";
import VisualNoneEN from "./visual-none.en.md";
import VisualOnZH from "./visual-on.zh.md";
import VisualOnEN from "./visual-on.en.md";
import VisualPreserveZH from "./visual-preserve.zh.md";
import VisualPreserveEN from "./visual-preserve.en.md";

/** Prompt text of the general task step and its visual guidance; Markdown files next to this module. */
const text = (template: string): string => renderTemplate(template, {});
const pair = (zh: string, en: string): FragmentPair => ({ zh: text(zh), en: text(en) });

export const ADAPTIVE_DETAIL_STRUCTURE: FragmentPair = pair(AdaptiveDetailStructureZH, AdaptiveDetailStructureEN);
export const DECOMPOSE: FragmentPair = pair(DecomposeZH, DecomposeEN);
export const DEFAULT_TASK: FragmentPair = pair(DefaultTaskZH, DefaultTaskEN);
/** A template, not text: {@link detailStructure} fills its `{{headings}}` placeholder. */
const DETAIL_STRUCTURE_TEMPLATE: FragmentPair = { zh: DetailStructureZH, en: DetailStructureEN };
export const GENERAL_TASK: FragmentPair = pair(GeneralTaskZH, GeneralTaskEN);
export const JSON_CONTRACT: FragmentPair = pair(JsonZH, JsonEN);
export const LABEL_DETAIL: FragmentPair = pair(LabelDetailZH, LabelDetailEN);
export const LABEL_FINDINGS: FragmentPair = pair(LabelFindingsZH, LabelFindingsEN);
export const OUTPUT_LANGUAGE: FragmentPair = pair(OutputLanguageZH, OutputLanguageEN);
export const SYNTHESIZE: FragmentPair = pair(SynthesizeZH, SynthesizeEN);
export const VISUAL_AUTO: FragmentPair = pair(VisualAutoZH, VisualAutoEN);
export const VISUAL_EMBED: FragmentPair = pair(VisualEmbedZH, VisualEmbedEN);
export const VISUAL_NONE: FragmentPair = pair(VisualNoneZH, VisualNoneEN);
export const VISUAL_ON: FragmentPair = pair(VisualOnZH, VisualOnEN);
export const VISUAL_PRESERVE: FragmentPair = pair(VisualPreserveZH, VisualPreserveEN);

/** The six standard Detail headings are interface text, so the caller builds them; this fills the structure sentence. */
export function detailStructure(language: UiLanguage, headings: string): string {
  return renderTemplate(inLanguage(DETAIL_STRUCTURE_TEMPLATE, language), { headings });
}
export function sourceRegistry(catalog: string): string {
  return renderTemplate(SourceRegistryTemplate, { catalog });
}
