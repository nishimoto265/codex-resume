#!/usr/bin/env node
// Minimal shim for: codex --resume
// Behavior:
// - If invoked with --resume: list sessions under the same project root (git top-level or cwd) and let user pick one to resume via experimental_resume.
// - Otherwise: pass through to the real `codex` binary.

import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { spawn, execSync } from "child_process";
import readline from "readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOME = os.homedir();
const CODEX_HOME = path.join(HOME, ".codex");
const SESSIONS_DIR = resolveSessionsDir();

const args = process.argv.slice(2);
const wantsResume = args.includes("--resume");

(async function main() {
  if (!wantsResume) {
    // pass-through
    return passthrough(args);
  }

  const root = detectProjectRoot();
  if (process.env.DEBUG_RESUME) {
    console.error(`[debug] sessions_dir=${SESSIONS_DIR}`);
    console.error(`[debug] project_root=${root}`);
  }
  const sessions = await collectSameRootSessions(SESSIONS_DIR, root, 50);
  if (process.env.DEBUG_RESUME) {
    console.error(`[debug] sessions.length=${sessions.length}`);
  }
  if (sessions.length === 0) {
    console.error(`No sessions under project root: ${root}`);
    process.exit(1);
  }
  printTable(sessions);
  const index = await ask(`\nResume which? (1-${sessions.length} or 'q' to quit): `);
  if (String(index).toLowerCase().startsWith("q")) process.exit(0);
  const idx = Number(index) - 1;
  if (Number.isNaN(idx) || idx < 0 || idx >= sessions.length) {
    console.error("Invalid selection");
    process.exit(1);
  }
  const chosen = sessions[idx];
  await resumeWithCodex(chosen);
})();

