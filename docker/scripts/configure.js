#!/usr/bin/env node
// Validate persisted OpenClaw config prepared by Clawify.
// This script is intentionally non-mutating: it never rewrites openclaw.json.

const fs = require("fs");
const path = require("path");

const STATE_DIR = (process.env.OPENCLAW_STATE_DIR || "/data/.openclaw").replace(/\/+$/, "");
const WORKSPACE_DIR = (process.env.OPENCLAW_WORKSPACE_DIR || "/data/workspace").replace(/\/+$/, "");
const CONFIG_FILE = process.env.OPENCLAW_CONFIG_PATH || path.join(STATE_DIR, "openclaw.json");

function fail(message) {
  console.error(`[configure] ERROR: ${message}`);
  process.exit(1);
}

function readConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    fail(`Missing persisted config: ${CONFIG_FILE}`);
  }

  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch (error) {
    fail(`Invalid JSON in ${CONFIG_FILE}: ${error.message}`);
  }
}

function ensureString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    fail(`Missing ${label} in persisted config (${CONFIG_FILE})`);
  }
  return value.trim();
}

function ensureNumber(value, label) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    fail(`Missing ${label} in persisted config (${CONFIG_FILE})`);
  }
  return value;
}

console.log("[configure] state dir:", STATE_DIR);
console.log("[configure] workspace dir:", WORKSPACE_DIR);
console.log("[configure] config file:", CONFIG_FILE);

const config = readConfig();
const gatewayToken = ensureString(config?.gateway?.auth?.token, "gateway.auth.token");
const gatewayPort = ensureNumber(config?.gateway?.port, "gateway.port");
const workspacePath = ensureString(
  config?.agents?.defaults?.workspace,
  "agents.defaults.workspace",
);

if (workspacePath !== WORKSPACE_DIR) {
  console.warn(
    `[configure] WARNING: workspace mismatch. config=${workspacePath} env=${WORKSPACE_DIR}`,
  );
}

console.log("[configure] persisted config OK");
console.log("[configure] gateway port:", gatewayPort);
console.log("[configure] gateway token present:", gatewayToken.length > 0 ? "yes" : "no");
