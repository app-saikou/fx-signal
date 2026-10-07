/* ==========================================================================
   Slide Engine — deck.js  (依存なし / 単一ファイル)
   - 1920x1080 キャンバスを viewport に等倍縮小 (レターボックス)
   - キーボード / クリック / スワイプ / ホイール / URL hash
   - data-step による段階表示, data-count による数値カウントアップ
   - O: 一覧, F: 全画面, B: 暗転, N: ノート, ?export: 印刷・書き出し用
   ========================================================================== */
(() => {
  const W = 1920, H = 1080;
  const root = document.documentElement;
  const stage = document.querySelector(".stage");
  const slides = [...document.querySelectorAll(".slide")];
  const params = new URLSearchParams(location.search);
  const exportMode = params.has("export");

  const progress = document.createElement("div");
  progress.className = "progress";
  const notes = document.createElement("div");
  notes.className = "notes-panel";
  document.body.append(progress, notes);

  let index = 0;
  let overview = false;

  // ---- scale --------------------------------------------------------------
  function fit() {
    if (exportMode) return;
    if (overview) return layoutOverview();
    const s = Math.min(innerWidth / W, innerHeight / H);
    stage.style.setProperty("--scale", s);
  }

  // ---- steps --------------------------------------------------------------
  const stepsOf = (slide) =>
    [...slide.querySelectorAll("[data-step]")].sort((a, b) => a.dataset.step - b.dataset.step);
  const shownSteps = (slide) => slide.querySelectorAll("[data-step].is-shown").length;

  // ---- count up -----------------------------------------------------------
  function countUp(slide) {
    slide.querySelectorAll("[data-count]").forEach((el) => {
      const target = parseFloat(el.dataset.count);
      if (!isFinite(target)) return;
      const decimals = (el.dataset.count.split(".")[1] || "").length;
      const fmt = (v) =>
        v.toLocaleString("en-US", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
          useGrouping: el.dataset.group === "1",
        });
      if (exportMode || matchMedia("(prefers-reduced-motion: reduce)").matches) {
        el.textContent = fmt(target);
        return;
      }
      const dur = 1200, delay = 200, t0 = performance.now() + delay;
      el.textContent = fmt(0);
      const tick = (now) => {
        const t = Math.min(1, Math.max(0, (now - t0) / dur));
        const e = 1 - Math.pow(1 - t, 4); // easeOutQuart
        el.textContent = fmt(target * e);
        if (t < 1 && slide.classList.contains("is-active")) requestAnimationFrame(tick);
        else el.textContent = fmt(target);
      };
      requestAnimationFrame(tick);
    });
  }

  // ---- navigation ---------------------------------------------------------
  function go(n, { step = 0, push = true } = {}) {
    n = Math.max(0, Math.min(slides.length - 1, n));
    const changed = n !== index || !slides[n].classList.contains("is-active");
    slides.forEach((s, i) => {
      s.classList.toggle("is-active", i === n);
      s.classList.toggle("is-past", i < n);
      s.classList.toggle("is-current", i === n);
    });
    const steps = stepsOf(slides[n]);
    steps.forEach((el, i) => el.classList.toggle("is-shown", i < step));
    index = n;
    progress.style.setProperty("--p", slides.length > 1 ? n / (slides.length - 1) : 1);
    notes.textContent = slides[n].querySelector("aside.notes")?.textContent.trim() || "（ノートなし）";
    if (changed) countUp(slides[n]);
    if (push && location.hash !== `#${n + 1}`) history.replaceState(null, "", `#${n + 1}`);
    document.dispatchEvent(new CustomEvent("deck:change", { detail: { index: n, step } }));
  }

  function next() {
    const s = slides[index];
    const steps = stepsOf(s);
    const shown = shownSteps(s);
    if (shown < steps.length) {
      steps[shown].classList.add("is-shown");
      return;
    }
    if (index < slides.length - 1) go(index + 1);
  }
  function prev() {
    const s = slides[index];
    const shown = shownSteps(s);
    if (shown > 0) {
      stepsOf(s)[shown - 1].classList.remove("is-shown");
      return;
    }
    if (index > 0) go(index - 1, { step: stepsOf(slides[index - 1]).length });
  }

  // ---- overview -----------------------------------------------------------
  function layoutOverview() {
    const cols = innerWidth > 1400 ? 5 : innerWidth > 900 ? 4 : 2;
    const gap = 24;
    const cellW = (innerWidth - gap * (cols + 1)) / cols;
    const s = cellW / W;
    slides.forEach((sl, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      sl.style.transform = `translate(${gap + c * (cellW + gap)}px, ${gap + r * (H * s + gap)}px) scale(${s})`;
    });
    stage.style.height = `${gap + Math.ceil(slides.length / cols) * (H * s + gap)}px`;
  }
  function toggleOverview(on = !overview) {
    overview = on;
    root.classList.toggle("is-overview", on);
    if (!on) {
      slides.forEach((sl) => (sl.style.transform = ""));
      stage.style.height = "";
      go(index);
    }
    fit();
    if (on) slides[index].scrollIntoView({ block: "center" });
  }

  // ---- input --------------------------------------------------------------
  addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (overview && (k === "Escape" || k === "o" || k === "O" || k === "Enter")) {
      e.preventDefault();
      return toggleOverview(false);
    }
    if (overview) return;
    if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter", "j", "l"].includes(k)) { e.preventDefault(); next(); }
    else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace", "k", "h"].includes(k)) { e.preventDefault(); prev(); }
    else if (k === "Home") go(0);
    else if (k === "End") go(slides.length - 1, { step: stepsOf(slides.at(-1)).length });
    else if (k === "f" || k === "F") document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen?.();
    else if (k === "o" || k === "O" || k === "Escape") toggleOverview(true);
    else if (k === "b" || k === "B" || k === ".") document.body.classList.toggle("blackout");
    else if (k === "n" || k === "N") root.classList.toggle("show-notes");
  });

  addEventListener("click", (e) => {
    if (e.target.closest("a, button, input, textarea, select, .notes-panel")) return;
    if (overview) {
      const sl = e.target.closest(".slide");
      if (sl) { index = slides.indexOf(sl); toggleOverview(false); }
      return;
    }
    // 画面左 1/3 → 戻る / それ以外 → 進む
    e.clientX < innerWidth / 3 ? prev() : next();
  });

  let touch = null;
  addEventListener("touchstart", (e) => { touch = e.touches[0]; }, { passive: true });
  addEventListener("touchend", (e) => {
    if (!touch || overview) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.clientX, dy = t.clientY - touch.clientY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) dx < 0 ? next() : prev();
    touch = null;
  });

  let wheelLock = 0;
  addEventListener("wheel", (e) => {
    if (overview) return;
    const now = Date.now();
    if (now < wheelLock || Math.abs(e.deltaY) < 30) return;
    wheelLock = now + 600;
    e.deltaY > 0 ? next() : prev();
  }, { passive: true });

  addEventListener("hashchange", () => {
    const n = parseInt(location.hash.slice(1), 10);
    if (!n) return;
    if (overview) { index = n - 1; return toggleOverview(false); }
    if (n - 1 !== index) go(n - 1, { push: false });
  });
  addEventListener("resize", fit);

  // ---- boot ---------------------------------------------------------------
  if (exportMode) {
    root.classList.add("is-export");
    slides.forEach((s) => {
      s.classList.add("is-active");
      stepsOf(s).forEach((el) => el.classList.add("is-shown"));
      countUp(s);
    });
  } else {
    const start = parseInt(location.hash.slice(1), 10) || 1;
    fit();
    // 初回は 1 フレーム待ってから active にして入場アニメを確実に走らせる
    requestAnimationFrame(() => requestAnimationFrame(() => go(start - 1)));
  }

  // 外部 (書き出しスクリプト等) から操作するための API
  window.deck = {
    go, next, prev,
    get index() { return index; },
    get length() { return slides.length; },
    steps: (n = index) => stepsOf(slides[n]).length,
  };
})();
