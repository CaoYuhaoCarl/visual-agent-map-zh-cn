import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import depend from "eslint-plugin-depend";
import tseslint from "typescript-eslint";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.*", "esbuild.config.*"]
        }
      }
    }
  },
  {
    files: ["**/*.ts"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      depend,
      obsidianmd
    },
    rules: {
      "@typescript-eslint/no-base-to-string": "error",
      "@typescript-eslint/no-deprecated": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "depend/ban-dependencies": "error",
      "obsidianmd/detach-leaves": "error",
      "obsidianmd/no-static-styles-assignment": "error",
      "obsidianmd/no-unsupported-api": "error",
      "obsidianmd/settings-tab/no-manual-html-headings": "error"
    },
  },
  {
    // Node-side tooling (*.mjs) is linted without type information: type-aware
    // linting would need every script in the default project, which exceeds
    // projectService's default file-count limit.
    files: ["**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked]
  },
  {
    files: ["package.json"],
    plugins: { depend },
    rules: { "depend/ban-dependencies": "error" },
  },
  {
    // These two tools create/verify our disposable Vault with its default config
    // directory. They do not address a user's existing Vault configuration.
    files: ["scripts/create-onboarding-test-vault.mjs", "scripts/test-harness.mjs"],
    rules: { "obsidianmd/hardcoded-config-path": "off" }
  },
  {
    // Node-side CDP client for the disposable test Vault; it talks to a local
    // debugging port, not through Obsidian's requestUrl.
    files: ["scripts/obsidian-cdp.mjs"],
    rules: { "no-restricted-globals": "off" }
  },
  {
    ignores: [
      "main.js",
      "visual-agent-map/main.js",
      "tests/**"
    ]
  }
]);
