/** Legacy Coffee prompt resources use `zh` for Traditional Chinese. */
export function coffeeLanguageKey(language: string): "en" | "zh" | "zh-CN" {
  return language === "zh-CN" ? "zh-CN" : language === "zh-TW" ? "zh" : "en";
}

/** Select static text only; persisted and user-authored content is never converted. */
export function coffeeText(language: string, english: string, traditional: string, simplified: string): string {
  return language === "zh-CN" ? simplified : language === "zh-TW" ? traditional : english;
}
