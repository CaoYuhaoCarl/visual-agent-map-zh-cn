// The one esbuild configuration every test uses to bundle product TypeScript into a CommonJS string.
// Prompt templates are Markdown imports, so the `.md` text loader is always on (matching esbuild.config.mjs).
const esbuild = require('esbuild');

/** Same call shape as esbuild.buildSync; callers pass `entryPoints` and, when needed, `external`. */
function buildSync(options) {
  return esbuild.buildSync({ bundle: true, write: false, platform: 'node', format: 'cjs', loader: { '.md': 'text' }, ...options });
}

module.exports = { buildSync };
