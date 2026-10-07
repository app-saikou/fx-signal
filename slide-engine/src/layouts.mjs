// レイアウトごとの HTML レンダラと検証ルール。
// 1 レイアウト = { render(slide, ctx) => html, rules: { required, limits } }

// ---------- helpers ----------
export const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// インライン記法: **強調(アクセント色)**  ==マーカー==  改行は \n
export const fmt = (s = "") =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<em class="hl">$1</em>')
    .replace(/==(.+?)==/g, '<em class="marker">$1</em>')
    .replace(/\n/g, "<br>");

export const plain = (s = "") => String(s).replace(/\*\*|==/g, "").replace(/\n/g, "");

// アニメーション属性。steps=true のスライドでは data-step に置き換える
const anim = (ctx, kind = "up", extra = 0) => {
  const i = ctx.i++ + extra;
  return `data-anim="${kind}" style="--i:${i}"`;
};
const item = (ctx, kind, n) =>
  ctx.slide.steps ? `data-step="${n + 1}"` : anim(ctx, kind);

const isNumeric = (v) => /^-?[\d,]+(\.\d+)?$/.test(String(v ?? "").trim());
const numHTML = (v) => {
  const s = String(v ?? "").trim();
  if (!isNumeric(s)) return esc(s);
  return `<span data-count="${s.replace(/,/g, "")}"${s.includes(",") ? ' data-group="1"' : ""}>${esc(s)}</span>`;
};

const head = (s, ctx) =>
  s.title || s.kicker || s.lead
    ? `<header class="head">
        ${s.kicker ? `<div class="kicker" ${anim(ctx, "left")}>${esc(s.kicker)}</div>` : ""}
        ${s.title ? `<h2 class="title" ${anim(ctx)}>${fmt(s.title)}</h2>` : ""}
        ${s.lead ? `<p class="lead" ${anim(ctx)}>${fmt(s.lead)}</p>` : ""}
      </header>`
    : "";

const bullets = (list = [], ctx, cls = "") =>
  list.length
    ? `<ul class="bullets ${cls}">${list.map((b, n) => `<li ${item(ctx, "up", n)}>${fmt(b)}</li>`).join("")}</ul>`
    : "";

const img = (src, cls, alt = "") =>
  src
    ? `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}">`
    : `<svg class="${cls}" viewBox="0 0 16 9" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="ph" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3f4b"/><stop offset="1" stop-color="#151619"/></linearGradient></defs><rect width="16" height="9" fill="url(#ph)"/></svg>`;

const ICON_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" stroke-width="1.5" opacity=".35"/><path d="M7.5 12.5l3 3 6-6.5"/></svg>`;
const ICON_DASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10" stroke-width="1.5" opacity=".35"/><path d="M8 12h8"/></svg>`;
const ICON_ARROW = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h15M13 6l6 6-6 6"/></svg>`;

const pad2 = (n) => String(n).padStart(2, "0");

