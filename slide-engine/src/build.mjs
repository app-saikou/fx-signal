#!/usr/bin/env node
// deck JSON → 単一 HTML (CSS/JS インライン, 画像以外は外部依存なし)
// usage: node src/build.mjs <deck.json> [out.html] [--strict]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { layouts, validateDeck, esc } from "./layouts.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.join(here, "..", "engine");

const FONT_LINK =
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@200;400;600;700;800&family=Noto+Sans+JP:wght@400;500;700;800&display=swap" rel="stylesheet">';

export function renderDeck(deck) {
  const theme = deck.theme || {};
  const total = deck.slides.length;
  let sectionNo = 0;

  const slidesHTML = deck.slides
    .map((s, idx) => {
      const L = layouts[s.layout];
      if (s.layout === "section") sectionNo++;
      const ctx = { i: 0, slide: s, sectionNo };
      const inner = L.render(s, ctx);
      const chrome =
        L.chrome === false || s.chrome === false
          ? ""
          : `<footer class="chrome"><span>${esc(deck.footer ?? deck.title ?? "")}</span><span class="num">${String(idx + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}</span></footer>`;
      const notes = s.notes ? `<aside class="notes" hidden>${esc(s.notes)}</aside>` : "";
      return `<section class="slide l-${s.layout}" data-layout="${s.layout}" aria-label="${idx + 1} / ${total}">${inner}${chrome}${notes}</section>`;
    })
    .join("\n");

  const vars = [
    theme.accent && `--accent:${theme.accent}`,
    theme.accentInk && `--accent-ink:${theme.accentInk}`,
    theme.font && `--font-sans:${theme.font}`,
  ].filter(Boolean).join(";");

  const css = fs.readFileSync(path.join(ENGINE, "deck.css"), "utf8");
  const js = fs.readFileSync(path.join(ENGINE, "deck.js"), "utf8");

  return `<!doctype html>
<html lang="${esc(deck.lang || "ja")}" class="${theme.mode === "dark" ? "theme-dark" : ""}"${vars ? ` style="${esc(vars)}"` : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(deck.title || "Slides")}</title>
${deck.offlineFonts ? "" : FONT_LINK}
<style>${css}</style>
</head>
<body>
<main class="stage">
${slidesHTML}
</main>
<script>${js}</script>
</body>
</html>
`;
}

// ---- CLI ----
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const strict = args.includes("--strict");
  const [input, outArg] = args.filter((a) => !a.startsWith("--"));
  if (!input) {
    console.error("usage: node src/build.mjs <deck.json> [out.html] [--strict]");
    process.exit(1);
  }
  const deck = JSON.parse(fs.readFileSync(input, "utf8"));
  const { errors, warnings } = validateDeck(deck);
  warnings.forEach((w) => console.warn("⚠", w));
  errors.forEach((e) => console.error("✖", e));
  if (errors.length || (strict && warnings.length)) process.exit(2);
  const out = outArg || input.replace(/\.json$/, "") + ".html";
  fs.writeFileSync(out, renderDeck(deck));
  console.log(`✔ ${deck.slides.length} slides → ${out}`);
}
