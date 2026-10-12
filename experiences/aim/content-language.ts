import type { MapDocument } from "../../map-model";
import type { UiLanguage } from "../../i18n";

const KANA_OR_HANGUL = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/**
 * Character-only language detection for one piece of user text. "unsupported" means Japanese/Korean
 * (use the interface language); undefined means no decisive signal (empty, digits or emoji only).
 */
export function detectAimContentLanguage(text: string): UiLanguage | "unsupported" | undefined {
  if (KANA_OR_HANGUL.test(text)) return "unsupported";
  const han = (text.match(/\p{Script=Han}/gu) ?? []).length;
  const latin = (text.match(/\p{Script=Latin}+/gu) ?? []).length;
  if (han > 0 && han >= latin) return "zh-TW";
  if (latin > 0) return "en";
  return undefined;
}

/**
 * Picks the AIM content language from the user's own words: topic first, then context, then the
 * interface language. Simplified Chinese is treated as zh-TW (known limitation). No AI call.
 */
export function chooseAimContentLanguage(uiLanguage: UiLanguage, ...sources: (string | undefined)[]): UiLanguage {
  for (const source of sources) {
    const result = detectAimContentLanguage(source ?? "");
    if (result === "unsupported") return uiLanguage;
    if (result) return result;
  }
  return uiLanguage;
}

/**
 * Content language of a saved map: the stored value, else derived from the map title (legacy maps),
 * else the interface language. Read from the map on every call; never cached by callers.
 */
export function resolveAimContentLanguage(
  map: Pick<MapDocument, "title" | "aim"> | undefined | null,
  uiLanguage: UiLanguage
): UiLanguage {
  const stored = map?.aim?.contentLanguage;
  if (stored === "en" || stored === "zh-TW") return stored;
  return chooseAimContentLanguage(uiLanguage, map?.title);
}
