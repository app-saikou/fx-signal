# ① Plume Deck 解析

対象: https://re-presentation.jp/tool/plume-deck.html

## 0. ステータス — 実物解析は **未実施**

このリポジトリを作業したクラウド環境では、ネットワークポリシーで `re-presentation.jp` への接続が拒否された（curl・WebFetch・ヘッドレス Chromium のいずれも 403 / エラーページ）。Chrome DevTools MCP も同じ Chromium を同じプロキシ経由で動かすため、MCP を入れても結果は変わらない。

そのため、このドキュメントは **「何を・どう測るか」と記入欄** で構成し、実測値は未記入のままにしている。②〜⑦ のデザインルールとエンジンは、HTML スライドの一般的なベストプラクティスに基づく **v0.1** で、Plume Deck の実測値ではない。実測後に下の「差分表」を埋め、トークン（`engine/deck.css` の `:root`）を調整して v0.2 にする。

### 実行方法（どちらか）

**A. 解析スクリプト（推奨・再現可能）**

```bash
cd slide-engine
npx playwright install chromium   # 未導入なら
node tools/analyze-site.mjs https://re-presentation.jp/tool/plume-deck.html analysis/plume-deck --steps 15
# → analysis/plume-deck/summary.md, report.json, dom.html, css/, js/, shots/
```

**B. Chrome DevTools MCP（対話的に深掘り）**

リポジトリ直下の `.mcp.json` に設定済み。ローカルの Claude Code で開くと `chrome-devtools` サーバーが使える。

```
1. navigate_page で https://re-presentation.jp/tool/plume-deck.html を開く
2. take_snapshot で DOM ツリー、list_network_requests で読み込みリソースを確認
3. evaluate_script で下の「計測スニペット」を実行
4. press_key ArrowRight → take_screenshot を繰り返し、遷移とアニメーションを観察
5. performance_start_trace / performance_stop_trace で遷移中のアニメーションを記録
6. resize_page 1280x720 / 390x844 でレスポンシブ挙動を確認
```

