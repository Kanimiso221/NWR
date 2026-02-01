# Cloudflare Lobby (BETA)

NEON WARDS: ROGUELITE の「ホストに集まって遊ぶ」ための **ロビー** です。
今の段階では **部屋作成 / 参加 / READY / START の合図** だけを扱います。
（ゲーム中の同期はまだしません）

## 1) Cloudflare 側のデプロイ

### 前提
- Cloudflare アカウント
- Node.js + npm
- `wrangler` CLI

### 手順
1. この `cloudflare_lobby` フォルダに移動
2. `wrangler login`
3. `wrangler deploy`

デプロイが成功すると、`https://<name>.<account>.workers.dev` のような URL が出ます。

## 2) ゲームから接続

タイトル画面の **MULTIPLAYER (BETA)** に以下を入力します。

- **Server**: `https://...workers.dev` または `wss://...workers.dev`
  - どちらでも大丈夫です（ゲーム側で ws/wss に変換します）
- **Name**: 表示名

### 遊び方
- HOST: 部屋を作成（コードが表示される）
- JOIN: もらったコードを入力して参加
- READY: 準備完了
- 全員 READY になったらホストが `START (HOST)` を押す

## 3) セキュリティ（Origin 制限）

`src/index.js` の `ALLOWED_ORIGINS` に、許可したい Origin を足していけます。
GitHub Pages で遊ぶ場合は `https://kanimiso221.github.io` で OK。

## メモ
- ルーム上限は 4 人にしてあります。
- ホストが抜けると部屋は閉じます（ホスト型の挙動）
- ここから先は「ゲーム中の同期（プレイヤー位置/弾/敵/乱数 seed）」を足していくフェーズです。