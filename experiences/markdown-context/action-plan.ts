import { requestUrl } from "obsidian";

export type ContextAction = "transform" | "research" | "image_search" | "diagram" | "image_generate" | "clarify";
export interface ContextPlan {
  action: ContextAction;
  query: string;
  instruction: string;
  placement: "after" | "replace";
  captionInstruction: string;
}
export interface ImageCandidate {
  title: string;
  url: string;
  source: string;
}

export function parsePlan(raw: string): ContextPlan {
  const value: unknown = JSON.parse(
    raw
      .trim()
      .replace(/^```(?:json)?\s*/, "")
      .replace(/\s*```$/, "")
  );
  if (!value || typeof value !== "object") throw new Error("Invalid AI action plan");
  const plan = value as Partial<ContextPlan>;
  if (
    !["transform", "research", "image_search", "diagram", "image_generate", "clarify"].includes(plan.action ?? "") ||
    typeof plan.captionInstruction !== "string" ||
    typeof plan.query !== "string" ||
    typeof plan.instruction !== "string" ||
    !["after", "replace"].includes(plan.placement ?? "")
  )
    throw new Error("Invalid AI action plan");
  return plan as ContextPlan;
}

// Search an explicit public media API; image URLs come from the service, never from model guesses.
export async function searchImages(query: string, signal: AbortSignal): Promise<ImageCandidate[]> {
  if (!query.trim() || signal.aborted) return [];
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: query.slice(0, 200),
    gsrnamespace: "6",
    gsrlimit: "8",
    prop: "imageinfo",
    iiprop: "url|mime",
    iiurlwidth: "640"
  });
  const response = await requestUrl({
    url: `https://commons.wikimedia.org/w/api.php?${params}`,
    headers: { Accept: "application/json" }
  });
  if (signal.aborted) return [];
  const data: unknown = JSON.parse(response.text);
  if (!data || typeof data !== "object") return [];
  const pages =
    (
      data as {
        query?: {
          pages?: Record<
            string,
            {
              title?: string;
              imageinfo?: Array<{ thumburl?: string; url?: string; descriptionurl?: string; mime?: string }>;
            }
          >;
        };
      }
    ).query?.pages ?? {};
  return Object.values(pages).flatMap(page => {
    const info = page.imageinfo?.[0];
    if (!info || !["image/jpeg", "image/png", "image/gif", "image/webp"].includes(info.mime ?? "")) return [];
    try {
      const url = new URL(info.thumburl || info.url || "");
      const source = new URL(info.descriptionurl || "");
      if (
        url.protocol !== "https:" ||
        url.hostname !== "upload.wikimedia.org" ||
        source.protocol !== "https:" ||
        source.hostname !== "commons.wikimedia.org"
      )
        return [];
      return [{ title: (page.title || "Image").replace(/^File:/, ""), url: url.href, source: source.href }];
    } catch {
      return [];
    }
  });
}

export function imageMarkdown(candidate: ImageCandidate): string {
  const title = candidate.title.replace(/[\]\\\r\n[]/g, " ");
  return `![${title}](<${candidate.url}>)\n\n[${title}](<${candidate.source}>)`;
}
