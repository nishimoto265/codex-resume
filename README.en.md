# codex-resume (English)

**Minimal shim to enable "codex --resume".** It lists prior Codex CLI sessions for the current project root and resumes the selected one using the experimental_resume config.

---

## 📌 What it does

- **Adds a tiny wrapper** so you can type: **`codex --resume`**
- **Shows only sessions** under the current project root (Git top-level if available; otherwise the current directory)
- **Table columns:** `# | Elapsed | Turns | Summary`
- **Summary:** First 15 chars of the first user message (environment blocks and code fences removed). Falls back to a reasoning summary if no user text is detected
- **Resume:** Launches `codex -c experimental_resume="/abs/path/rollout-*.jsonl"` and, when available, starts in the recorded cwd so relative commands work as before

---

## 📋 Requirements

- **Codex CLI** installed and `codex` available on PATH
- **Node.js 18+** (for running npx)

---

## 💿 Install (one-time)

```bash
npx codex-resume install
```

> 💡 Right after install, if `codex` does not resolve or points to an old path, open a new terminal (or clear the shell hash: bash `hash -r`, zsh `rehash`)

---

## 🎯 Use

```bash
codex --resume
# Pick a row by number to resume; press q to exit
```

---

## 🗑️ Uninstall

```bash
rm ~/.local/bin/codex
```

> 💡 After uninstall, open a new terminal (or clear the shell hash) to ensure the original `codex` is resolved again

---

## 🔧 Troubleshooting

### Common Issues

- **"codex not found"**  
  Install Codex CLI or ensure it's on PATH. You can also set `CODEX_REAL=/absolute/path/to/codex` before running

- **"No sessions …"**  
  Start Codex once in this project and send one message to create a JSONL in `~/.codex/sessions`. Only logs with a matching project root are listed

- **Misaligned columns**  
  Output uses `|` separators and right-aligned numbers; appearance should be stable across terminals

### Shell Command Hash (Cache)

Right after install/uninstall, `codex` may still resolve to the old path or be "not found". Clear the shell's command hash or open a new terminal:

- **bash:** `hash -d codex 2>/dev/null; hash -r`
- **zsh:** `rehash`
- Verify with `type -a codex` to see resolution order

---

## ⚠️ Notes

- Uses an **experimental key:** `experimental_resume`. Its behavior may change in future Codex releases
- This shim forwards all arguments to the real `codex` except `--resume`, which triggers the picker

---

## 📚 About experimental_resume (Important)

### ✅ What it does
- Rehydrates the chat log from JSONL and preloads prior user/assistant turns so you can continue the thread

### ❌ Not shared/not included
- Running processes or terminal state
- Environment variable snapshots
- Editor state
- In‑progress temp files
- Your entire local workspace

> There is no automatic project upload or broad "context sharing"

### 🔍 Technical Details

- **CWD handling:** The shim reads `cwd` from the JSONL and starts Codex in that directory (`spawn(..., { cwd })`). Codex itself is not resuming a VM
- **Reasoning summaries:** `type:"reasoning"` `summary[].text` is for UI/log display; it is not sent as normal chat "messages" to the model
- **Privacy:** This CLI only passes the JSONL path to Codex and does not upload the log by itself. Subsequent network I/O follows your normal Codex config (model/provider)
