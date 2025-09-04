codex-resume (English)

Minimal shim to enable “codex --resume”. It lists prior Codex CLI sessions for the current project root and resumes the selected one using the experimental_resume config.

What it does

- Adds a tiny wrapper so you can type: `codex --resume`.
- Shows only sessions under the current project root (Git top-level if available; otherwise the current directory).
- Table columns: `# | Elapsed | Turns | Summary`.
- Summary: first 15 chars of the first user message (environment blocks and code fences removed). Falls back to a reasoning summary if no user text is detected.
- Resume: launches `codex -c experimental_resume="/abs/path/rollout-*.jsonl"` and, when available, starts in the recorded cwd so relative commands work as before.

Requirements

- Codex CLI installed and `codex` available on PATH
- Node.js 18+ (for running npx)

Install (one-time)

```bash
npx codex-resume install
# Ensure ~/.local/bin is in your PATH (bash/zsh example)
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc
```

Use

```bash
codex --resume
# Pick a row by number to resume; press q to exit
```

Uninstall

```bash
rm ~/.local/bin/codex
```

Troubleshooting

- “codex not found”: install Codex CLI or ensure it’s on PATH. You can also set `CODEX_REAL=/absolute/path/to/codex` before running.
- “No sessions …”: start Codex once in this project and send one message to create a JSONL in `~/.codex/sessions`. Only logs with a matching project root are listed.
- Misaligned columns: output uses `|` separators and right-aligned numbers; appearance should be stable across terminals.

Notes

- Uses an experimental key: `experimental_resume`. Its behavior may change in future Codex releases.
- This shim forwards all arguments to the real `codex` except `--resume`, which triggers the picker.

About experimental_resume (important)

- What it does: Rehydrates the chat log from JSONL and preloads prior user/assistant turns so you can continue the thread.
- Not shared/not included: Running processes or terminal state, environment variable snapshots, editor state, in‑progress temp files, or your entire local workspace are not restored or “shared”. There is no automatic project upload or broad “context sharing”.
- CWD handling: The shim reads `cwd` from the JSONL and starts Codex in that directory (`spawn(..., { cwd })`). Codex itself is not resuming a VM.
- Reasoning summaries: `type:"reasoning"` `summary[].text` is for UI/log display; it is not sent as normal chat “messages” to the model.
- Privacy: This CLI only passes the JSONL path to Codex and does not upload the log by itself. Subsequent network I/O follows your normal Codex config (model/provider).

License

MIT
