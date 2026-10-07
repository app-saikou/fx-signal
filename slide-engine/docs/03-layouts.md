# ③ スライドレイアウト一覧

18 種（うち汎用の `bullets` は最後の手段）。実物は `examples/sample.html`（ブラウザで開く）で確認できる。

| layout | 型 | 構造 | 主なフィールド | 上限（validate） | 良く見える理由 |
|---|---|---|---|---|---|
| `cover` | 表紙 | 左上 kicker / 左下に巨大タイトル / 最下段に罫線＋メタ情報。右上に装飾円 (SVG) | kicker, title, subtitle, meta, date | title 34, subtitle 60 | 情報を上下の端に寄せ、中央に大きな余白を残す |
| `agenda` | 目次 | 2 カラムの番号付きリスト、各行に罫線 | title, items[].heading | 2〜8 項目, heading 22 | 番号をアクセント色の等幅数字にして縦の軸を作る |
| `section` | 章扉 | 反転色。巨大な細字番号 (320px / weight 200) ＋見出しを左下に | title, subtitle, number | title 24 | 色の反転と細字×太字の対比でデッキに句読点を打つ |
| `statement` | 巨大文字 | 104px の一文を左寄せで垂直中央に | kicker, text, sub | text 44 | 1 枚に 1 文だけ。強調語だけアクセント色 |
| `bigNumber` | 数値強調 | 左に最大 400px の数字（桁数で自動縮小）、右に意味づけ | value, unit, label, sub | value 6, label 30 | 数字を「絵」として扱う。単位は 0.32em に落とす |
| `stats` | KPI 並列 | 2〜4 列。上罫線＋152px の数字＋説明 | title, items[].value/unit/label | 2〜4 項目 | 先頭だけアクセント色にして読む順番を示す |
| `twoColumn` | 2 カラム | 見出し付きの 2 列（罫線で区切る） | title, left, right {heading, body, bullets} | — | 列幅を等分し、上端と罫線位置を揃える |
| `compare` | 比較 | 左パネル（グレー・線アイコン）→ 矢印 → 右パネル（アクセント枠・チェック） | title, left/right {label, items} | items 5 / 30 字 | 右側だけ色を持たせ「どちらが良いか」を色で言う |
| `cards` | 要点 3 つ | 2〜4 枚のカード（番号・見出し・本文） | title, lead, items[].heading/body | 2〜4, heading 18, body 80 | カードの高さを揃え、番号で並列関係を示す |
| `process` | 図解・フロー | 番号付きの円を線でつなぐ。最後のステップがアクセント | title, items[].heading/body | 3〜5, heading 14, body 50 | ゴールだけ色を変えて流れの終点を示す |
| `timeline` | タイムライン | 横の時間軸（描画アニメーション）上に点と日付 | title, items[].date/heading/body, highlight | 3〜6 | 「今」の点だけ塗りつぶす |
| `chart` | グラフ | HTML/CSS の横棒。ラベル・棒・値の 3 列グリッド | title, lead, items[].label/value, unit, highlight, note | 2〜8, label 12 | 主役の棒だけアクセント、他はグレー。値を棒の外に大きく |
| `image` | 画像全面 | 全面写真＋下部グラデーション＋白文字 | image, title, caption, kicker | title 36 | 文字を下 1/3 に寄せ、写真の主題を潰さない |
| `imageSplit` | 画像＋説明 | 左半分が写真（裁ち落とし）、右半分が本文 | image, kicker, title, body, bullets | title 30 | 写真を裁ち落とすことで余白と面の対比を作る |
| `quote` | 引用 | 巨大な引用符（セリフ体・アクセント）＋ 64px の本文 | text, cite | text 80 | 引用符だけセリフ体にして「声」であることを示す |
| `table` | 表 | 罫線のみの表。推し列だけ薄いアクセント面 | title, columns, rows, highlight | 列 5, 行 6 | 縦罫線を使わない。ヘッダーは小さく灰色に |
| `bullets` | 箇条書き | 角マーカーの箇条書き | title, bullets | 1〜6 | — 最後の手段。他の型に変換できないか先に検討 |
| `closing` | 締め | 巨大タイトル＋罫線＋連絡先 | title, subtitle, meta | title 30 | 表紙と同じ構造で始まりと終わりを対にする |

## インライン記法（全テキスト共通）

| 記法 | 効果 |
|---|---|
| `**語**` | アクセント色で強調（1 スライド 1 箇所まで） |
| `==語==` | マーカー（下半分に薄いアクセント面） |
| `\n` | 改行（見出しを意味の切れ目で折るとき） |

## スライド共通オプション

| フィールド | 効果 |
|---|---|
| `steps: true` | items / bullets をクリックごとに 1 つずつ表示 |
| `notes` | スピーカーノート（N キーで表示、HTML には非表示で埋め込み） |
| `chrome: false` | フッター（デッキ名・ページ番号）を消す |

## レイアウト選択フローチャート

```
数字が主役？ ──yes──> 1 個 → bigNumber / 2〜4 個 → stats / 量の比較 → chart
   │no
対比？ ──yes──> 良い/悪いがある → compare / 並列の観点 → twoColumn / 多属性 → table
   │no
順序がある？ ──yes──> 手順 → process / 時間 → timeline
   │no
一文で言える？ ──yes──> statement（引用なら quote）
   │no
並列の要点 2〜4 個？ ──yes──> cards
   │no
写真がある？ ──yes──> image / imageSplit
   │no
bullets（6 項目以下）、または分割
```

## 新しいレイアウトの追加手順

1. `src/layouts.mjs` の `layouts` に `{ rules, render }` を追加（`anim(ctx, kind)` で入場アニメーションを付ける）。
2. `engine/deck.css` に `.l-{name}` のスタイルを追加（トークンのみ使用）。
3. `schema/deck.schema.json` の `layout.enum` に追加。
4. `prompts/deck-system.md` の選択表に 1 行追加。
5. `examples/sample.deck.json` に 1 枚追加し、`npm run sample && node src/export.mjs examples/sample.html --check`。
