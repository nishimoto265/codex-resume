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
  try {
    realCodex = execSync("command -v codex", { stdio: ["ignore","pipe","ignore"] }).toString().trim();
  } catch {}
  if (!realCodex) {
    console.error("Could not find 'codex' in PATH. Please install Codex CLI first.");
    process.exit(1);
  }

  // 1) Place a stable copy of codex-shim.mjs under XDG_DATA_HOME (or ~/.local/share)
  const dataHome = process.env.XDG_DATA_HOME
    ? path.join(process.env.XDG_DATA_HOME, "codex-resume")
    : path.join(os.homedir(), ".local", "share", "codex-resume");
  fs.mkdirSync(dataHome, { recursive: true });
  const shimJSrc = path.join(__dirname, "codex-shim.mjs");
  const shimJDst = path.join(dataHome, "codex-shim.mjs");
  fs.copyFileSync(shimJSrc, shimJDst);

  // Helper to write a shell wrapper pointing to that stable JS
  function writeWrapper(targetPath, realCodexPath) {
    let script = '';
    script += '#!/usr/bin/env bash\n';
    script += 'set -euo pipefail\n';
    script += 'if [[ -z "${CODEX_REAL:-}" ]]; then CODEX_REAL="' + realCodexPath.replace(/"/g,'\\"') + '"; fi\n';
    script += 'export CODEX_REAL\n';
    script += 'if [[ "${1:-}" == "--resume" ]]; then\n';
    script += '  exec "' + process.execPath.replace(/"/g,'\\"') + '" "' + shimJDst.replace(/"/g,'\\"') + '" "$@"\n';
    script += 'else\n';
    script += '  exec "$CODEX_REAL" "$@"\n';
    script += 'fi\n';
    fs.writeFileSync(targetPath, script, { mode: 0o755 });
  }

  // Install into ~/.local/bin (preferred; simple uninstall via rm ~/.local/bin/codex)
  const homeBin = path.join(os.homedir(), ".local", "bin");
  fs.mkdirSync(homeBin, { recursive: true });
  const shimPath = path.join(homeBin, "codex");
  writeWrapper(shimPath, realCodex);
  console.log(`Installed wrapper: ${shimPath}`);
  console.log(`If 'codex --resume' is not found or still calls the original, ensure '${homeBin}' is at the front of your PATH.`);
}