クラウド環境で実行したい場合は、環境設定の Network access で `re-presentation.jp` を Allowed domains に追加する（[手順](https://code.claude.com/docs/en/cloud-environments#network-access)）。

## 1. 計測項目と判定方法

| # | 項目 | 何を見るか | スクリプト出力 | 判定のしかた |
|---|---|---|---|---|
| 1 | スライド 1 枚の構造 | スライド要素のタグ・クラス・子要素の階層、`data-*` 属性 | `structure.selector`, `firstSlideOuterOutline`, `attrsOnSlides` | `section` 等の兄弟が N 個並ぶか / 1 要素の中身を差し替えているか（SPA 型） |
| 2 | 16:9 の作り方 | 固定 px + `transform: scale()` / `aspect-ratio` / `vw`・`cqw` 単位 | `slideBox.width/height/aspectRatio`, `container.transform`, `css.uses` | `transform` に `matrix(s,0,0,s,…)` があれば固定キャンバス縮小型。`aspect-ratio:16/9` + `cqw` ならコンテナクエリ型 |
| 3 | ページ切り替え | クラス付け替え / `translateX` でトラック移動 / `scroll-snap` / View Transitions | `navigation.steps[].active`, `hash`, `scrollX/Y`, `css.uses["scroll-snap"]`, `view-transition` | 遷移ごとに変わったのが「クラス」「transform」「スクロール位置」「hash」のどれか |
| 4 | キーボード・クリック | `keydown` / `click` / `wheel` / `touch*` / `pointer*` のリスナー | `listeners.window/document/body`, `navigation.workingKey`, `clickRightAdvances` | ハンドラ先頭 400 文字から対応キーを読む |
| 5 | アニメーション | `@keyframes` 名、`transition`、遷移直後に走っている `Animation` の duration / delay / easing / keyframes | `css.keyframes`, `navigation.steps[].animations`, `shots/NN-mid.png` | delay が等差なら stagger。easing と移動量（keyframes の transform）を記録 |
| 6 | フォント・余白・文字サイズ | font-family / size / weight / line-height / letter-spacing の出現頻度、`:root` 変数、gap / padding | `design.*`, `slideBox.padding`, `css.customProperties` | 出現上位のサイズ列から比率（タイプスケール）を割り出す |
| 7 | SVG / Canvas / HTML | 要素数と用途 | `structure.media` | 図解が SVG か、背景演出が Canvas/WebGL か |
| 8 | 外部ライブラリ | グローバル変数・CDN スクリプト | `libraries`, `network` | 何も出なければ自前の素の JS |
| 9 | レスポンシブ | 各 viewport でのスライド矩形・縮小率・スクロール有無 | `responsive[]`, `shots/vp-*.png` | 縮小率が `min(w/1920, h/1080)` と一致すればレターボックス方式 |

### 計測スニペット（DevTools Console / MCP の evaluate_script 用）

```js
(() => {
  const s = document.querySelector("section, .slide, [class*=slide]");
  const cs = getComputedStyle(s), pcs = getComputedStyle(s.parentElement);
  return {
    slide: { tag: s.tagName, cls: s.className, w: cs.width, h: cs.height, pos: cs.position, pad: cs.padding, ar: cs.aspectRatio, transition: cs.transition },
    parent: { cls: s.parentElement.className, transform: pcs.transform, display: pcs.display, snap: pcs.scrollSnapType },
    fonts: [...new Set([...document.fonts].filter(f => f.status === "loaded").map(f => f.family))],
    rootVars: [...document.styleSheets].flatMap(sh => { try { return [...sh.cssRules] } catch { return [] } })
      .filter(r => r.selectorText === ":root").map(r => r.cssText.slice(0, 2000)),
    keyframes: [...document.styleSheets].flatMap(sh => { try { return [...sh.cssRules] } catch { return [] } })
      .filter(r => r.type === CSSRule.KEYFRAMES_RULE).map(r => r.name),
    media: { svg: document.querySelectorAll("svg").length, canvas: document.querySelectorAll("canvas").length },
  };
})()
```

## 2. 記入欄（実測後に埋める）

| 項目 | Plume Deck の実測 | Slide Engine v0.1 | 差分アクション |
|---|---|---|---|
| スライド構造 | _未計測_ | `<section class="slide l-{layout}">` を N 枚並べる | |
| 16:9 | _未計測_ | 1920×1080 固定 + `transform: scale(min(vw/1920, vh/1080))` | |
| 切り替え | _未計測_ | `.is-active` 付け替え + opacity クロスフェード 500ms | |
| キー操作 | _未計測_ | → ↓ Space Enter PgDn / ← ↑ PgUp BS / Home End / O F B N | |
| クリック | _未計測_ | 左 1/3 で戻る・それ以外で進む、スワイプ、ホイール | |
| アニメーション | _未計測_ | 700ms・`cubic-bezier(.2,.7,.2,1)`・28px 上昇・70ms stagger | |
| フォント | _未計測_ | Inter + Noto Sans JP | |
| タイプスケール | _未計測_ | 20/24/30/36/44/64/88/128/200 px | |
| 余白 | _未計測_ | 外周 128 × 104、要素間 24/48/80 | |
| 色 | _未計測_ | 紙 #f6f5f1 / 墨 #111214 / アクセント 1 色 | |
| SVG/Canvas | _未計測_ | 装飾・アイコンは inline SVG、Canvas は不使用 | |
| 外部ライブラリ | _未計測_ | なし（Google Fonts のみ） | |
| レスポンシブ | _未計測_ | レターボックス縮小。一覧モードは列数を可変 | |

## 3. デザインパターン分類（記入欄）

スクリーンショット `shots/NN.png` を見て、各スライドを ③ のレイアウト ID に割り当てる。該当なしは「新規」として構造と用途を書き、エンジンに追加するか判断する。

| # | スクリーンショット | パターン | 対応 layout | 備考（なぜ良く見えるか） |
|---|---|---|---|---|
| 1 | shots/00-initial.png | | | |
| 2 | shots/01.png | | | |
| … | | | | |

「なぜ良く見えるか」を書くときの観点は ② デザインルールの §1 を使う（余白比率・サイズ差・色面積・整列軸・情報量・動きの速さ）。
