# ⑤ HTML / CSS / JS の設計

## 全体パイプライン

```
元資料 (md / txt)
   │  src/generate.mjs  … Claude に prompts/deck-system.md + schema/deck.schema.json を渡す
   ▼
deck.json  ← AI が書くのはここだけ（構成・レイアウト選択・文言）
   │  src/layouts.mjs validateDeck … 必須項目・要素数・文字数・3 連続チェック
   │  src/build.mjs renderDeck     … レイアウトごとのレンダラで HTML 化、CSS/JS をインライン
   ▼
deck.html  (単一ファイル。外部依存は Google Fonts のみ)
   │  src/export.mjs --check … Playwright で実描画し、はみ出し・フッター衝突・泣き別れを検出
   │       └─ 問題があれば generate.mjs が Claude に差し戻して再生成（最大 --rounds 回）
   ▼
ブラウザで発表 / --pdf / --png / --video
```

### なぜ「AI に HTML を書かせない」のか

| AI が HTML を直接書く | AI は JSON だけ書く（本設計） |
|---|---|
| 毎回デザインが揺れる | デザインはエンジンが固定 |
| 文字あふれを検出できない | 文字数を事前検証＋実描画で検査 |
| 修正で他の部分が崩れる | 修正はフィールド単位 |
| トークン消費が大きい | 出力は数 KB の JSON |

## ディレクトリ

```
slide-engine/
├── engine/
│   ├── deck.css        トークン / ステージ / 18 レイアウト / アニメーション / 一覧 / 書き出し
│   └── deck.js         縮小・操作・ステップ・カウントアップ・一覧・window.deck API
├── src/
│   ├── layouts.mjs     レンダラ + 検証ルール (1 レイアウト = rules + render)
│   ├── build.mjs       deck.json → 単一 HTML
│   ├── export.mjs      --check / --pdf / --png / --video
│   └── generate.mjs    元資料 → Claude → deck.json → HTML（自動修正ループ付き）
├── schema/deck.schema.json   AI 出力の JSON スキーマ（構造化出力に使用）
├── prompts/deck-system.md    AI の生成ルール（システムプロンプト）
├── tools/analyze-site.mjs    参照サイトの実装解析（CDP）
├── examples/                 全レイアウトのサンプル
└── docs/                     ①〜⑦
```

## HTML 構造

```html
<html lang="ja" class="theme-dark?" style="--accent:#…">
<body>
  <main class="stage">                                   ← 1920×1080、scale で縮小
    <section class="slide l-cards" data-layout="cards">  ← 1 枚
      <header class="head">
        <div class="kicker" data-anim="left" style="--i:0">…</div>
        <h2 class="title" data-anim="up" style="--i:1">…</h2>
        <p class="lead" data-anim="up" style="--i:2">…</p>
      </header>
      <div class="body">…レイアウト固有…</div>
      <footer class="chrome"><span>デッキ名</span><span class="num">03 / 20</span></footer>
      <aside class="notes" hidden>スピーカーノート</aside>
    </section>
    …
  </main>
  <script>/* deck.js */</script>
</body>
```

- スライドは **全て DOM に存在**し、`.is-active` だけが見える。→ 一覧・印刷・書き出しが同じ DOM で済む。
- スライドは `position:absolute; inset:0` で重ね、`opacity` + `visibility` で切り替える。

## CSS 設計

1. **トークン層**（`:root`）: 寸法・タイプスケール・色・モーション。`theme-dark` は色だけ上書き。
2. **ステージ層**: `.stage { transform: translate(-50%,-50%) scale(var(--scale)) }`。px で組んだまま縮小する。
3. **プリミティブ層**: `.kicker` `.title` `.lead` `.bullets` `.num` `.hl` `.chrome`。
4. **レイアウト層**: `.l-{layout}` にスコープ。他のレイアウトに影響しない。
5. **アニメーション層**: `[data-anim]` の初期状態 → `.is-active [data-anim]` で最終状態。遅延は `--i × --stagger`。
6. **モード層**: `.is-overview`（一覧）、`.is-export` / `@media print`（静止・縦並び・1 枚 1 ページ）。

### 16:9 の作り方の比較（採用理由）

| 方式 | 長所 | 短所 | 採否 |
|---|---|---|---|
| 固定 px + `transform: scale` | 改行・配置が全環境で完全一致。PDF と一致 | 縦長画面では小さくなる | **採用** |
| `aspect-ratio` + `cqw` 単位 | 縮小時もシャープ | 全サイズを cqw で書く必要があり、AI 生成・検査と相性が悪い | 不採用 |
| `vw` 単位 | 実装が簡単 | 縦横比が変わると崩れる | 不採用 |

## JS 設計（deck.js）

| 機能 | 実装 |
|---|---|
| 縮小 | `min(innerWidth/1920, innerHeight/1080)` を `--scale` に設定、`resize` で再計算 |
| 遷移 | `go(n, {step})` が `.is-active/.is-past/.is-current` を付け替え、hash を `#n` に更新 |
| ステップ | `next()` は未表示の `[data-step]` があればそれを表示、なければ次のスライドへ。`prev()` は逆 |
| キー | → ↓ Space Enter PgDn j l / ← ↑ PgUp BS k h / Home End / F 全画面 / O・Esc 一覧 / B 暗転 / N ノート |
| ポインタ | クリック: 左 1/3 で戻る・それ以外で進む。スワイプ 50px。ホイールは 600ms のロック付き |
| カウントアップ | スライドが active になったとき `[data-count]` を rAF で更新 |
| 一覧 | 全スライドを `translate + scale` でグリッド配置、クリックでそのスライドへ |
| 書き出し | `?export` で全スライドを active・全ステップ表示・縦並びにする |
| 外部 API | `window.deck = { go, next, prev, index, length, steps() }`（動画録画が使用） |
| イベント | `deck:change`（`{index, step}`）を document に発火 |

## SVG / Canvas / HTML の使い分け

| 対象 | 使用技術 | 理由 |
|---|---|---|
| テキスト・表・カード | HTML | 検索・選択・翻訳・PDF のテキスト化が効く |
| 棒グラフ・タイムライン | HTML + CSS（`--v` で幅） | 文字がシャープ、CSS トランジションで伸ばせる、依存なし |
| アイコン・装飾・矢印 | inline SVG（`currentColor`） | テーマ色に追従し、どの倍率でも鮮明 |
| 複雑なグラフ（散布図・折れ線） | 将来: inline SVG を生成するレイアウトを追加 | Canvas は書き出し時に解像度が落ち、テキストが PDF に残らない |
| 背景の生成アート・パーティクル | Canvas（使う場合のみ） | 大量の描画が必要なときだけ |

## 書き出し

| 形式 | 方法 |
|---|---|
| PDF | `?export` を Chromium で開き `page.pdf({ width:1920px, height:1080px })`。テキストは選択可能なまま |
| PNG | `?export` の各 `.slide` を要素スクリーンショット（1920×1080） |
| 動画 | Playwright の `recordVideo` で実再生を録画 → ffmpeg で H.264 MP4。`--dwell` で 1 ステップの秒数 |
| 検査 | `?export` で全テキスト要素の矩形を測り、スライド外・フッター衝突・見出しの泣き別れを JSON で返す |
