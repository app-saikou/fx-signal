#!/usr/bin/env node
// 元資料 → (Claude) → deck JSON → 検証 → HTML。検証で問題があれば Claude に差し戻して自動修正。
//
// usage:
//   node src/generate.mjs <source.md|txt ...> [--out out/deck] [--minutes 10] [--audience "経営層"]
//                         [--goal "予算承認"] [--accent "#e4572e"] [--dark] [--rounds 2] [--no-check]
// 認証: ANTHROPIC_API_KEY など、SDK の標準の認証解決に従う
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { validateDeck } from "./layouts.mjs";
import { renderDeck } from "./build.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "..");

// ---- args ----
const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i > -1 ? argv[i + 1] : def;
};
const flag = (name) => argv.includes(`--${name}`);
const valued = new Set(["out", "minutes", "audience", "goal", "accent", "rounds", "slides"]);
const sources = argv.filter((a, i) => !a.startsWith("--") && !valued.has((argv[i - 1] || "").slice(2)));
if (!sources.length) {
  console.error("usage: node src/generate.mjs <source files...> [--out out/deck] [--minutes 10] [--audience ...] [--goal ...]");
  process.exit(1);
}
const outBase = opt("out", path.join("out", path.basename(sources[0]).replace(/\.\w+$/, "")));
const maxRounds = Number(opt("rounds", 2));
fs.mkdirSync(path.dirname(outBase), { recursive: true });

// ---- schema: $ref を展開して構造化出力に渡す ----
const rawSchema = JSON.parse(fs.readFileSync(path.join(ROOT, "schema", "deck.schema.json"), "utf8"));
const deref = (node) => {
  if (Array.isArray(node)) return node.map(deref);
  if (node && typeof node === "object") {
    if (node.$ref) return deref(rawSchema.$defs[node.$ref.split("/").pop()]);
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, deref(v)]));
  }
  return node;
};
const { $schema, $defs, title: _t, ...rootSchema } = rawSchema;
const schema = deref(rootSchema);

const system = fs.readFileSync(path.join(ROOT, "prompts", "deck-system.md"), "utf8");

const sourceText = sources
  .map((f) => `<source name="${path.basename(f)}">\n${fs.readFileSync(f, "utf8")}\n</source>`)
  .join("\n\n");

const brief = [
  opt("audience") && `聴き手: ${opt("audience")}`,
  opt("goal") && `発表のゴール: ${opt("goal")}`,
  opt("minutes") && `発表時間: ${opt("minutes")} 分`,
  opt("slides") && `枚数: ${opt("slides")} 枚前後`,
  opt("accent") && `アクセント色: ${opt("accent")}`,
  flag("dark") && "テーマ: dark",
].filter(Boolean).join("\n");

const client = new Anthropic();
const messages = [
  {
    role: "user",
    content: `${sourceText}\n\n上の元資料からスライドデッキを設計してください。${brief ? `\n\n${brief}` : ""}`,
  },
];

async function ask() {
  const stream = client.beta.messages.stream({
    model: "claude-opus-5-5",
    max_tokens: 64000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: { type: "json_schema", schema } },
    system,
    messages,
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error(`refusal: ${msg.stop_details?.explanation ?? ""}`);
  if (msg.stop_reason === "max_tokens") throw new Error("max_tokens に達しました。元資料を分割してください");
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return { msg, deck: JSON.parse(text) };
}

function checkLayout(htmlPath) {
  if (flag("no-check")) return [];
  try {
    execFileSync("node", [path.join(here, "export.mjs"), htmlPath, "--check"], { stdio: ["ignore", "pipe", "pipe"] });
    return [];
  } catch (e) {
    if (e.status === 3) return JSON.parse(e.stdout.toString()).issues;
    console.warn("（レイアウト検査をスキップ: Playwright が利用できません）");
    return [];
  }
}

let deck;
for (let round = 0; round <= maxRounds; round++) {
  console.log(round === 0 ? "▶ 構成を生成中…" : `▶ 修正ラウンド ${round}…`);
  const { msg, deck: d } = await ask();
  deck = d;
  const { errors, warnings } = validateDeck(deck);
  let issues = [];
  if (!errors.length) {
    fs.writeFileSync(`${outBase}.html`, renderDeck(deck));
    issues = checkLayout(`${outBase}.html`).map((i) => `slide ${i.slide}: ${i.type} — 「${i.text}」`);
  }
  const problems = [...errors, ...warnings, ...issues];
  console.log(`  ${deck.slides.length} 枚 / エラー ${errors.length} / 警告 ${warnings.length} / 表示問題 ${issues.length}`);
  if (!problems.length || round === maxRounds) {
    if (errors.length) {
      fs.writeFileSync(`${outBase}.deck.json`, JSON.stringify(deck, null, 2));
      console.error(errors.join("\n"));
      process.exit(2);
    }
    break;
  }
  // 会話は追記のみ (assistant の content はそのまま返す)
  messages.push({ role: "assistant", content: msg.content });
  messages.push({
    role: "user",
    content:
      "検証で次の問題が見つかりました。該当スライドを修正し、デッキ全体の JSON を出力し直してください。" +
      "文字を詰め込むのではなく、短く言い換える・スライドを分割する・レイアウトを変える、のいずれかで解決してください。\n\n" +
      problems.map((p) => `- ${p}`).join("\n"),
  });
}

fs.writeFileSync(`${outBase}.deck.json`, JSON.stringify(deck, null, 2));
if (!fs.existsSync(`${outBase}.html`)) fs.writeFileSync(`${outBase}.html`, renderDeck(deck));
console.log(`✔ ${outBase}.deck.json\n✔ ${outBase}.html`);
console.log(`  書き出し: node src/export.mjs ${outBase}.html --pdf | --png | --video`);
