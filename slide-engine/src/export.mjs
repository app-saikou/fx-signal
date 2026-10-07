#!/usr/bin/env node
// HTML デッキの書き出し / 検査 (Playwright + Chromium)
// usage:
//   node src/export.mjs <deck.html> --check            文字あふれ・はみ出し検査 (JSON で結果)
//   node src/export.mjs <deck.html> --pdf  [out.pdf]
//   node src/export.mjs <deck.html> --png  [outDir]     1 枚 = 1 PNG (1920x1080)
//   node src/export.mjs <deck.html> --video [out.mp4] [--dwell 3000]  アニメーション込みの MP4
//     各スライドの表示時間は deck.json の duration (秒)、無ければ --dwell (ms)
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
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
        slide.querySelectorAll("h1,h2,h3,p,li,td,th,blockquote,.stat,.card,.step,.tl-item,.panel,.bar-row,.bn-value,.stat-value").forEach((el) => {
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
          const hit = [...slide.querySelectorAll("h1,h2,h3,p,li,td,blockquote,cite,.cover-meta,.bn-value,.stat-value")].find((el) => {
            const r = el.getBoundingClientRect();
            return r.height && !chrome.contains(el) && r.bottom > top - 8;
          });
          if (hit) out.push({ slide: i + 1, type: "hits-footer", el: hit.tagName.toLowerCase(), text: hit.textContent.trim().slice(0, 40) });
        }
        // 見出しの 1 文字だけの最終行 (泣き別れ)
        slide.querySelectorAll("h1,h2").forEach((h) => {
          const range = document.createRange();
          range.selectNodeContents(h);
          // 行ごとに矩形をまとめ、最終行の幅を測る (強調 span で矩形が分割されても誤検知しない)
          const rects = [...range.getClientRects()].filter((r) => r.width > 0);
          const lines = [];
          for (const r of rects) {
            const line = lines.find((l) => Math.abs(l.top - r.top) < r.height / 2);
            if (line) { line.left = Math.min(line.left, r.left); line.right = Math.max(line.right, r.right); }
            else lines.push({ top: r.top, left: r.left, right: r.right });
          }
          lines.sort((a, b) => a.top - b.top);
          const last = lines.at(-1);
          if (lines.length > 1 && last && last.right - last.left < parseFloat(getComputedStyle(h).fontSize) * 1.6)
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
    // コマ撮り方式: 仮想時計で CSS アニメーションと rAF を 1/30 秒ずつ進め、毎フレームを撮影して ffmpeg へ。
    // 実時間録画 (recordVideo) よりも文字がシャープで、マシン負荷によるカクつきも出ない。
    const out = positional[0] || base + ".mp4";
    const FPS = 30, FRAME = 1000 / FPS, ANIM_WINDOW = 2600; // 遷移後この時間だけ実フレームを撮り、以降は静止画を複製
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.clock.install();
    await page.goto(url + "#1");
    await page.evaluate(() => document.fonts.ready);
    // 時計を止め、以降は runFor でのみ進める (撮影にかかる実時間をアニメーションに混ぜない)
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
    await page.clock.runFor(100);
    const plan = await page.evaluate((def) =>
      [...document.querySelectorAll(".slide")].map((s) => ({
        ms: (parseFloat(s.dataset.duration) || def / 1000) * 1000,
        steps: s.querySelectorAll("[data-step]").length,
      })), dwell);
    // 黒画面から始める
    await page.evaluate(() => {
      document.querySelectorAll(".slide").forEach((s) => s.classList.remove("is-active"));
      document.body.offsetHeight;
      document.getAnimations().forEach((a) => a.finish());
      window.__vt = { seen: new WeakMap() };
    });
    const tick = (vt) => {
      document.body.offsetHeight;
      for (const a of document.getAnimations()) {
        if (!window.__vt.seen.has(a)) window.__vt.seen.set(a, vt);
        a.pause();
        a.currentTime = vt - window.__vt.seen.get(a);
      }
    };
    const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
      "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out + ".tmp.mp4"]);
    const ffDone = new Promise((res, rej) => ff.on("close", (c) => (c === 0 ? res() : rej(new Error("ffmpeg failed")))));
    const write = (buf) => new Promise((res) => (ff.stdin.write(buf) ? res() : ff.stdin.once("drain", res)));
    let vt = 0, frames = 0, last = null;
    const hold = async (ms) => {
      const n = Math.round(ms / FRAME);
      const live = Math.min(n, Math.round(ANIM_WINDOW / FRAME));
      for (let i = 0; i < n; i++) {
        if (i < live || !last) {
          await page.clock.runFor(FRAME);
          vt += FRAME;
          await page.evaluate(tick, vt);
          last = await page.screenshot({ type: "png" });
        }
        await write(last);
        frames++;
      }
    };
    await hold(400);
    for (const [i, p] of plan.entries()) {
      const per = p.ms / (p.steps + 1);
      await page.evaluate((n) => window.deck.go(n), i);
      await hold(per);
      for (let k = 0; k < p.steps; k++) {
        await page.evaluate(() => window.deck.next());
        await hold(per);
      }
      process.stdout.write(`\r  slide ${i + 1}/${plan.length}  ${(frames / FPS).toFixed(1)}s`);
    }
    ff.stdin.end();
    await ffDone;
    // 最後の 0.8 秒をフェードアウト
    const total = frames / FPS;
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", out + ".tmp.mp4", "-vf", `fade=t=out:st=${(total - 0.8).toFixed(2)}:d=0.8`,
      "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]);
    fs.unlinkSync(out + ".tmp.mp4");
    console.log(`\n✔ MP4 (${total.toFixed(1)}s) →`, out);
  }
} finally {
  await browser.close();
}
