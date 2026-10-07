#!/usr/bin/env node
// HTML スライドサイトの実装解析 (Playwright + Chrome DevTools Protocol)
// Chrome DevTools MCP で手作業で見る項目を、再現可能なスクリプトで一括取得する。
//
// usage: node tools/analyze-site.mjs <url> [outDir] [--steps 12]
// 出力: outDir/report.json, outDir/summary.md, outDir/dom.html, outDir/css/*, outDir/js/*, outDir/shots/*
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

async function loadPlaywright() {
  try { return await import("playwright"); }
  catch {
    const g = execFileSync("npm", ["root", "-g"]).toString().trim();
    return await import(pathToFileURL(path.join(g, "playwright", "index.mjs")).href);
  }
}

const args = process.argv.slice(2);
const url = args[0];
const outDir = args[1] && !args[1].startsWith("--") ? args[1] : "analysis";
const stepsIdx = args.indexOf("--steps");
const STEPS = stepsIdx > -1 ? Number(args[stepsIdx + 1]) : 12;
if (!url) { console.error("usage: node tools/analyze-site.mjs <url> [outDir] [--steps N]"); process.exit(1); }

for (const d of ["", "css", "js", "shots"]) fs.mkdirSync(path.join(outDir, d), { recursive: true });
const save = (f, data) => fs.writeFileSync(path.join(outDir, f), typeof data === "string" ? data : JSON.stringify(data, null, 2));

const { chromium } = await loadPlaywright();
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {});
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const report = { url, analyzedAt: new Date().toISOString() };

// ---------- 1. Network ----------
const network = [];
page.on("response", async (res) => {
  const req = res.request();
  let size = null;
  try { size = (await res.body()).length; } catch {}
  network.push({ url: res.url(), type: req.resourceType(), status: res.status(), mime: res.headers()["content-type"] || "", size });
});
const consoleLog = [];
page.on("console", (m) => consoleLog.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => consoleLog.push(`pageerror: ${e.message}`));

await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(outDir, "shots", "00-initial.png") });
save("dom.html", await page.content());

