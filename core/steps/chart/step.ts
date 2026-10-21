import type { UiLanguage } from "../../../i18n";
import { renderTemplate, type StepDefinition } from "../../step-runner";
import { inLanguage } from "../_shared/fragments";
import { CHART_SHAPES, type ChartCode, type ChartDraft } from "./insert";
import templateEn from "./chart.en.md";
import templateZh from "./chart.zh.md";
import templateCn from "./chart.zh-CN.md";

export interface ChartRequest {
  title: string;
  detail: string;
  language: UiLanguage;
  existingCount: number;
  existingTypes: string[];
  remaining: number;
}

export const CHART_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    charts: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          anchor: { type: "string", minLength: 1, maxLength: 2000 },
          shape: { type: "string", enum: [...CHART_SHAPES] },
          mermaid: { type: "string", minLength: 1, maxLength: 1500 }
        },
        required: ["anchor", "shape", "mermaid"]
      }
    }
  },
  required: ["charts"]
};

/** A refused chart reply; `code` is the only thing logged. */
export class ChartRejected extends Error {
  constructor(readonly code: ChartCode) {
    super(code);
    this.name = "ChartRejected";
  }
}

/** V0: the reply must be JSON that matches CHART_SCHEMA. */
export function parseChartReply(raw: string): ChartDraft[] {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ChartRejected("invalid_reply");
  }
  const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  if (!isObject(value) || Object.keys(value).some(k => k !== "charts") || !Array.isArray(value.charts))
    throw new ChartRejected("invalid_reply");
  if (value.charts.length > 3) throw new ChartRejected("invalid_reply");
  return value.charts.map(item => {
    if (
      !isObject(item) ||
      Object.keys(item).some(k => k !== "anchor" && k !== "shape" && k !== "mermaid") ||
      typeof item.anchor !== "string" ||
      item.anchor.length < 1 ||
      item.anchor.length > 2000 ||
      typeof item.shape !== "string" ||
      !(CHART_SHAPES as readonly string[]).includes(item.shape) ||
      typeof item.mermaid !== "string" ||
      item.mermaid.length < 1 ||
      item.mermaid.length > 1500
    )
      throw new ChartRejected("invalid_reply");
    return { anchor: item.anchor, shape: item.shape as ChartDraft["shape"], mermaid: item.mermaid };
  });
}

/** One local, tool-free model call that proposes mermaid diagrams for a finished note. */
export const chartStep: StepDefinition<ChartRequest, ChartDraft[]> = {
  id: "chart.add",
  version: 1,
  schema: CHART_SCHEMA,
  render: request =>
    renderTemplate(inLanguage({ en: templateEn, zh: templateZh, cn: templateCn }, request.language), {
      existingCount: String(request.existingCount),
      existingTypes: request.existingTypes.length
        ? request.existingTypes.join(request.language === "en" ? ", " : "、")
        : inLanguage({ en: "none", zh: "無", cn: "无" }, request.language),
      remaining: String(request.remaining),
      title: request.title,
      detail: request.detail
    }),
  parse: raw => parseChartReply(raw)
};
