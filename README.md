# Misskey Bot Mia(みあ)

**Misskey 用サーバーレス bot — Google Apps Script + Google スプレッドシートで動作**

---

## 概要

- Mia(みあ)はMisskeyで動作するキャラクターBotです。Google Apps Script（GAS）で動作するため、サーバーの用意は不要です。設定・台詞・ユーザー管理はすべて Google スプレッドシートで行います。

- LLM（AI）はオプションです。`AI_PROVIDER = none` のままでも定期投稿・リアクション・星座占い・フォローバックなどの主要機能が動作します。

- [Misskey](https://github.com/misskey-dev/misskey) 2025.12.2 以降で動作を確認しています。
### 特徴

- **ゼロコスト**: Google 無料枠のみで完結（GAS 実行時間: 約 6〜17 分/日 = 上限 90 分の最大 19%）
- **スプレッドシート駆動**: 設定・台詞・ログがすべてシートで確認・編集できる
- **LLM フォールバック**: AI が使えない状況でも定型文・スコアベースで全機能が動作する
- **りいな互換設計**: [りいな](https://github.com/amiewa/mi_riina) と設定キー体系・機能を対称に設計

---

## 機能一覧

| 機能 | トリガー | LLM | デフォルト |
|------|---------|-----|----------|
| スケジュール投稿 | 1時間ごと | — | 有効 |
| ランダム投稿 | 1時間ごと | — | 有効 |
| 曜日別投稿 | 1時間ごと | — | 有効 |
| イベント投稿（記念日） | 1時間ごと | — | 有効 |
| TL 連動投稿 | 1時間ごと | 使用（失敗時→ランダム投稿） | 有効 |
| 投票投稿 | 1時間ごと | — | 有効 |
| 自動リアクション | 1時間ごと | — | 有効 |
| 星座占い | 1時間ごと | 選択可 | 無効 |
| メンション返信 | Webhook | 使用（失敗時→定型文） | 有効 |
| ニックネーム登録 | Webhook | — | 有効 |
| フォローバック | Webhook | — | 有効 |
| キーワードフォローバック | Webhook | — | 有効 |
| フォロー同期・自動解除 | 日次 | — | 無効（要明示有効化） |
| 自己投稿の自動削除 | 日次 | — | 無効（要明示有効化） |
| 台詞自動生成 | 手動メニュー | 必須 | — |
| 設定バリデーション | 手動メニュー | — | — |

---

## 必要なもの

- Google アカウント（Gmail）
- Misskey アカウント（bot 用トークン）
- LLM API キー（使用する場合のみ）
  - Gemini: [Google AI Studio](https://aistudio.google.com/)
  - OpenRouter: [openrouter.ai](https://openrouter.ai/)
  - Ollama: [ollama.com](https://ollama.com/)（Cloud アカウント）
- Node.js v18 以上（clasp でローカル開発する場合のみ）

---

## セットアップ

### 1. スプレッドシートと GAS プロジェクトを作成する

1. [Google スプレッドシート](https://sheets.google.com/) を新規作成する
2. メニューの「拡張機能」→「Apps Script」を開く
3. プロジェクト名を `mi_mia` などに変更する

### 2. スクリプトファイルを配置する

GAS エディタで以下の 4 ファイルを作成し、それぞれ `src/` 配下の内容を貼り付ける。

| ファイル名 | 内容 |
|-----------|------|
| `Core.gs` | 設定読込・LLM・Misskey API・NGフィルタ |
| `Features.gs` | 全投稿機能・mainDispatcher・占い・フォロー同期 |
| `Webhook.gs` | Webhook 受信・返信・フォローバック |
| `Setup.gs` | 初期設定・バリデーション・メニュー |

`appsscript.json` は「プロジェクトの設定」→「appsscript.json ファイルをエディタで表示する」を有効にしてから `src/appsscript.json` の内容で上書きする。

> **clasp を使う場合**: [clasp でのローカル開発](#clasp-でのローカル開発)を参照してください。

### 3. シートを初期化する

1. スプレッドシートを開く（GAS エディタではなく）
2. メニューに「みあbot」が表示されていない場合はページを再読み込みする
3. 「みあbot」→「初期設定（シート作成）」を実行する
4. 15 シートと初期データが自動作成される

### 4. 機密情報を設定する

機密情報の設定方法は 2 つあります。

**方法 A: スプレッドシートメニューから設定する（推奨）**

スプレッドシートのメニューから「みあbot」→「APIトークン管理」を選択し、画面の指示に従って各キーを設定する。設定状況（設定済み/未設定）が確認できます。

**方法 B: GAS エディタから直接設定する**

GAS エディタ左サイドバーの「プロジェクトの設定」→「スクリプト プロパティ」から以下を追加する。

| キー | 値 | 備考 |
|-----|-----|------|
| `MISSKEY_TOKEN` | Misskey のアクセストークン | 必須 |
| `GEMINI_API_KEY` | Gemini API キー | `AI_PROVIDER=gemini` 時のみ |
| `OLLAMA_API_KEY` | Ollama API キー | `AI_PROVIDER=ollama` 時のみ |
| `OLLAMA_BASE_URL` | `https://ollama.com` | Ollama Cloud のデフォルト値 |
| `OPENROUTER_API_KEY` | OpenRouter API キー | `AI_PROVIDER=openrouter` 時のみ |

> **Misskey トークンの作成**: Misskey の「設定」→「API」→「アクセストークンの発行」から作成してください。必要な権限: 「ノートを見る」「ノートを作成・削除する」「フォローする・しない」「リアクションする」

### 5. 設定シートを編集する

「設定」シートの以下の項目を最低限設定する。

| キー | 設定する値 | 備考 |
|-----|----------|------|
| `MISSKEY_INSTANCE` | `https://your.misskey.instance` | インスタンスの URL（末尾スラッシュ不要） |
| `BOT_ACTIVE` | `TRUE` | bot を有効化 |
| `AI_PROVIDER` | `none` | LLM を使わない場合は `none` のまま |

その他の設定はデフォルト値のまま動作します。詳細は[設定パラメータ一覧](#設定パラメータ一覧)を参照してください。

### 6. タイマートリガーを設定する

GAS エディタ左サイドバーの「トリガー」→「トリガーを追加」から設定する。

| 設定項目 | 値 |
|---------|-----|
| 実行する関数 | `mainDispatcher` |
| イベントのソース | 時間主導型 |
| 時間ベースのトリガーのタイプ | 1 時間おきのタイマー |

### 7. Webhook を設定する

メンション返信・フォローバックを使用する場合に必要です。

**GAS 側: Web アプリとしてデプロイする**

1. GAS エディタの「デプロイ」→「新しいデプロイ」
2. 種類: 「ウェブアプリ」
3. 次のユーザーとして実行: 「自分」
4. アクセスできるユーザー: 「全員」
5. 「デプロイ」→ 表示される URL をコピーする（`https://script.google.com/macros/s/...`）

**Misskey 側: Webhook を登録する**

1. Misskey の「設定」→「Webhook」→「追加」
2. URL: GAS でコピーした Web アプリ URL
3. 送信するイベント: `followed`、`mention` にチェック

### 8. 動作確認

1. スプレッドシートのメニューから「みあbot」→「設定バリデーション」を実行する
2. エラーがなければ「設定に問題はありません。」のトースト通知が表示される
3. GAS エディタから `mainDispatcher` を手動実行して「エラーログ」シートにエラーが記録されないことを確認する

---

## clasp でのローカル開発

```bash
# 依存パッケージのインストール
npm install

# Google アカウントにログイン
npx clasp login

# 既存プロジェクトに接続（GAS エディタの URL から scriptId を確認）
npx clasp clone <scriptId>
# または新規作成（スプレッドシートに紐づける場合は --parentId を指定）
npx clasp create --type sheets --title "mi_mia"

# GAS へアップロード
npm run push

# GAS からダウンロード
npm run pull

# ファイル監視（変更を自動アップロード）
npm run watch
```

> `<scriptId>` は GAS エディタの URL `https://script.google.com/home/projects/<scriptId>/edit` から確認できます。

> **Webhook 再デプロイについて**: `Webhook.gs` を変更した場合は、GAS エディタから「デプロイ」→「デプロイを管理」→「編集」→「新バージョン」で再デプロイが必要です。`Features.gs` や `Core.gs` の変更はデプロイ不要です。

---

## LLM プロバイダの設定

「設定」シートの `AI_PROVIDER` キーで使用するプロバイダを切り替えます。機能ごとに異なるプロバイダを指定する場合は `AI_FP_*` キーで上書きできます。

```
# 設定シートの例（一部）
AI_PROVIDER            = gemini           # デフォルトプロバイダ
AI_FP_REPLY            = openrouter       # 返信のみ OpenRouter を使用
AI_FP_HOROSCOPE        =                  # 空 = デフォルト (gemini) を使用
AI_GEMINI_MODEL        = gemini-2.0-flash-lite
AI_GEMINI_TEMPERATURE  = 1.0
AI_GEMINI_MAX_TOKENS   = 1024
AI_DAILY_LIMIT         = 100             # 全プロバイダ合算の日次呼び出し上限
AI_INPUT_MAX_CHARS     = 2500            # 入力テキストの最大文字数
```

| プロバイダ | 必要な ScriptProperties |
|-----------|----------------------|
| `gemini` | `GEMINI_API_KEY` |
| `ollama` | `OLLAMA_API_KEY`、`OLLAMA_BASE_URL` |
| `openrouter` | `OPENROUTER_API_KEY` |
| `none` | 不要 |

> **Ollama について**: GAS の `UrlFetchApp` はローカルネットワーク（`192.168.x.x` 等）にアクセスできません。セルフホストの Ollama を使うにはインターネット公開されたエンドポイントが必要です。`OLLAMA_BASE_URL` のデフォルトは `https://ollama.com`（Ollama Cloud）です。

---

## 設定パラメータ一覧

「設定」シートで変更できる主要な設定キーです。すべてにデフォルト値が設定されているため、最低限 `MISSKEY_INSTANCE` と `BOT_ACTIVE` だけ設定すれば動作します。

### 基本設定

| キー | デフォルト | 説明 |
|-----|----------|------|
| `MISSKEY_INSTANCE` | — | Misskey インスタンス URL（必須） |
| `BOT_ACTIVE` | `FALSE` | Bot の有効化 |
| `POSTING_VISIBILITY` | `home` | 投稿の公開範囲: `public` / `home` / `followers` |
| `POSTING_NIGHT_START` | `23` | 夜間停止の開始時刻 |
| `POSTING_NIGHT_END` | `6` | 夜間停止の終了時刻 |
| `AI_INPUT_MAX_CHARS` | `2500` | LLM 入力テキストの最大文字数（超過分は切り捨て） |
| `NG_WORDS_MATCH_MODE` | `substring` | NGワード照合方式（現在は `substring` のみ対応） |
| `NG_WORDS_EXTERNAL_URL` | （goodBadWordlist）| 外部NGワードリストの URL（1行1ワードのテキスト形式） |

### 投稿設定

| キー | デフォルト | 説明 |
|-----|----------|------|
| `SCHEDULED_POST_ENABLED` | `TRUE` | スケジュール投稿 |
| `SCHEDULED_POST_CHANCE` | `100` | スケジュール投稿の実行確率（%） |
| `RANDOM_POST_ENABLED` | `TRUE` | ランダム投稿 |
| `RANDOM_POST_INTERVAL_HOURS` | `4` | 投稿間隔（時間） |
| `RANDOM_POST_CHANCE` | `30` | 投稿確率（%） |
| `WEEKDAY_POST_ENABLED` | `TRUE` | 曜日別投稿 |
| `WEEKDAY_POST_CHANCE` | `30` | 投稿確率（%） |
| `TIMELINE_POST_ENABLED` | `TRUE` | TL 連動投稿（LLM 使用） |
| `TIMELINE_POST_INTERVAL_HOURS` | `6` | 投稿間隔（時間） |
| `TIMELINE_POST_CHANCE` | `70` | TL 連動投稿の実行確率（%） |
| `TIMELINE_POST_TYPE` | `local` | TL 種別: `local` / `home` / `hybrid` / `global` |
| `EVENT_POST_ENABLED` | `TRUE` | イベント（記念日）投稿 |
| `HOROSCOPE_ENABLED` | `FALSE` | 星座占い投稿 |
| `HOROSCOPE_HOUR` | `7` | 占い投稿時刻 |
| `HOROSCOPE_USE_AI` | `FALSE` | AI 占い（`FALSE` はスコアベース） |
| `HOROSCOPE_MAX_CHARS` | `500` | AI 占い生成の最大文字数 |
| `POLL_ENABLED` | `TRUE` | 投票投稿 |
| `POLL_INTERVAL_HOURS` | `12` | 投稿間隔（時間） |
| `POLL_CHANCE` | `50` | 投票投稿の実行確率（%） |
| `POLL_EXPIRE_HOURS` | `3` | 投票締め切り時間（時間） |
| `POLL_TIMELINE_TYPE` | `local` | 投票選択肢抽出用 TL 種別: `local` / `home` / `hybrid` / `global` |

### フォロー・返信設定

| キー | デフォルト | 説明 |
|-----|----------|------|
| `FOLLOW_AUTO_FOLLOW_BACK` | `TRUE` | 自動フォローバック |
| `FOLLOW_AUTO_UNFOLLOW_BACK` | `FALSE` | フォロー自動解除 |
| `FOLLOW_UNFOLLOW_GRACE_CYCLES` | `2` | 解除までの猶予日数 |
| `FOLLOW_KEYWORD_ENABLED` | `TRUE` | キーワードフォローバック |
| `FOLLOW_KEYWORDS` | `フォローして,followして,相互フォロー` | フォローキーワード（カンマ区切り） |
| `REPLY_ENABLED` | `TRUE` | メンション返信 |
| `REPLY_MUTUAL_ONLY` | `TRUE` | 相互フォローのみ返信 |
| `REPLY_MAX_PER_USER_PER_DAY` | `10` | 1 ユーザーあたりの日次返信上限 |
| `NICKNAME_ENABLED` | `TRUE` | ニックネーム登録（「○○って呼んで」） |
| `NICKNAME_MAX_LENGTH` | `20` | ニックネームの最大文字数 |
| `REACTION_ENABLED` | `TRUE` | 自動リアクション |
| `REACTION_MUTUAL_ONLY` | `TRUE` | 相互フォローのみリアクション |
| `REACTION_RECENCY_MINUTES` | `30` | リアクション対象ノートの最新分数 |
| `AFFINITY_ENABLED` | `TRUE` | 好感度システム |
| `AFFINITY_RANK2_THRESHOLD` | `5` | 好感度ランク 2 の閾値（会話回数） |
| `AFFINITY_RANK3_THRESHOLD` | `20` | 好感度ランク 3 の閾値（会話回数） |

### メンテナンス設定

| キー | デフォルト | 説明 |
|-----|----------|------|
| `MAINTENANCE_ENABLED` | `TRUE` | 日次メンテナンス（0時台に実行） |
| `MAINTENANCE_CLEANUP_DAYS` | `30` | ログ・投稿履歴の保持日数 |
| `MAINTENANCE_AUTO_DELETE_ENABLED` | `FALSE` | 自己投稿の自動削除 |
| `MAINTENANCE_DELETE_INTERVAL_SECONDS` | `2` | 削除 API 呼び出しの間隔（秒） |
| `MAINTENANCE_DELETE_MAX_RETRIES` | `3` | 削除失敗時のリトライ回数 |
| `ERROR_NOTIFY_ENABLED` | `FALSE` | エラー発生時のメール通知 |
| `ERROR_NOTIFY_EMAIL` | — | 通知先メールアドレス |
| `CONV_MAX_TURNS` | `3` | 会話履歴の保持ターン数（0 = 無効） |

---

## スプレッドシート構成

初期設定で作成される 15 シートの概要です。

| シート名 | 用途 |
|---------|------|
| 設定 | Bot 全設定値（Key / Value / 説明） |
| キャラクター設定 | LLM への System Prompt と各種応答メッセージ |
| スケジュール投稿 | 時刻指定の定型投稿（時間帯 / 投稿内容） |
| ランダム投稿 | ランダム選択用台詞プール |
| 曜日別 | 曜日+時刻指定投稿（時刻 / 曜日 / 台詞） |
| イベント | 日付指定の記念日投稿（MM/dd / イベント名 / 投稿内容 / 投稿済み） |
| 投票質問文 | アンケートの質問と接頭辞 |
| リアクション | キーワード→絵文字のルール定義 |
| フォールバック定型文 | LLM 失敗時・NGワード検出時の代替返信 |
| NGワード | 除外ワードリスト（1行1ワード） |
| ユーザー管理 | 好感度追跡（UserId / 最終会話日時 / 総会話数 / ニックネーム） |
| ダッシュボード | 日次統計（投稿数・返信数・リアクション数・フォローバック数・AI 使用数・エラー数・URL Fetch 概算・アンフォロー数） |
| エラーログ | エラー記録（日時 / 関数名 / エラー内容） |
| 投稿履歴 | 自己投稿削除用（noteId / 投稿日時 / 投稿種別） |
| フォロー管理 | フォロー同期用（userId / isFollower / iAmFollowing / missingCount） |

---

## GAS の制約と運用規模

みあはフォロー/フォロワー各 100 前後、最大 300 程度の小規模運用を想定しています。

| GAS の制限 | 上限値 | みあの想定消費 |
|-----------|--------|-------------|
| スクリプト総実行時間 | 90 分/日 | 約 6〜17 分/日 |
| URL Fetch 回数 | 20,000 回/日 | 約 292 回/日 |
| 実行時間（1 回あたり） | 6 分 | `isTimeSafe()` ガードで対応 |

大規模運用（フォロワー 500 以上等）には [りいな](https://github.com/amiewa/mi_riina)（Python/Docker/VPS）を推奨します。

---

## テスト

```bash
npm test
```

`tests/core/` 配下に GAS 環境に依存しない単体テスト（Jest）があります。

| テストファイル | カバー範囲 |
|-------------|----------|
| `tests/core/cleanNoteText.test.js` | MFM・URL・コードブロック等の除去 |
| `tests/core/containsNGWord.test.js` | NGワード部分一致判定 |
| `tests/core/isNightTime.test.js` | 夜間判定（日付またぎ対応） |
| `tests/core/isTimeSafe.test.js` | 実行時間ガード |
| `tests/core/conversationHistory.test.js` | 会話履歴の保存・取得・上限管理 |

---

## トラブルシューティング

**Bot が投稿しない**
- 「設定」シートの `BOT_ACTIVE` が `TRUE` になっているか確認する
- `MISSKEY_INSTANCE` と `MISSKEY_TOKEN`（ScriptProperties）が正しく設定されているか確認する
- 「みあbot」→「設定バリデーション」でエラーがないか確認する
- 現在の時刻が `POSTING_NIGHT_START` 〜 `POSTING_NIGHT_END` の範囲内ではないか確認する
- GAS エディタの「実行」→「関数を実行」から `mainDispatcher` を手動実行してエラーを確認する

**Webhook が動作しない（メンション返信・フォローバックが機能しない）**
- GAS の Web アプリが「全員」アクセス可能でデプロイされているか確認する
- Misskey の Webhook 設定で URL が正しく設定されているか確認する
- `Webhook.gs` を変更した後に再デプロイ（新バージョン）を実施したか確認する

**LLM が動作しない**
- 使用プロバイダの API キーが ScriptProperties に正しく設定されているか確認する
- 「設定」シートの `AI_PROVIDER` のスペルを確認する（`gemini` / `ollama` / `openrouter` / `none`）
- 「ダッシュボード」シートの AI 数列を確認し、`AI_DAILY_LIMIT` に達していないか確認する

**エラーの確認方法**
- 「エラーログ」シートに関数名とエラー内容が記録される
- GAS エディタ左サイドバーの「実行数」からも確認できる
- `ERROR_NOTIFY_ENABLED = TRUE` と `ERROR_NOTIFY_EMAIL` を設定するとメールで通知される

## 参考にしたMisskey Bot
本プロジェクトは、以下のプロジェクトを参考にさせていただきました。深く感謝申し上げます。
- [藍ちゃん](https://github.com/syuilo/ai) 

## 参照プロジェクト
- [goodBadWordlist](https://github.com/sayonari/goodBadWordlist) NGワードリストとして利用

## 関連プロジェクト
- [Misskey Bot Riina(りいな)](https://github.com/amiewa/mi_riina) — Python/Docker 版。WebSocket ストリーミング・SQLite・ワードクラウド対応

## ライセンス
本プロジェクトは [MIT License](LICENSE) です。