// ---------- 2. CSS / JS ソース ----------
await cdp.send("DOM.enable");
await cdp.send("CSS.enable");
const sheets = [];
cdp.on("CSS.styleSheetAdded", (e) => sheets.push(e.header));
await cdp.send("CSS.disable"); await cdp.send("CSS.enable"); // 既存シートの再通知
await page.waitForTimeout(300);
const cssFiles = [];
for (const [i, h] of sheets.entries()) {
  try {
    const { text } = await cdp.send("CSS.getStyleSheetText", { styleSheetId: h.styleSheetId });
    const name = `${String(i).padStart(2, "0")}-${(h.sourceURL.split("/").pop() || "inline").replace(/[^\w.-]/g, "_").slice(0, 60) || "inline"}.css`;
    fs.writeFileSync(path.join(outDir, "css", name), text);
    cssFiles.push({ file: name, source: h.sourceURL || "(inline)", length: text.length });
  } catch {}
}
const allCss = cssFiles.map((f) => fs.readFileSync(path.join(outDir, "css", f.file), "utf8")).join("\n");
report.css = {
  files: cssFiles,
  keyframes: [...allCss.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]),
  customProperties: [...new Set([...allCss.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))],
  mediaQueries: [...new Set([...allCss.matchAll(/@media\s*([^{]+)\{/g)].map((m) => m[1].trim()))],
  containerQueries: [...allCss.matchAll(/@container/g)].length,
  uses: Object.fromEntries(
    ["aspect-ratio", "clamp(", "vw", "vh", "vmin", "cqw", "scroll-snap", "transform: scale", "view-transition", "clip-path", "mix-blend-mode", "backdrop-filter", "@font-face", "text-wrap", "word-break: auto-phrase", "font-feature-settings", "palt", "grid-template", "@page"]
      .map((k) => [k, allCss.split(k).length - 1])
  ),
};

const scripts = await page.evaluate(() => [...document.scripts].map((s) => ({ src: s.src, type: s.type, module: s.type === "module", inline: !s.src, length: s.textContent.length, text: s.src ? "" : s.textContent })));
scripts.forEach((s, i) => { if (s.inline && s.text) fs.writeFileSync(path.join(outDir, "js", `inline-${i}.js`), s.text); delete s.text; });
for (const r of network.filter((n) => n.type === "script")) {
  try {
    const body = await (await context.request.get(r.url)).text();
    fs.writeFileSync(path.join(outDir, "js", r.url.split("/").pop().replace(/[^\w.-]/g, "_").slice(0, 80) || "script.js"), body);
  } catch {}
}
report.scripts = scripts;

// ---------- 3. 外部ライブラリ検出 ----------
report.libraries = await page.evaluate(() => {
  const g = {
    "Reveal.js": "Reveal", GSAP: "gsap", ScrollTrigger: "ScrollTrigger", "anime.js": "anime", "Three.js": "THREE",
    D3: "d3", "Chart.js": "Chart", Swiper: "Swiper", Lottie: "lottie", p5: "p5", PixiJS: "PIXI", Splide: "Splide",
    "Framer Motion": "FramerMotion", Alpine: "Alpine", Vue: "Vue", React: "React", jQuery: "jQuery", Impress: "impress",
    Marp: "marpit", Lenis: "Lenis", Barba: "barba", Highlight: "hljs", Prism: "Prism", KaTeX: "katex", Mermaid: "mermaid",
  };
  const found = Object.entries(g).filter(([, k]) => k in window).map(([n]) => n);
  if (document.querySelector("[data-reactroot], #__next")) found.push("React (DOM marker)");
  if (document.querySelector("[data-v-app], [data-v-]")) found.push("Vue (DOM marker)");
  if (document.querySelector("astro-island")) found.push("Astro");
  return found;
});
report.libraries.push(
  ...network.filter((n) => n.type === "script" && /(cdn|unpkg|jsdelivr|cdnjs|googleapis)/.test(n.url)).map((n) => `CDN: ${n.url}`)
);

// ---------- 4. スライド候補の構造 ----------
report.structure = await page.evaluate(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 200 && r.height > 100; };
  const cands = [...document.querySelectorAll("body *")].filter((el) => {
    const r = el.getBoundingClientRect();
    const ratio = r.width / r.height;
    const name = (el.className?.toString() || "") + " " + el.id + " " + el.tagName;
    return (r.width > 300 && Math.abs(ratio - 16 / 9) < 0.03) || /slide|page|deck|scene|frame|section/i.test(name);
  });
  // 同じ親の下に同じタグで複数並ぶ候補群を「スライド群」とみなし、共通クラスでセレクタ化
  const groups = new Map();
  for (const el of cands) {
    if (!el.parentElement) continue;
    const k = el.parentElement;
    groups.set(k, (groups.get(k) || []).concat(el));
  }
  const bestGroup = [...groups.entries()]
    .map(([parent, els]) => [parent, els.filter((e) => e.tagName === els[0].tagName)])
    .sort((a, b) => b[1].length - a[1].length)[0];
  const slides = bestGroup ? bestGroup[1] : [];
  const common = slides.length ? [...slides[0].classList].filter((c) => slides.every((s) => s.classList.contains(c))) : [];
  const best = slides.length ? [`${slides[0].tagName.toLowerCase()}${common.map((c) => "." + CSS.escape(c)).join("")}`] : null;
  const first = slides[0];
  const cs = first ? getComputedStyle(first) : null;
  const parent = first?.parentElement;
  const pcs = parent ? getComputedStyle(parent) : null;
  const outline = (el, depth = 0) =>
    depth > 4 ? "" : [...el.children].map((c) => `${"  ".repeat(depth)}<${c.tagName.toLowerCase()}${c.className ? ` class="${c.className}"` : ""}${[...c.attributes].filter((a) => a.name.startsWith("data-")).map((a) => ` ${a.name}="${a.value}"`).join("")}>\n${outline(c, depth + 1)}`).join("");
  return {
    selector: best?.[0] || null,
    count: slides.length,
    firstSlideOuterOutline: first ? outline(first) : "",
    slideBox: first && {
      rect: first.getBoundingClientRect().toJSON(),
      position: cs.position, display: cs.display, width: cs.width, height: cs.height, aspectRatio: cs.aspectRatio,
      transform: cs.transform, padding: cs.padding, overflow: cs.overflow, background: cs.backgroundColor,
      transition: cs.transition, opacity: cs.opacity, visibility: cs.visibility,
    },
    container: parent && {
      tag: parent.tagName, class: parent.className, display: pcs.display, transform: pcs.transform,
      width: pcs.width, height: pcs.height, position: pcs.position, scrollSnapType: pcs.scrollSnapType, overflow: pcs.overflow,
    },
    attrsOnSlides: [...new Set(slides.flatMap((s) => [...s.attributes].map((a) => a.name)))],
    visibleCount: slides.filter(vis).length,
    media: { svg: document.querySelectorAll("svg").length, canvas: document.querySelectorAll("canvas").length, img: document.querySelectorAll("img").length, video: document.querySelectorAll("video").length, iframe: document.querySelectorAll("iframe").length },
    html: { lang: document.documentElement.lang, viewport: document.querySelector('meta[name=viewport]')?.content, title: document.title },
  };
});

