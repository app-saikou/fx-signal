# ⑦ AI に渡す生成ルール・プロンプト

## 構成

| ファイル | 役割 |
|---|---|
| `prompts/deck-system.md` | システムプロンプト本体（構成の作り方・レイアウト選択表・品質ルール） |
| `schema/deck.schema.json` | 出力の JSON スキーマ。API の構造化出力（`output_config.format`）に渡すので、形式違反の出力は起きない |
| `src/generate.mjs` | 呼び出し・検証・自動修正ループ |

## 使い方

```bash
cd slide-engine && npm install
export ANTHROPIC_API_KEY=...   # または `ant auth login`
node src/generate.mjs ../docs/analysis-logic.md \
  --audience "FX の個人トレーダー" --goal "シグナルの仕組みを理解してもらう" --minutes 10 \
  --out out/fx-logic
# → out/fx-logic.deck.json, out/fx-logic.html
node src/export.mjs out/fx-logic.html --pdf
```

複数ファイルを渡すと 1 つの元資料として扱う。`--accent "#e4572e"` でブランド色、`--dark` でダークテーマ。

## 生成の流れ（generate.mjs）

1. 元資料を `<source name="…">` で囲んで user メッセージにし、聴き手・ゴール・時間を添える。
2. `claude-opus-5-5`（adaptive thinking、effort `high`、構造化出力、拒否時のサーバー側 fallback あり）にストリーミングで依頼。
3. 返ってきた JSON を `validateDeck` で検証（必須・要素数・文字数・3 連続）。
4. HTML を生成し `export.mjs --check` で実描画検査（はみ出し・フッター衝突・泣き別れ）。
5. 問題があれば、会話に追記する形で問題一覧を返し「短く言い換える／分割する／レイアウトを変える」で直させる（既定 2 ラウンド）。
6. `*.deck.json` と `*.html` を保存。

## プロンプト設計の考え方

- **役割は「何を・どの順で・どの型で見せるか」に限定**し、見た目の判断はエンジンに任せる。AI に色やサイズを決めさせない。
- **レイアウト選択表**を「内容の型 → layout」の形で渡す。AI はレイアウト名からではなく内容から選べる。
- **上限文字数をプロンプトと validate の両方に書く**。プロンプトで予防し、validate で確実に捕まえる。
- **文字が入りきらないときの直し方を指定する**（詰めない・分割・型変更）。指定しないとフォントを小さくする方向の修正を試みる。
- **事実を作らない**ことを明記。数字が無ければ数字系レイアウトを使わない。
- 削った補足は `notes` に逃がす。スライドを軽くしても情報は失われない。

## 手動で使う場合（チャット UI 等）

API を使わずに別の AI チャットで生成する場合は、次をそのまま貼る。

```
<instructions>
（prompts/deck-system.md の全文）
</instructions>

<schema>
（schema/deck.schema.json の全文）
</schema>

<source>
（元資料）
</source>

聴き手: ○○ / ゴール: ○○ / 時間: ○分
上の元資料から、schema に合う JSON だけを出力してください。
```

出力を `my.deck.json` に保存して:

```bash
node src/build.mjs my.deck.json            # 検証 + HTML 生成（エラーがあれば一覧を表示）
node src/export.mjs my.html --check        # 表示崩れを検査 → 問題があれば AI に貼り返して修正させる
```

## 出力例（抜粋）

```json
{
  "title": "ダウ理論シグナルの仕組み",
  "slides": [
    { "layout": "cover", "kicker": "FX Signal", "title": "4つの時間軸が\n**揃った時だけ**通知する", "meta": "USDJPY" },
    { "layout": "process", "title": "シグナルは5段階で判定する", "items": [
      { "heading": "スウィング検出", "body": "左右3本と比較して高値・安値を特定" },
      { "heading": "トレンド判定", "body": "高値・安値の切り上げ/切り下げ" },
      { "heading": "時間軸一致", "body": "複数時間軸の方向を照合" },
      { "heading": "エントリー算出", "body": "直近スウィングから価格を計算" },
      { "heading": "通知", "body": "条件成立の瞬間だけ送信" } ] },
    { "layout": "statement", "text": "迷ったら、**通知しない**。", "sub": "一致しない局面は見送るのが設計方針。" }
  ]
}
```
