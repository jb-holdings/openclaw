#!/usr/bin/env node
// Clawify-only build patch.
//
// Pre-stage runtime deps for ALL bundled plugins to eliminate first-boot
// and first-message npm install dead-air. Upstream only stages plugins
// that opt in via openclaw.bundle.stageRuntimeDependencies=true in their
// manifest; many providers (openai, anthropic, xai, ...) don't opt in,
// so their deps install lazily on first model resolution — adding 30-60s
// to the first user message.
//
// Patches extensions/<id>/package.json before `pnpm build` so that
// scripts/runtime-postbuild.mjs pre-stages each plugin's node_modules
// into dist/extensions/<id>/node_modules/.
//
// EXCLUDED plugins have deps that don't resolve cleanly from the root
// workspace graph (upstream's stage-bundled-plugin-runtime-deps.mjs
// requires exact pinned versions; e.g. msteams's `jwks-rsa: ^4.0.1`
// does not satisfy that and breaks `pnpm build` if force-staged).
import fs from "node:fs";
import path from "node:path";

// Plugins to skip — their deps fail strict version pinning at build time.
const PLUGINS_TO_SKIP = new Set([
  "msteams", // jwks-rsa: ^4.0.1
  "matrix", // multiple semver specs
  "whatsapp", // baileys peer deps
  "discord", // discord.js semver
  "feishu",
  "slack",
  "qqbot",
  "nostr",
]);

const dir = path.join(process.cwd(), "extensions");
let patched = 0;
let alreadyOptedIn = 0;
let skipped = 0;
let noDeps = 0;

if (!fs.existsSync(dir)) {
  console.error(`[clawify] extensions/ not found at ${dir}`);
  process.exit(1);
}

const entries = fs.readdirSync(dir, { withFileTypes: true });
for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const id = entry.name;
  if (PLUGINS_TO_SKIP.has(id)) {
    skipped++;
    continue;
  }
  const p = path.join(dir, id, "package.json");
  if (!fs.existsSync(p)) continue;
  const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.optionalDependencies || {}) };
  // Filter out workspace-only devDependencies-style entries.
  const runtimeDeps = Object.entries(deps).filter(
    ([, version]) => typeof version === "string" && !version.startsWith("workspace:"),
  );
  if (runtimeDeps.length === 0) {
    noDeps++;
    continue;
  }
  pkg.openclaw = pkg.openclaw || {};
  pkg.openclaw.bundle = pkg.openclaw.bundle || {};
  if (pkg.openclaw.bundle.stageRuntimeDependencies === true) {
    alreadyOptedIn++;
    continue;
  }
  pkg.openclaw.bundle.stageRuntimeDependencies = true;
  fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
  patched++;
}

console.log(
  `[clawify] forced stageRuntimeDependencies on ${patched} plugins (already=${alreadyOptedIn}, skipped=${skipped}, no-deps=${noDeps})`,
);