// ---------- 5. タイポグラフィ / 色 / 余白の実測 ----------
report.design = await page.evaluate(() => {
  const count = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  const fonts = new Map(), sizes = new Map(), weights = new Map(), lh = new Map(), ls = new Map(), colors = new Map(), bgs = new Map(), radii = new Map(), gaps = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const el = walker.currentNode.parentElement;
    if (!el || seen.has(el) || !walker.currentNode.textContent.trim()) continue;
    seen.add(el);
    const s = getComputedStyle(el);
    if (s.display === "none") continue;
    count(fonts, s.fontFamily); count(sizes, s.fontSize); count(weights, s.fontWeight);
    count(lh, `${s.fontSize} / ${s.lineHeight}`); count(ls, s.letterSpacing); count(colors, s.color);
  }
  document.querySelectorAll("body *").forEach((el) => {
    const s = getComputedStyle(el);
    if (s.backgroundColor !== "rgba(0, 0, 0, 0)") count(bgs, s.backgroundColor);
    if (s.borderRadius !== "0px") count(radii, s.borderRadius);
    if (s.gap && s.gap !== "normal") count(gaps, s.gap);
  });
  const top = (m, n = 15) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  const root = getComputedStyle(document.documentElement);
  const vars = {};
  for (const sheet of document.styleSheets) {
    try { for (const r of sheet.cssRules) if (r.selectorText === ":root") for (const p of r.style) if (p.startsWith("--")) vars[p] = root.getPropertyValue(p).trim(); } catch {}
  }
  return {
    fontFamilies: top(fonts), fontSizes: top(sizes, 25), fontWeights: top(weights), lineHeights: top(lh, 20), letterSpacing: top(ls),
    textColors: top(colors), backgrounds: top(bgs), borderRadius: top(radii), gaps: top(gaps), rootVariables: vars,
    loadedFonts: [...new Set([...document.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family} ${f.weight} ${f.style}`))],
  };
});

// ---------- 6. イベントリスナー (CDP DOMDebugger) ----------
async function listenersOf(expr) {
  const { result } = await cdp.send("Runtime.evaluate", { expression: expr });
  if (!result.objectId) return [];
  const { listeners } = await cdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId, depth: 0 });
  const out = [];
  for (const l of listeners) {
    let src = "";
    if (l.handler?.objectId) {
      const r = await cdp.send("Runtime.callFunctionOn", { objectId: l.handler.objectId, functionDeclaration: "function(){return this.toString().slice(0,400)}", returnByValue: true }).catch(() => null);
      src = r?.result?.value || "";
    }
    out.push({ type: l.type, useCapture: l.useCapture, passive: l.passive, scriptId: l.scriptId, line: l.lineNumber, handler: src });
  }
  return out;
}
report.listeners = {
  window: await listenersOf("window"),
  document: await listenersOf("document"),
  body: await listenersOf("document.body"),
  firstSlide: report.structure.selector ? await listenersOf(`document.querySelector(${JSON.stringify(report.structure.selector)})`) : [],
};

// ---------- 7. ナビゲーション & アニメーション観測 ----------
const snapshot = () => page.evaluate(() => {
  const active = [...document.querySelectorAll("[class*=active], [class*=current], [aria-current], [aria-hidden=false]")].slice(0, 5).map((e) => `${e.tagName}.${e.className}`);
  const anims = document.getAnimations().map((a) => ({
    name: a.animationName || a.transitionProperty || a.constructor.name,
    target: a.effect?.target ? `${a.effect.target.tagName}.${a.effect.target.className}`.slice(0, 80) : "",
    duration: a.effect?.getTiming().duration, delay: a.effect?.getTiming().delay, easing: a.effect?.getTiming().easing,
    keyframes: (() => { try { return a.effect.getKeyframes().map((k) => Object.fromEntries(Object.entries(k).filter(([p]) => !["computedOffset", "composite"].includes(p)))); } catch { return []; } })(),
  }));
  return { hash: location.hash, scrollY: scrollY, scrollX: scrollX, active, animations: anims };
});
const nav = [];
const tryKeys = ["ArrowRight", "ArrowDown", "Space", "PageDown"];
let workingKey = null;
for (const key of tryKeys) {
  const before = await page.screenshot();
  await page.keyboard.press(key);
  await page.waitForTimeout(80);
  const s = await snapshot();
  await page.waitForTimeout(1500);
  const after = await page.screenshot();
  if (!before.equals(after)) { workingKey = key; nav.push({ step: 1, key, ...s }); fs.writeFileSync(path.join(outDir, "shots", "01.png"), after); break; }
}
if (workingKey) {
  for (let i = 2; i <= STEPS; i++) {
    await page.keyboard.press(workingKey);
    await page.waitForTimeout(80);
    const s = await snapshot();
    // アニメーション途中のフレームも保存 (動きの方向・順序を目視確認用)
    await page.screenshot({ path: path.join(outDir, "shots", `${String(i).padStart(2, "0")}-mid.png`) });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(outDir, "shots", `${String(i).padStart(2, "0")}.png`) });
    nav.push({ step: i, key: workingKey, ...s });
  }
}
report.navigation = { workingKey, steps: nav };

// クリック操作
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
const b0 = await page.screenshot();
await page.mouse.click(1700, 540);
await page.waitForTimeout(1200);
report.navigation.clickRightAdvances = !b0.equals(await page.screenshot());

// ---------- 8. レスポンシブ ----------
report.responsive = [];
for (const [w, h] of [[1280, 720], [1440, 900], [768, 1024], [390, 844]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outDir, "shots", `vp-${w}x${h}.png`) });
  report.responsive.push({
    viewport: `${w}x${h}`,
    ...(await page.evaluate((sel) => {
      const el = sel ? document.querySelector(sel) : null;
      const r = el?.getBoundingClientRect();
      return { slideRect: r ? { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) } : null, transform: el ? getComputedStyle(el.parentElement).transform : null, docScroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight] };
    }, report.structure.selector)),
  });
}

report.network = network;
report.console = consoleLog;
save("report.json", report);

// ---------- 9. summary.md ----------
const fmtTop = (arr) => arr.map(([k, v]) => `\`${k}\` ×${v}`).join(", ");
const md = `# 解析サマリー: ${url}
取得日時: ${report.analyzedAt}

## 外部ライブラリ
${report.libraries.length ? report.libraries.map((l) => `- ${l}`).join("\n") : "- 検出なし (素の HTML/CSS/JS の可能性)"}

## スライド構造
- 推定セレクタ: \`${report.structure.selector}\` (${report.structure.count} 件)
- スライドの box: \`${JSON.stringify(report.structure.slideBox)}\`
- コンテナ: \`${JSON.stringify(report.structure.container)}\`
- メディア: ${JSON.stringify(report.structure.media)}

\`\`\`
${report.structure.firstSlideOuterOutline.slice(0, 3000)}
\`\`\`

## タイポグラフィ実測
- font-family: ${fmtTop(report.design.fontFamilies.slice(0, 5))}
- font-size: ${fmtTop(report.design.fontSizes)}
- weight: ${fmtTop(report.design.fontWeights)}
- letter-spacing: ${fmtTop(report.design.letterSpacing)}
- 読み込まれたフォント: ${report.design.loadedFonts.join(", ")}

## 色
- 文字色: ${fmtTop(report.design.textColors)}
- 背景色: ${fmtTop(report.design.backgrounds)}

## CSS
- @keyframes: ${report.css.keyframes.join(", ") || "なし"}
- media queries: ${report.css.mediaQueries.join(" / ") || "なし"}
- 使用機能: ${Object.entries(report.css.uses).filter(([, v]) => v).map(([k, v]) => `${k}(${v})`).join(", ")}

## 操作
- 進むキー: ${report.navigation.workingKey ?? "検出できず"}
- 右側クリックで進む: ${report.navigation.clickRightAdvances}
- window listeners: ${report.listeners.window.map((l) => l.type).join(", ")}
- document listeners: ${report.listeners.document.map((l) => l.type).join(", ")}

## アニメーション (遷移直後に走っていたもの)
${nav.flatMap((n) => n.animations).slice(0, 40).map((a) => `- ${a.name} on ${a.target} — ${a.duration}ms, delay ${a.delay}ms, ${a.easing}`).join("\n") || "- 観測なし"}

## レスポンシブ
${report.responsive.map((r) => `- ${r.viewport}: slide ${JSON.stringify(r.slideRect)} transform=${r.transform}`).join("\n")}

## Network (${network.length} requests)
${network.map((n) => `- [${n.type}] ${n.status} ${n.url.slice(0, 120)} (${n.size ?? "?"} B)`).join("\n")}
`;
save("summary.md", md);
console.log(`✔ 解析完了 → ${outDir}/summary.md, report.json`);
await browser.close();
