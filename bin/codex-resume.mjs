#!/usr/bin/env node
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);

if (args[0] === "install" || args[0] === "--install" || args[0] === "--install-shim" || !args[0]) {
  installShim();
} else {
  console.error("Usage: npx codex-resume install\nThis installs a wrapper so you can run 'codex --resume'.");
  process.exit(2);
}

function installShim() {
  let realCodex = null;
  try { realCodex = execSync("command -v codex", { stdio: ["ignore","pipe","ignore"] }).toString().trim(); } catch {}
  if (!realCodex) {
    console.error("Could not find 'codex' in PATH. Please install Codex CLI first.");
    process.exit(1);
  }
  const homeBin = path.join(os.homedir(), ".local", "bin");
  fs.mkdirSync(homeBin, { recursive: true });
  const shimPath = path.join(homeBin, "codex");
  const cmd = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    ': "${CODEX_REAL:=}"',
    `if [[ -z "$CODEX_REAL" ]]; then CODEX_REAL="${realCodex}"; fi`,
    'export CODEX_REAL',
    `exec "${process.execPath}" "${path.join(__dirname, 'codex-shim.mjs')}" "$@"`
  ].join('\n') + '\n';
  fs.writeFileSync(shimPath, cmd, { mode: 0o755 });
  console.log(`Installed: ${shimPath}`);
  console.log(`Ensure '${homeBin}' is in your PATH (preferably at the front). Then run: codex --resume`);
}
