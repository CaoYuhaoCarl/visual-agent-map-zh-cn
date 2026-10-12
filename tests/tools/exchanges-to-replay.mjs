// Convert an ai-exchanges.json (written by AiExchangeLog when "AI exchange logging" is on) into replay case files
// for tests/replay.cjs. One case file per exchange that carries a prompt.
//
//   node tests/tools/exchanges-to-replay.mjs <ai-exchanges.json> <out-dir> [--manifest manifest.json] [--sequential] [--flow <name>]
//
// manifest.json maps an exchange id (or its topic) to extra driver data the log does not contain:
//   { "<id or topic>": { "name": "...", "language": "en", "context": { TaskContext }, "expect": { ... } } }
// A case without "context" cannot be driven by the replay runner until one is added.
// --sequential drops the prompt hash match, for exchanges whose prompt no longer equals what current code builds.
// --flow <name> writes ONE case holding every exchange (log order) as an ordered flow: kind "flow", exchanges[] each with
//   its AiExchange `step` (stepId@version) and `exchangeId`. The manifest may hold, per exchange id/topic, the same
//   { context, expect } driver data, and under the key "@flow" case-level { language, expect: { stepOrder: [...] } }.
//
// Exchange logs hold real prompts and replies. Review them before copying any output into a public repository.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ISO_TIME = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;
// Keep in step with normalizeText/sha256 in tests/support-replay.cjs; the round-trip test fails if they drift.
const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const normalize = text =>
  String(text).replace(/\r\n/g, "\n").replace(UUID, "<uuid>").replace(ISO_TIME, "<time>").split(ROOT).join("<root>");
export const promptHash = text => createHash("sha256").update(normalize(text)).digest("hex");

function toExchange(entry) {
  // A failure with no raw reply is a provider/runtime failure and replays as a thrown error.
  // A failure after a reply is a parse-stage failure; the raw reply itself is what gets replayed.
  const providerFailure = entry.status === "failed" && !entry.response;
  return { promptSha256: promptHash(entry.prompt), prompt: entry.prompt, response: entry.response, ...(providerFailure ? { error: entry.error } : {}) };
}

const withPrompt = exchanges => {
  if (!Array.isArray(exchanges)) throw new Error("Exchange log must be a JSON array.");
  return exchanges.filter(entry => entry && typeof entry.prompt === "string" && entry.prompt);
};

export function convertExchanges(exchanges, { manifest = {}, sequential = false, flow } = {}) {
  const entries = withPrompt(exchanges);
  if (flow) return [convertFlow(entries, { manifest, sequential, name: flow })];
  return entries.map(entry => {
      const extra = manifest[entry.id] ?? manifest[entry.topic] ?? {};
      return {
        version: 1,
        name: extra.name ?? `exchange-${entry.id}`,
        source: { kind: "ai-exchanges", exchangeId: entry.id, startedAt: entry.startedAt, mode: entry.mode, status: entry.status, recordedError: entry.error || undefined, ...(entry.step ? { step: entry.step } : {}) },
        model: entry.model,
        effort: entry.effort,
        language: extra.language ?? "en",
        ...(extra.context ? { context: extra.context } : {}),
        ...(extra.expect ? { expect: extra.expect } : {}),
        matchPrompt: !sequential,
        exchanges: [toExchange(entry)]
      };
    });
}

/** One ordered case for one flow run (for example one AIM flow): every exchange keeps its `step` and its log order. */
function convertFlow(entries, { manifest, sequential, name }) {
  if (!entries.length) throw new Error("A flow case needs at least one exchange that carries a prompt.");
  const flowExtra = manifest["@flow"] ?? {};
  return {
    version: 1,
    kind: "flow",
    name,
    source: { kind: "ai-exchanges", exchangeIds: entries.map(entry => entry.id), startedAt: entries[0].startedAt, statuses: entries.map(entry => entry.status) },
    model: entries[0].model,
    effort: entries[0].effort,
    language: flowExtra.language ?? "en",
    ...(flowExtra.expect ? { expect: flowExtra.expect } : {}),
    matchPrompt: !sequential,
    exchanges: entries.map(entry => {
      const extra = manifest[entry.id] ?? manifest[entry.topic] ?? {};
      return {
        exchangeId: entry.id,
        ...(entry.step ? { step: entry.step } : {}),
        model: entry.model,
        effort: entry.effort,
        status: entry.status,
        ...(extra.context ? { context: extra.context } : {}),
        ...(extra.expect ? { expect: extra.expect } : {}),
        ...toExchange(entry)
      };
    })
  };
}

function main(args) {
  const [input, outDir, ...rest] = args;
  if (!input || !outDir) throw new Error("Usage: exchanges-to-replay.mjs <ai-exchanges.json> <out-dir> [--manifest file] [--sequential] [--flow name]");
  const manifestIndex = rest.indexOf("--manifest");
  const manifest = manifestIndex >= 0 ? JSON.parse(readFileSync(rest[manifestIndex + 1], "utf8")) : {};
  const flowIndex = rest.indexOf("--flow");
  const flow = flowIndex >= 0 ? rest[flowIndex + 1] : undefined;
  if (flowIndex >= 0 && (!flow || flow.startsWith("--"))) throw new Error("--flow needs a case name.");
  const cases = convertExchanges(JSON.parse(readFileSync(input, "utf8")), { manifest, sequential: rest.includes("--sequential"), flow });
  mkdirSync(outDir, { recursive: true });
  for (const item of cases) writeFileSync(join(outDir, `${item.name.replace(/[^A-Za-z0-9._-]+/g, "-")}.replay.json`), `${JSON.stringify(item, null, 2)}\n`);
  process.stdout.write(`${cases.length} replay case(s) written to ${outDir}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
