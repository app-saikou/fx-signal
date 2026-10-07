#!/usr/bin/env node
// HTML デッキの書き出し / 検査 (Playwright + Chromium)
// usage:
//   node src/export.mjs <deck.html> --check            文字あふれ・はみ出し検査 (JSON で結果)
//   node src/export.mjs <deck.html> --pdf  [out.pdf]
//   node src/export.mjs <deck.html> --png  [outDir]     1 枚 = 1 PNG (1920x1080)
//   node src/export.mjs <deck.html> --video [out.mp4] [--dwell 3000]  アニメーション込みで録画
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    // グローバルインストール版にフォールバック
    const globalRoot = execFileSync("npm", ["root", "-g"]).toString().trim();
    return await import(pathToFileURL(path.join(globalRoot, "playwright", "index.mjs")).href);
  }
}

const args = process.argv.slice(2);
const input = args[0];
const mode = args.find((a) => ["--check", "--pdf", "--png", "--video"].includes(a));
const positional = args.slice(1).filter((a, i, arr) => !a.startsWith("--") && !(arr[i - 1] || "").startsWith("--dwell"));
const dwellIdx = args.indexOf("--dwell");
const dwell = dwellIdx > -1 ? Number(args[dwellIdx + 1]) : 3000;

if (!input || !mode) {
  console.error("usage: node src/export.mjs <deck.html> --check|--pdf|--png|--video [out] [--dwell ms]");
  process.exit(1);
}

const url = pathToFileURL(path.resolve(input)).href;
const base = input.replace(/\.html$/, "");
const { chromium } = await loadPlaywright();
const launchOpts = {};
if (process.env.PLAYWRIGHT_CHROMIUM_PATH) launchOpts.executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const browser = await chromium.launch(launchOpts);

try {
  if (mode === "--check") {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(url + "?export");
    await page.evaluate(() => document.fonts.ready);
    const issues = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll(".slide").forEach((slide, i) => {
        const sr = slide.getBoundingClientRect();
        // スライド外へのはみ出し (装飾 svg は除外)
        slide.querySelectorAll("h1,h2,h3,p,li,td,th,blockquote,.stat,.card,.step,.tl-item,.panel,.bar-row").forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0) return;
          if (r.bottom > sr.bottom - 40 || r.right > sr.right + 1 || r.left < sr.left - 1)
            out.push({ slide: i + 1, type: "overflow-slide", el: el.tagName.toLowerCase() + "." + el.className, text: el.textContent.trim().slice(0, 40) });
          if (el.scrollHeight > el.clientHeight + 2 && getComputedStyle(el).overflow !== "visible")
            out.push({ slide: i + 1, type: "clipped", el: el.tagName.toLowerCase(), text: el.textContent.trim().slice(0, 40) });
        });
        // フッターとの衝突 (テキスト要素単位で判定)
        const chrome = slide.querySelector(".chrome");
        if (chrome) {
          const top = chrome.getBoundingClientRect().top;
          const hit = [...slide.querySelectorAll("h1,h2,h3,p,li,td,blockquote,cite,.cover-meta")].find((el) => {
            const r = el.getBoundingClientRect();
            return r.height && !chrome.contains(el) && r.bottom > top - 8;
          });
          if (hit) out.push({ slide: i + 1, type: "hits-footer", el: hit.tagName.toLowerCase(), text: hit.textContent.trim().slice(0, 40) });
        }
        // 見出しの 1 文字だけの最終行 (泣き別れ)
        slide.querySelectorAll("h1,h2").forEach((h) => {
          const range = document.createRange();
          range.selectNodeContents(h);
          const rects = [...range.getClientRects()];
          const last = rects.at(-1);
          if (rects.length > 1 && last && last.width < parseFloat(getComputedStyle(h).fontSize) * 1.6)
            out.push({ slide: i + 1, type: "orphan", el: h.tagName.toLowerCase(), text: h.textContent.trim().slice(0, 40) });
        });
      });
      return out;
    });
    console.log(JSON.stringify({ ok: issues.length === 0, issues }, null, 2));
    process.exitCode = issues.length ? 3 : 0;
  }

  if (mode === "--pdf") {
    const out = positional[0] || base + ".pdf";
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(url + "?export");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.pdf({ path: out, width: "1920px", height: "1080px", printBackground: true, preferCSSPageSize: true });
    console.log("✔ PDF →", out);
  }

  if (mode === "--png") {
    const dir = positional[0] || base + "-png";
    fs.mkdirSync(dir, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(url + "?export");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const slides = await page.$$(".slide");
    for (const [i, el] of slides.entries()) {
      const file = path.join(dir, `slide-${String(i + 1).padStart(2, "0")}.png`);
      await el.screenshot({ path: file });
    }
    console.log(`✔ ${slides.length} PNG →`, dir);
  }

  if (mode === "--video") {
    const out = positional[0] || base + ".mp4";
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "deck-video-"));
    const ctx = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      recordVideo: { dir: tmp, size: { width: 1920, height: 1080 } },
    });
    const page = await ctx.newPage();
    await page.goto(url + "#1");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(dwell);
    const total = await page.evaluate(() => window.deck.length);
    // ステップも含めて最後まで進める
    for (;;) {
      const before = await page.evaluate(() => [window.deck.index, document.querySelectorAll(".slide.is-active [data-step].is-shown").length]);
      if (before[0] === total - 1 && before[1] === (await page.evaluate(() => window.deck.steps()))) break;
      await page.evaluate(() => window.deck.next());
      await page.waitForTimeout(dwell);
    }
    await page.close();
    await ctx.close();
    const webm = fs.readdirSync(tmp).find((f) => f.endsWith(".webm"));
    try {
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", path.join(tmp, webm), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart", out]);
      console.log("✔ MP4 →", out);
    } catch {
      const fallback = out.replace(/\.mp4$/, ".webm");
      fs.copyFileSync(path.join(tmp, webm), fallback);
      console.log("ffmpeg が無いため WebM のまま出力 →", fallback);
    }
  }
} finally {
  await browser.close();
}
