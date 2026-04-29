#!/usr/bin/env node
// Clawify-only build patch.
//
// Pre-stage runtime deps for plugins we activate at first boot. Upstream
// only stages plugins that opt in via openclaw.bundle.stageRuntimeDependencies=true
// in their manifest; the plugins below don't opt in, so their deps install
// lazily via npm at first activation — adding 5-10s of dead air to first
// boot, enough to push us past the /health poll threshold.
//
// Patches extensions/<id>/package.json before `pnpm build` so that
// scripts/runtime-postbuild.mjs pre-stages each plugin's node_modules
// into dist/extensions/<id>/node_modules/.
//
// Scoped to plugins whose deps resolve cleanly from the root workspace
// graph (upstream's stage-bundled-plugin-runtime-deps.mjs requires exact
// pinned versions; e.g. msteams's `jwks-rsa: ^4.0.1` does not satisfy
// that and breaks `pnpm build` if force-staged).
import fs from "node:fs";
import path from "node:path";

const PLUGINS_TO_FORCE_STAGE = new Set([
  // Active at boot per first-boot logs:
  // [plugins] browser staging bundled runtime deps (7 missing) — 5s
  // [plugins] memory-core staging bundled runtime deps (2 missing) — 1.3s
  // [plugins] memory-wiki staging bundled runtime deps (2 missing) — 1.3s
  "browser",
  "memory-core",
  "memory-wiki",
]);

const dir = path.join(process.cwd(), "extensions");
let patched = 0;

if (!fs.existsSync(dir)) {
  console.error(`[clawify] extensions/ not found at ${dir}`);
  process.exit(1);
}

for (const id of PLUGINS_TO_FORCE_STAGE) {
  const p = path.join(dir, id, "package.json");
  if (!fs.existsSync(p)) {
    console.warn(`[clawify] skipping ${id}: package.json not found`);
    continue;
  }
  const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.optionalDependencies || {}) };
  if (Object.keys(deps).length === 0) continue;
  pkg.openclaw = pkg.openclaw || {};
  pkg.openclaw.bundle = pkg.openclaw.bundle || {};
  if (pkg.openclaw.bundle.stageRuntimeDependencies === true) continue;
  pkg.openclaw.bundle.stageRuntimeDependencies = true;
  fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
  patched++;
}

console.log(`[clawify] forced stageRuntimeDependencies on ${patched} plugins`);