// ---------- layouts ----------
export const layouts = {
  cover: {
    rules: { required: ["title"], limits: { title: 34, subtitle: 60 } },
    chrome: false,
    render: (s, ctx) => `
      <svg class="cover-deco" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="49" fill="none" stroke="var(--accent)" stroke-width=".25" ${anim(ctx, "fade")}/>
        <circle cx="50" cy="50" r="30" fill="var(--accent-soft)" ${anim(ctx, "scale")}/>
      </svg>
      <div>${s.kicker ? `<div class="kicker" ${anim(ctx, "left")}>${esc(s.kicker)}</div>` : ""}</div>
      <div>
        <h1 class="cover-title" ${anim(ctx)}>${fmt(s.title)}</h1>
        ${s.subtitle ? `<p class="cover-sub" ${anim(ctx)}>${fmt(s.subtitle)}</p>` : ""}
      </div>
      <div class="cover-meta" ${anim(ctx, "fade")}><span>${esc(s.meta || "")}</span><span>${esc(s.date || "")}</span></div>`,
  },

  agenda: {
    rules: { required: ["items"], count: [2, 8], itemLimits: { heading: 22 } },
    render: (s, ctx) => `
      ${head({ title: s.title || "Agenda", kicker: s.kicker }, ctx)}
      <div class="body"><ol class="agenda">
        ${s.items.map((it, n) => `<li ${item(ctx, "up", n)}><span class="num">${pad2(n + 1)}</span>${fmt(it.heading)}</li>`).join("")}
      </ol></div>`,
  },

  section: {
    rules: { required: ["title"], limits: { title: 24, subtitle: 50 } },
    render: (s, ctx) => `
      <div class="sec-num num" ${anim(ctx, "mask")}>${esc(s.number ?? pad2(ctx.sectionNo))}</div>
      <h2 class="sec-title" ${anim(ctx)}>${fmt(s.title)}</h2>
      ${s.subtitle ? `<p class="sec-sub" ${anim(ctx)}>${fmt(s.subtitle)}</p>` : ""}`,
  },

  statement: {
    rules: { required: ["text"], limits: { text: 44, sub: 80 } },
    render: (s, ctx) => `
      ${s.kicker ? `<div class="kicker" ${anim(ctx, "left")} style="margin-bottom:48px">${esc(s.kicker)}</div>` : ""}
      <h2 class="stmt" ${anim(ctx)}>${fmt(s.text)}</h2>
      ${s.sub ? `<p class="stmt-sub" ${anim(ctx)}>${fmt(s.sub)}</p>` : ""}`,
  },

  bigNumber: {
    rules: { required: ["value", "label"], limits: { value: 6, unit: 4, label: 30, sub: 80 } },
    render: (s, ctx) => {
      // 桁数に応じて数字サイズを自動調整 (数字列の幅 ≒ 0.62em/字, 単位は 0.32em)
      const vlen = String(s.value).length, ulen = String(s.unit || "").length;
      const size = Math.min(400, Math.floor(1000 / (0.62 * vlen + 0.2 * ulen + 0.05)));
      return `
      ${head({ kicker: s.kicker, title: s.title }, ctx)}
      <div class="bn" style="--bn:${size}px">
        <div class="bn-value num" ${anim(ctx, "up")}>${numHTML(s.value)}${s.unit ? `<span class="bn-unit">${esc(s.unit)}</span>` : ""}</div>
        <div ${anim(ctx)}>
          <p class="bn-label">${fmt(s.label)}</p>
          ${s.sub ? `<p class="bn-sub">${fmt(s.sub)}</p>` : ""}
        </div>
      </div>`;
    },
  },

  stats: {
    rules: { required: ["title", "items"], count: [2, 4], limits: { title: 40 }, itemLimits: { value: 6, label: 40 } },
    render: (s, ctx) => `
      ${head(s, ctx)}
      <div class="body"><div class="stats" style="--n:${s.items.length}">
        ${s.items.map((it, n) => `
          <div class="stat" ${item(ctx, "up", n)}>
            <div class="stat-value num">${numHTML(it.value)}${it.unit ? `<span class="stat-unit">${esc(it.unit)}</span>` : ""}</div>
            <p class="stat-label">${fmt(it.label)}</p>
          </div>`).join("")}
      </div></div>`,
  },

  twoColumn: {
    rules: { required: ["title", "left", "right"], limits: { title: 40 } },
    render: (s, ctx) => {
      const col = (c, n) => `
        <div class="col" ${item(ctx, "up", n)}>
          ${c.heading ? `<h3>${fmt(c.heading)}</h3>` : ""}
          ${c.body ? `<p>${fmt(c.body)}</p>` : ""}
          ${c.bullets ? `<ul class="bullets small">${c.bullets.map((b) => `<li>${fmt(b)}</li>`).join("")}</ul>` : ""}
        </div>`;
      return `${head(s, ctx)}<div class="body"><div class="cols">${col(s.left, 0)}${col(s.right, 1)}</div></div>`;
    },
  },

  compare: {
    rules: { required: ["title", "left", "right"], limits: { title: 40 } },
    render: (s, ctx) => {
      const panel = (p, cls, icon, n) => `
        <div class="panel ${cls}" ${item(ctx, cls === "after" ? "scale" : "up", n)}>
          <div class="panel-label">${esc(p.label || (cls === "after" ? "After" : "Before"))}</div>
          <ul>${(p.items || []).map((t) => `<li>${icon}<span>${fmt(t)}</span></li>`).join("")}</ul>
        </div>`;
      return `${head(s, ctx)}
        <div class="body"><div class="cmp">
          ${panel(s.left, "before", ICON_DASH, 0)}
          <div class="arrow" ${anim(ctx, "left")}>${ICON_ARROW}</div>
          ${panel(s.right, "after", ICON_CHECK, 1)}
        </div></div>`;
    },
  },

  cards: {
    rules: { required: ["title", "items"], count: [2, 4], limits: { title: 40 }, itemLimits: { heading: 18, body: 80 } },
    render: (s, ctx) => `
      ${head(s, ctx)}
      <div class="body"><div class="cards" style="--n:${s.items.length}">
        ${s.items.map((it, n) => `
          <article class="card" ${item(ctx, "up", n)}>
            <span class="num">${pad2(n + 1)}</span>
            <h3>${fmt(it.heading)}</h3>
            ${it.body ? `<p>${fmt(it.body)}</p>` : ""}
          </article>`).join("")}
      </div></div>`,
  },

  process: {
    rules: { required: ["title", "items"], count: [3, 5], limits: { title: 40 }, itemLimits: { heading: 14, body: 50 } },
    render: (s, ctx) => `
      ${head(s, ctx)}
      <div class="body"><div class="steps" style="--n:${s.items.length}">
        ${s.items.map((it, n) => `
          <div class="step" ${item(ctx, "up", n)}>
            <div class="step-line"></div>
            <div class="step-dot num">${n + 1}</div>
            <h3>${fmt(it.heading)}</h3>
            ${it.body ? `<p>${fmt(it.body)}</p>` : ""}
          </div>`).join("")}
      </div></div>`,
  },

  timeline: {
    rules: { required: ["title", "items"], count: [3, 6], limits: { title: 40 }, itemLimits: { date: 10, heading: 16, body: 44 } },
    render: (s, ctx) => `
      ${head(s, ctx)}
      <div class="body"><div class="tl" style="--n:${s.items.length}">
        ${s.items.map((it, n) => `
          <div class="tl-item ${n === (s.highlight ?? s.items.length - 1) ? "is-key" : ""}" ${item(ctx, "up", n)}>
            <div class="tl-date num">${esc(it.date)}</div>
            <h3>${fmt(it.heading)}</h3>
            ${it.body ? `<p>${fmt(it.body)}</p>` : ""}
          </div>`).join("")}
      </div></div>`,
  },

  chart: {
    rules: { required: ["title", "items"], count: [2, 8], limits: { title: 40 }, itemLimits: { label: 12 } },
    render: (s, ctx) => {
      const vals = s.items.map((it) => parseFloat(String(it.value).replace(/,/g, "")) || 0);
      const max = Math.max(...vals, 1e-9);
      const hl = s.highlight ?? vals.indexOf(Math.max(...vals));
      return `${head(s, ctx)}
        <div class="body"><div class="bars">
          ${s.items.map((it, n) => `
            <div class="bar-row ${n === hl ? "is-hl" : ""}">
              <div class="bar-label" ${anim(ctx, "fade")}>${fmt(it.label)}</div>
              <div class="bar-track"><div class="bar-fill" data-anim="grow-x" style="--i:${ctx.i++};--v:${(vals[n] / max).toFixed(4)}"></div></div>
              <div class="bar-value num" ${anim(ctx, "fade")}>${numHTML(it.value)}${s.unit ? `<small>${esc(s.unit)}</small>` : ""}</div>
            </div>`).join("")}
          ${s.note ? `<p class="chart-note">${fmt(s.note)}</p>` : ""}
        </div></div>`;
    },
  },

  image: {
    rules: { required: ["title"], limits: { title: 36, caption: 80 } },
    render: (s, ctx) => `
      ${img(s.image, "img-bg", s.alt)}
      <div class="img-shade"></div>
      <div class="img-text">
        ${s.kicker ? `<div class="kicker" ${anim(ctx, "left")} style="color:#fff;margin-bottom:24px">${esc(s.kicker)}</div>` : ""}
        <h2 class="img-title" ${anim(ctx)}>${fmt(s.title)}</h2>
        ${s.caption ? `<p class="img-caption" ${anim(ctx)}>${fmt(s.caption)}</p>` : ""}
      </div>`,
  },

  imageSplit: {
    rules: { required: ["title"], limits: { title: 30, body: 120 } },
    render: (s, ctx) => `
      ${img(s.image, "split-img", s.alt)}
      <div class="split-body">
        ${s.kicker ? `<div class="kicker" ${anim(ctx, "left")}>${esc(s.kicker)}</div>` : ""}
        <h2 class="title" ${anim(ctx)}>${fmt(s.title)}</h2>
        ${s.body ? `<p ${anim(ctx)}>${fmt(s.body)}</p>` : ""}
        ${bullets(s.bullets, ctx, "small")}
      </div>`,
  },

  quote: {
    rules: { required: ["text"], limits: { text: 80, cite: 40 } },
    render: (s, ctx) => `
      <div class="q-mark" ${anim(ctx, "fade")}>“</div>
      <blockquote class="q-text" ${anim(ctx)}>${fmt(s.text)}</blockquote>
      ${s.cite ? `<cite class="q-cite" ${anim(ctx, "fade")}>${esc(s.cite)}</cite>` : ""}`,
  },

  table: {
    rules: { required: ["title", "columns", "rows"], limits: { title: 40 } },
    render: (s, ctx) => {
      const hl = s.highlight;
      const cls = (c) => (c === hl ? ' class="is-hl"' : "");
      return `${head(s, ctx)}
        <div class="body"><table>
          <thead><tr>${s.columns.map((c, i) => `<th${cls(i)}>${fmt(c)}</th>`).join("")}</tr></thead>
          <tbody>${s.rows.map((r, n) => `<tr ${item(ctx, "fade", n)}>${r.map((c, i) => `<td${cls(i)}>${fmt(c)}</td>`).join("")}</tr>`).join("")}</tbody>
        </table></div>`;
    },
  },

  bullets: {
    rules: { required: ["title", "bullets"], count: [1, 6], countField: "bullets", limits: { title: 40 } },
    render: (s, ctx) => `${head(s, ctx)}<div class="body">${bullets(s.bullets, ctx)}</div>`,
  },

  closing: {
    rules: { required: ["title"], limits: { title: 30, subtitle: 70 } },
    chrome: false,
    render: (s, ctx) => `
      <h2 class="cl-title" ${anim(ctx)}>${fmt(s.title)}</h2>
      ${s.subtitle ? `<p class="cl-sub" ${anim(ctx)}>${fmt(s.subtitle)}</p>` : ""}
      ${s.meta ? `<div class="cl-contact" ${anim(ctx, "fade")}>${fmt(s.meta)}</div>` : ""}`,
  },
};

