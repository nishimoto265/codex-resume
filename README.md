codex-resume （日本語）

English version is available: [README.en.md](README.en.md).

![codex --resume screenshot](docs/assets/codex-resume.png)

できること

- 極小のラッパを追加して、`codex --resume` が使えるようにします。
- 現在のプロジェクトルート（Git の最上位があればそこ、なければカレントディレクトリ）配下のセッションのみを表示します。
- 表示列は `# | Elapsed | Turns | Summary`。
- 概要は「最初のユーザ発話の先頭15文字」（環境ブロックやコードは除去）。ユーザ文が取れない場合は reasoning の要約を使用します。
- 再開は `codex -c experimental_resume="/abs/path/rollout-*.jsonl"` で起動し、可能なら当時の `cwd` で開始します（相対コマンドの挙動が揃います）。

前提条件

- Codex CLI がインストール済みで、`codex` が PATH 上にある
- Node.js 18+（npx 実行に必要）

インストール（初回のみ）

```bash
npx codex-resume install
# PATH に ~/.local/bin を追加（bash/zsh の例）
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc
```

使い方

```bash
codex --resume
# 番号を入力でそのセッションを続きから再開、q で終了
```

アンインストール

```bash
rm ~/.local/bin/codex
```

トラブルシュート

- `codex not found`: Codex CLI をインストールし PATH に通してください。`CODEX_REAL=/abs/path/to/codex` を設定して使うこともできます。
- “No sessions …”: このプロジェクト直下で一度 Codex を起動して1行やり取りし、`~/.codex/sessions` に JSONL を生成してください。同一ルートのログのみが表示対象です。
- 表示のズレ: 出力は `|` 区切り＋数値列右寄せで安定表示にしています。

注意

- `experimental_resume` は実験的キーのため、将来挙動が変わる可能性があります。
- このラッパは `--resume` 以外の引数は本家 `codex` にそのまま渡します。

experimental_resume について（重要）

- 何をするか: 会話ログ（JSONL）の内容を読み込み、過去の user/assistant メッセージを初期履歴として「プリロード」します。これにより前回の続きから会話できます。
- 共有しない/含まれないもの: 実行中のプロセスや端末の状態、環境変数のスナップショット、開いていたエディタの状態、作業中の一時ファイル、ローカルのファイルツリー全体などは復元・共有されません。いわゆる“コンテキスト共有”やプロジェクトの自動アップロードは行いません。
- CWD の扱い: `cwd` はこのラッパ（シム）が JSONL から推定して `spawn(..., { cwd })` で反映します（Codex 本体が VM を復元するわけではありません）。
- reasoning の要約: `type:"reasoning"` の `summary[].text` は UI/ログ向けであり、モデルに送る通常の“メッセージ”としては扱われません。
- プライバシー: 本 CLI は JSONL の「パス」を Codex に渡すだけで、ログを独自に送信しません。以降の送受信は Codex の通常設定（選択したモデル/プロバイダ）に従います。

License

MIT
