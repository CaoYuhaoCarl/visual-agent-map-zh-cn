// Builds the smoke bundle: the product's main.ts with experiences/aim/flow-limits.ts swapped for
// tests/smoke/flow-limits.smoke.ts. The output goes OUTSIDE the repository (default /private/tmp/vam-smoke-artifact)
// and never touches the repository's main.js. Usage:
//   node tests/smoke/build-smoke.mjs [--out=<dir>] [--web-search=on|off]
import esbuild from "esbuild";
import { builtinModules } from "node:module";
import { copyFileSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const marker = "VAM_SMOKE_PROFILE_ACTIVE";

export async function buildSmoke({ out = "/private/tmp/vam-smoke-artifact", webSearch = true } = {}) {
  const outDir = resolve(out);
  mkdirSync(outDir, { recursive: true });
  const real = realpathSync(outDir);
  const inside = relative(realpathSync(root), real);
  if (inside === "" || !inside.startsWith(".."))
    throw new Error(`The smoke artifact must be written outside the repository, not to ${real}.`);
  const limits = resolve(root, "experiences/aim/flow-limits.ts");
  const smoke = resolve(root, "tests/smoke/flow-limits.smoke.ts");
  const swap = {
    name: "smoke-flow-limits",
    setup(build) {
      build.onResolve({ filter: /flow-limits$/ }, args => {
        const path = resolve(dirname(args.importer), `${args.path}.ts`);
        return path === limits ? { path: smoke } : undefined;
      });
    }
  };
  await esbuild.build({
    entryPoints: [join(root, "main.ts")],
    bundle: true,
    external: ["obsidian", "electron", "@codemirror/state", "@codemirror/view", "node:*", ...builtinModules],
    format: "cjs",
    target: "es2018",
    logLevel: "info",
    sourcemap: false,
    treeShaking: true,
    loader: { ".md": "text" },
    define: { __VAM_SMOKE_WEB_SEARCH__: webSearch ? "true" : "false" },
    plugins: [swap],
    outfile: join(outDir, "main.js")
  });
  for (const name of ["manifest.json", "styles.css"]) copyFileSync(join(root, name), join(outDir, name));
  if (!readFileSync(join(outDir, "main.js"), "utf8").includes(marker)) throw new Error("Smoke bundle does not contain the smoke marker; the alias did not apply.");
  const record = { profile: "smoke", marker, webSearch, builtFrom: "main.ts + tests/smoke/flow-limits.smoke.ts", note: "Smoke evidence only; never a full E2E PASS." };
  writeFileSync(join(outDir, "smoke-profile.json"), `${JSON.stringify(record, null, 2)}\n`);
  return { outDir, ...record };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = name => process.argv.slice(2).find(value => value.startsWith(`--${name}=`))?.split("=")[1];
  const search = arg("web-search") ?? "on";
  if (!["on", "off"].includes(search)) throw new Error("--web-search must be on or off");
  const result = await buildSmoke({ out: arg("out") ?? "/private/tmp/vam-smoke-artifact", webSearch: search === "on" });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
