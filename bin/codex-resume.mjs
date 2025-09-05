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
  const realCodex = process.env.CODEX_REAL || resolveRealCodex();
  if (!realCodex) {
    console.error("Could not find the real 'codex'. Set CODEX_REAL=/abs/path/to/codex and re-run: npx codex-resume install");
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
    // avoid self-recursion if CODEX_REAL points to this wrapper
    script += 'WRAPPER_PATH="$0"\n';
    script += 'if [[ "$CODEX_REAL" == "$WRAPPER_PATH" ]]; then\n';
    script += '  IFS=:\n  for d in $PATH; do\n';
    script += '    [[ -z "$d" ]] && continue; cand="$d/codex"; [[ "$cand" == "$WRAPPER_PATH" ]] && continue;\n';
    script += '    if [[ -x "$cand" ]] && ! grep -q "codex-shim.mjs" "$cand" 2>/dev/null; then CODEX_REAL="$cand"; export CODEX_REAL; break; fi\n';
    script += '  done\n';
    script += 'fi\n';
    script += 'if [[ "$CODEX_REAL" == "$WRAPPER_PATH" || -z "$CODEX_REAL" ]]; then echo "codex-resume: could not resolve real codex. Set CODEX_REAL=/abs/path/to/codex" 1>&2; exit 1; fi\n';
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

function resolveRealCodex() {
  // Prefer explicit env hint if valid
  try {
    if (process.env.CODEX_REAL && fs.existsSync(process.env.CODEX_REAL)) return process.env.CODEX_REAL;
  } catch {}
  const avoid = path.join(os.homedir(), ".local", "bin");
  const dirs = String(process.env.PATH || "").split(path.delimiter);
  for (const d of dirs) {
    if (!d || d === avoid) continue;
    const p = path.join(d, "codex");
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        const txt = fs.readFileSync(p, "utf8");
        if (txt.includes("codex-shim.mjs")) continue; // skip wrapper
        return p;
      }
    } catch {}
  }
  // Fallback: if current codex has a .real sibling
  try {
    const first = execSync("command -v codex", { stdio: ["ignore","pipe","ignore"] }).toString().trim();
    if (first && fs.existsSync(first + ".real")) return first + ".real";
  } catch {}
  return null;
}