function resolveSessionsDir() {
  const defaultDir = path.join(CODEX_HOME, "sessions");
  try {
    const j = path.join(CODEX_HOME, "config.json");
    if (fs.existsSync(j)) {
      const cfg = JSON.parse(fs.readFileSync(j, "utf8"));
      const dataDir = cfg?.data_dir || cfg?.dataDir || cfg?.root_dir || cfg?.rootDir;
      if (dataDir && fs.existsSync(dataDir)) {
        const candidate = path.join(dataDir, "sessions");
        if (fs.existsSync(candidate)) return candidate;
      }
      if (cfg?.sessions_dir && fs.existsSync(cfg.sessions_dir)) return cfg.sessions_dir;
    }
  } catch {}
  try {
    const t = path.join(CODEX_HOME, "config.toml");
    if (fs.existsSync(t)) {
      const txt = fs.readFileSync(t, "utf8");
      const get = (k) => txt.match(new RegExp(String.raw`${k}\s*=\s*"([^"]+)"`))?.[1];
      const sessionsDir = get("sessions_dir");
      const dataDir = get("data_dir") || get("root_dir");
      if (sessionsDir && fs.existsSync(sessionsDir)) return sessionsDir;
      if (dataDir) {
        const candidate = path.join(dataDir, "sessions");
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  } catch {}
  return defaultDir;
}

function detectProjectRoot() {
  try {
    const out = execSync("git rev-parse --show-toplevel", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    if (out) return out;
  } catch {}
  return process.cwd();
}

async function collectSameRootSessions(rootDir, projectRoot, limit) {
  const files = await walk(rootDir, f => f.endsWith(".jsonl"));
  const rows = [];
  let scanned = 0, matched = 0;
  for (const file of files) {
    try {
      scanned++;
      const stat = fs.statSync(file);
      const meta = await quickMeta(file);
      const ok = startsWithPath(meta.cwd || "", projectRoot);
      if (!ok) {
        if (process.env.DEBUG_RESUME && matched < 5) {
          console.error(`[debug] skip: ${file} cwd=${JSON.stringify(meta.cwd)}`);
        }
        continue;
      }
      matched++;
      if (process.env.DEBUG_RESUME) {
        console.error(`[debug] add: ${file}`);
      }
      const ago = formatElapsed(stat.mtime);
      rows.push({
        id: path.basename(file).replace(/\.jsonl$/, ""),
        file,
        cwd: meta.cwd || "",
        turns: meta.turns,
        preview: meta.preview || "",
        mtime: stat.mtime,
        hoursAgo: Math.max(0, Math.floor((Date.now() - stat.mtime.getTime()) / 3600000)),
        ago,
      });
      if (process.env.DEBUG_RESUME) {
        console.error(`[debug] rows.length now=${rows.length}`);
      }
    } catch {}
  }
  if (process.env.DEBUG_RESUME) {
    console.error(`[debug] scanned=${scanned} matched=${matched} rows=${rows.length} limit=${limit} typeof(limit)=${typeof limit}`);
  }
  rows.sort((a, b) => b.mtime - a.mtime);
  return rows;
}

async function quickMeta(file) {
  const stream = fs.createReadStream(file, { encoding: "utf8" });
  let buf = "", turns = 0, cwd = "", preview = "";
  for await (const chunk of stream) {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        const j = JSON.parse(line);
        const role = j?.role || j?.message?.role;
        if (role === "user" || /"role"\s*:\s*"user"/.test(line)) {
          turns++;
          if (!preview) {
            const raw = extractUserText(j);
            const cleaned = summarizeUserText(raw, 15);
            if (cleaned) preview = cleaned;
          }
        }
        // If we still don't have preview, try reasoning.summary or assistant text (fallback)
        if (!preview && j?.summary) {
          const raw = extractText(j);
          const cleaned = summarizeUserText(raw, 15);
          if (cleaned) preview = cleaned;
        }
        if (!cwd) {
          // 1) structured fields
          cwd = j?.environment?.cwd || j?.cwd || "";
          // 2) JSON-like in string content
          if (!cwd && typeof j?.content === "string" && j.content.includes('"cwd"')) {
            cwd = (j.content.match(/"cwd"\s*:\s*"([^"]+)"/)?.[1] || "");
          }
          // 3) XML-like <cwd> in environment_context
          if (!cwd) {
            const text = typeof j?.content === "string" ? j.content : Array.isArray(j?.content) ? j.content.map(c => c?.text || "").join("\n") : "";
            if (text.includes("<cwd>")) {
              cwd = (text.match(/<cwd>([^<]+)<\/cwd>/)?.[1] || "");
            }
          }
          // 4) deep search
          if (!cwd) cwd = deepFindPath(j, ["cwd", "workdir", "working_directory", "dir", "directory"]);
        }
        if (cwd) cwd = String(cwd).trim();
      } catch {}
    }
  }
  return { turns, cwd, preview };
}

function extractText(j) {
  // Prefer reasoning.summary text if present
  if (j?.summary && Array.isArray(j.summary)) {
    const s = j.summary.map(x => x?.text).filter(Boolean).join(" ");
    if (s) return s.slice(0, 500);
  }
  if (typeof j.content === "string") return j.content.slice(0, 500);
  if (Array.isArray(j.content)) {
    const t = j.content.find(c => c?.type === "text" && c?.text)?.text;
    if (t) return String(t).slice(0, 500);
  }
  if (j.text) return String(j.text).slice(0, 500);
  if (j?.message?.content && typeof j.message.content === "string") return j.message.content.slice(0, 500);
  return "";
}

function extractUserText(j) {
  let t = "";
  if (typeof j.content === "string") t = j.content;
  else if (Array.isArray(j.content)) {
    const chunk = j.content.find(c => typeof c?.text === "string" && c.text.trim());
    if (chunk) t = String(chunk.text);
  }
  if (!t && j.text) t = String(j.text);
  return t || "";
}

function sanitizePreview(s, maxLen = 120) {
  if (!s) return "";
  let t = String(s);
  // Drop environment_context blocks
  t = t.replace(/<environment_context>[\s\S]*?<\/environment_context>/g, "");
  // Strip code fences
  t = t.replace(/```[\s\S]*?```/g, "");
  // Collapse whitespace and newlines
  t = t.replace(/\s+/g, " ").trim();
  // Keep it concise
  return truncate(t, maxLen);
}

// Heuristic summary for user messages: drop boilerplate and take first meaningful line.
function summarizeUserText(s, maxLen = 15) {
  if (!s) return "";
  let t = String(s);
  // Remove environment blocks and code blocks
  t = t.replace(/<environment_context>[\s\S]*?<\/environment_context>/g, "");
  t = t.replace(/```[\s\S]*?```/g, "\n");
  // Normalize line breaks
  t = t.replace(/\r\n?/g, "\n");

  // If the message contains the IDE context template, try to take the request part
  const idxReq = t.indexOf("My request for Codex:");
  if (idxReq >= 0) {
    const sub = t.slice(idxReq + "My request for Codex:".length);
    const req = pickFirstMeaningfulLine(sub);
    if (req) return truncate(req, maxLen);
  }

  // Drop common boilerplate sections
  t = t.replace(/#\s*Context\s*from[\s\S]*?(\n\n|$)/gi, "\n");
  t = t.replace(/^##?\s+Active file:[\s\S]*?(\n\n|$)/gim, "\n");
  t = t.replace(/^##?\s+Open tabs:[\s\S]*?(\n\n|$)/gim, "\n");
  t = t.replace(/^##?\s+My request for Codex:[\s\S]*?\n/gim, "");

  const first = pickFirstMeaningfulLine(t);
  if (first) return truncate(first, maxLen);

  // Fallback to sanitized preview
  return sanitizePreview(s, maxLen);
}

function pickFirstMeaningfulLine(text) {
  const lines = String(text).split("\n").map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    // Skip markdown headings, list bullets, and obvious boilerplate
    if (/^#{1,6}\s/.test(line)) continue;
    if (/^[-*]\s/.test(line)) continue;
    if (/^Active file:|^Open tabs:|^Context\b|^#\s*Context\b/i.test(line)) continue;
    if (/^Token usage:|^Usage: codex\b/i.test(line)) continue;
    // Must contain some letters or CJK
    if (/[A-Za-z\u3040-\u30FF\u4E00-\u9FFF]/.test(line)) return line;
  }
  return "";
}

function deepFindPath(obj, keys) {
  try {
    if (!obj || typeof obj !== "object") return "";
    const stack = [obj];
    while (stack.length) {
      const cur = stack.pop();
      for (const k of Object.keys(cur)) {
        const v = cur[k];
        if (keys.includes(k) && typeof v === "string" && looksLikePath(v)) return v;
        if (v && typeof v === "object") stack.push(v);
      }
    }
  } catch {}
  return "";
}

function looksLikePath(s) {
  return /^\/.{2,}/.test(s) || /^[A-Za-z]:\\/.test(s);
}

function startsWithPath(p, base) {
  const np = normalizeForCompare(p);
  const nb = normalizeForCompare(base);
  return np === nb || np.startsWith(nb + path.sep);
}

function normalizeForCompare(p) {
  if (!p) return "";
  let s = p.replace(/\\/g, "/");
  try { s = path.resolve(p).replace(/\\/g, "/"); } catch {}
  if (s.endsWith("/")) s = s.slice(0, -1);
  return s;
}

function truncate(s, n) {
  const t = String(s || "");
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
}

function formatElapsed(mtime) {
  const d = Date.now() - mtime.getTime();
  const h = Math.floor(d / 3600000);
  const m = Math.floor((d % 3600000) / 60000);
  if (h <= 0) return `${m}m`;
  return `${h}h${m}m`;
}

function printTable(rows) {
  console.log("");
  const header = [
    padW("#", 3),
    lpadW("Elapsed", 9),
    lpadW("Turns", 5),
    "Summary"
  ].join(" | ");
  console.log(header);
  console.log("-".repeat(140));
  rows.forEach((r, i) => {
    const line = [
      padW(String(i + 1), 3),
      lpadW(r.ago || "", 9),
      lpadW(String(r.turns ?? "-"), 5),
      (r.preview || "")
    ].join(" | ");
    console.log(line);
  });
}

function padW(str, width) {
  const s = String(str ?? "");
  const w = stringWidth(s);
  if (w >= width) return s;
  return s + " ".repeat(width - w);
}

function lpadW(str, width) {
  const s = String(str ?? "");
  const w = stringWidth(s);
  if (w >= width) return s;
  return " ".repeat(width - w) + s;
}

function stringWidth(str) {
  // Approximate wcwidth for typical terminals (treat common CJK as width 2)
  let w = 0;
  const s = String(str ?? "");
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
      // control chars: width 0
      continue;
    }
    if (isFullWidth(code)) w += 2; else w += 1;
  }
  return w;
}

function isFullWidth(code) {
  return (
    code >= 0x1100 && (
      code <= 0x115f ||
      code === 0x2329 || code === 0x232a ||
      (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe19) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6)
    )
  );
}

async function resumeWithCodex(row) {
  const arg = `experimental_resume="${row.file}"`;
  const bin = findRealCodex();
  if (!bin) {
    console.error("Could not locate the real 'codex' binary. Set CODEX_REAL to its path.");
    process.exit(1);
  }
  console.log(`\nLaunching: ${bin} -c ${arg}`);
  const runCwd = row.cwd && fs.existsSync(row.cwd) ? row.cwd : process.cwd();
  const child = spawn(bin, ["-c", arg], { stdio: "inherit", cwd: runCwd, shell: true });
  child.on("exit", code => process.exit(code ?? 0));
}

function passthrough(argv) {
  const bin = findRealCodex();
  if (!bin) {
    console.error("Could not locate the real 'codex' binary. Set CODEX_REAL to its path.");
    process.exit(1);
  }
  const filtered = argv.filter(a => a !== "--resume");
  const child = spawn(bin, filtered, { stdio: "inherit", cwd: process.cwd(), shell: true });
  child.on("exit", code => process.exit(code ?? 0));
}

function findRealCodex() {
  // 1) explicit override
  if (process.env.CODEX_REAL && fs.existsSync(process.env.CODEX_REAL)) return process.env.CODEX_REAL;
  // 2) scan PATH, skip our own file path directory
  const selfDir = __dirname;
  const exts = process.platform === "win32" ? [".cmd", ".exe", ""] : [""];
  const envPath = (process.env.PATH || "").split(path.delimiter);
  for (const dir of envPath) {
    if (!dir || normalizeForCompare(dir) === normalizeForCompare(selfDir)) continue;
    for (const ext of exts) {
      const p = path.join(dir, `codex${ext}`);
      try {
        if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
      } catch {}
    }
  }
  return null;
}

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question(q, ans => { rl.close(); res(ans); }));
}

async function walk(dir, filterFn) {
  const out = [];
  async function recur(d) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await recur(p);
      else if (filterFn(p)) out.push(p);
    }
  }
  await recur(dir);
  return out;
}
