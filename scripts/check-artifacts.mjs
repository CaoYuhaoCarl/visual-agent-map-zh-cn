import { existsSync, readFileSync } from "node:fs";

const required = ["main.js", "manifest.json", "styles.css"];
for (const path of ["README.md", "LICENSE"]) if (!existsSync(path)) throw new Error(`Missing distribution document: ${path}`);
for (const path of required) if (!existsSync(path)) throw new Error(`Missing release artifact: ${path}`);
if (!existsSync("response-schema.json")) throw new Error("Missing response-schema.json source.");
const productionBundle = readFileSync("main.js", "utf8");
for (const smokeMarker of ["VAM_SMOKE_PROFILE_ACTIVE", "Test overrides active", "flow-limits.smoke"]) if (productionBundle.includes(smokeMarker)) throw new Error(`Production main.js contains the smoke test marker "${smokeMarker}".`);
if (!readFileSync("main.js", "utf8").includes("https://json-schema.org/draft/2020-12/schema")) throw new Error("main.js does not contain the embedded response schema.");

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
for (const field of ["id", "name", "version", "minAppVersion", "author", "description"]) {
  if (typeof manifest[field] !== "string" || !manifest[field].trim()) throw new Error(`Invalid manifest field: ${field}`);
}
if (manifest.isDesktopOnly !== true) throw new Error("VAM uses Node APIs and must be desktop-only.");
if (!/^\d+\.\d+\.\d+$/.test(manifest.minAppVersion)) throw new Error("Invalid manifest minAppVersion.");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
if (manifest.version !== packageJson.version) throw new Error("package.json and manifest.json versions must match.");
if (packageLock.version !== manifest.version || packageLock.packages?.[""]?.version !== manifest.version) throw new Error("package-lock.json and manifest.json versions must match.");
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error("manifest.json version must use x.y.z SemVer.");
if (versions[manifest.version] !== manifest.minAppVersion) throw new Error("versions.json must map the current release to manifest.minAppVersion.");

for (const path of ["README.zh-TW.md", "INSTALL.md"]) if (!existsSync(path)) throw new Error(`Missing distribution document: ${path}`);
const english = readFileSync("README.md", "utf8");
const chinese = readFileSync("README.zh-TW.md", "utf8");
if (!english.includes("[繁體中文](README.zh-TW.md)") || !chinese.includes("[English](README.md)")) throw new Error("README.md and README.zh-TW.md must link to each other.");
for (const [section, language, terms] of [
  [english, "English", [/install/i, /privacy/i, /limitations/i, /license/i]],
  [chinese, "Traditional Chinese", [/安裝/, /隱私/, /限制/, /授權/]]
]) {
  if (!section.includes(manifest.version)) throw new Error(`README ${language} page must state the current version.`);
  if (!section.includes(manifest.minAppVersion)) throw new Error(`README ${language} page must state manifest.minAppVersion.`);
  if (!section.includes("[INSTALL.md](INSTALL.md)")) throw new Error(`README ${language} page must link to INSTALL.md.`);
  if (!/\[[^\]]+\]\(LICENSE\)/.test(section)) throw new Error(`README ${language} page must link to LICENSE.`);
  for (const term of terms) if (!term.test(section)) throw new Error(`README ${language} page is missing ${term}.`);
}
const install = readFileSync("INSTALL.md", "utf8");
for (const heading of [/^## Known limitations\s*$/m, /^## 已知限制\s*$/m]) if (!heading.test(install)) throw new Error(`INSTALL.md is missing ${heading}.`);

for (const path of ["visual-agent-map/main.js", "visual-agent-map/manifest.json", "visual-agent-map/styles.css"]) {
  if (existsSync(path)) throw new Error(`Stale duplicate release artifact: ${path}`);
}

if (existsSync("dist")) for (const path of required) {
  const distPath = `dist/${path}`;
  if (existsSync(distPath) && readFileSync(path).compare(readFileSync(distPath)) !== 0) throw new Error(`dist artifact differs from ${path}.`);
}