// ---------- validation ----------
export function validateDeck(deck) {
  const errors = [], warnings = [];
  if (!deck || !Array.isArray(deck.slides) || !deck.slides.length) {
    return { errors: ["deck.slides が空です"], warnings };
  }
  deck.slides.forEach((s, idx) => {
    const at = `slides[${idx}] (${s.layout})`;
    const L = layouts[s.layout];
    if (!L) return errors.push(`${at}: 未知の layout。使用可能: ${Object.keys(layouts).join(", ")}`);
    const r = L.rules;
    for (const f of r.required || []) {
      const v = s[f];
      if (v == null || v === "" || (Array.isArray(v) && !v.length)) errors.push(`${at}: 必須フィールド "${f}" がありません`);
    }
    for (const [f, max] of Object.entries(r.limits || {})) {
      if (s[f] != null && plain(s[f]).length > max)
        warnings.push(`${at}: "${f}" が ${plain(s[f]).length} 文字 (上限目安 ${max})。短くするかスライドを分割`);
    }
    const list = s[r.countField || "items"];
    if (r.count && Array.isArray(list)) {
      const [min, max] = r.count;
      if (list.length < min || list.length > max)
        errors.push(`${at}: 要素数 ${list.length} (許容 ${min}〜${max})。レイアウト変更か分割を検討`);
    }
    if (r.itemLimits && Array.isArray(s.items)) {
      s.items.forEach((it, k) => {
        for (const [f, max] of Object.entries(r.itemLimits))
          if (it?.[f] != null && plain(it[f]).length > max)
            warnings.push(`${at}.items[${k}].${f}: ${plain(it[f]).length} 文字 (上限目安 ${max})`);
      });
    }
    if (s.layout === "table") {
      if (s.columns?.length > 5) warnings.push(`${at}: 列が ${s.columns.length} (推奨 5 以下)`);
      if (s.rows?.length > 6) warnings.push(`${at}: 行が ${s.rows.length} (推奨 6 以下)`);
    }
  });
  // デッキ構成のリズムチェック
  const seq = deck.slides.map((s) => s.layout);
  for (let i = 2; i < seq.length; i++)
    if (seq[i] === seq[i - 1] && seq[i] === seq[i - 2] && seq[i] !== "section")
      warnings.push(`slides[${i - 2}..${i}]: "${seq[i]}" が 3 連続。リズムが単調になるため別レイアウトを挟む`);
  return { errors, warnings };
}
