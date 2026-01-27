(() => {
  // ====== CONFIG ======
  const STORAGE_KEY = "serp_site_notes_v2"; // { byUrl: {}, bySite: {} }
  const LEGACY_KEY = "serp_site_notes_v1";  // legacy: { host: text }
  const PANEL_SIZE_KEY = "serp_note_panel_size_v1"; // { w, h }
  const BADGE_COLORS_KEY = "serp_badge_colors_v1"; // { badgeKey: { bgColor, textColor } }

  const MARK_NUM = "serpNumDone";
  const MARK_ADS = "serpAdsDone";
  const MARK_NOTE = "serpNoteDone";

  const NUM_BADGE_CLASS = "serp-num-badge";
  const ADS_BADGE_CLASS = "serp-ads-badge";
  const NOTE_WRAP_CLASS = "serp-note-wrap";

  const STYLE_ID = "serp-numerator-style";

  // Global badge colors cache
  let badgeColorsCache = {};

  // Global floating panel refs
  let panelEl = null;
  let panelActiveWrap = null; // the .serp-note-wrap of currently opened item
  let cachedPanelSize = null; // {w,h}

  // ====== THEME DETECTION ======
  function parseRgb(str) {
    const m = String(str).match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3] };
  }

  function isDarkColor(rgb) {
    const lum = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
    return lum < 128;
  }

  function detectPageDarkTheme() {
    const cs = (getComputedStyle(document.documentElement).colorScheme || "").toLowerCase();
    if (cs.includes("dark")) return true;
    if (cs.includes("light")) return false;

    const bodyBg = getComputedStyle(document.body).backgroundColor;
    let rgb = parseRgb(bodyBg);

    if (!rgb || bodyBg === "transparent") {
      const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
      rgb = parseRgb(htmlBg);
    }

    if (rgb) return isDarkColor(rgb);
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  function syncThemeFlag() {
    const isDark = detectPageDarkTheme();
    document.documentElement.dataset.serpTheme = isDark ? "dark" : "light";
  }

  // ====== HELPERS ======
  function isSearchPage() {
    return location.pathname === "/search";
  }

  function getBaseIndexFromUrl() {
    const params = new URLSearchParams(location.search);
    const startRaw = params.get("start");
    const start = startRaw ? parseInt(startRaw, 10) : 0;
    return (Number.isFinite(start) ? start : 0) + 1;
  }

  function isInAdsContainer(node) {
    return !!node.closest("#tads, #tadsb");
  }

  function getResultRootFromH3(h3) {
    const byHveid = h3.closest("div[data-hveid]");
    if (byHveid) return byHveid;

    const byMjj = h3.closest("div.MjjYud");
    if (byMjj) return byMjj;

    return h3.closest("div");
  }

  function ensureRoot(root) {
    if (!root || !(root instanceof HTMLElement)) return null;
    if (!root.classList.contains("serp-result-root")) {
      root.classList.add("serp-result-root");
    }
    return root;
  }

  function hasDirectChildWithClass(root, cls) {
    for (let i = 0; i < root.children.length; i++) {
      const el = root.children[i];
      if (el && el.classList && el.classList.contains(cls)) return true;
    }
    return false;
  }

  function addBadge(root, type, text) {
    const cls = type === "ads" ? ADS_BADGE_CLASS : NUM_BADGE_CLASS;
    if (hasDirectChildWithClass(root, cls)) return;

    const badge = document.createElement("span");
    badge.className = cls;
    badge.textContent = text;
    
    // Apply saved colors if available
    const badgeKey = type === "num" ? `pos_${text}_${getQuerySignature()}` : null;
    if (badgeKey && badgeColorsCache[badgeKey]) {
      const colors = badgeColorsCache[badgeKey];
      badge.style.background = colors.bgColor;
      badge.style.color = colors.textColor;
    } else if (type === "ads") {
      badge.style.background = "linear-gradient(135deg, #f5a623 0%, #e67e22 100%)";
      badge.style.color = "#fff";
    } else {
      badge.style.background = "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
      badge.style.color = "#fff";
    }
    
    root.insertBefore(badge, root.firstChild);
  }

  function getQuerySignature() {
    try {
      const params = new URLSearchParams(location.search);
      return params.get("q") || "";
    } catch {
      return "";
    }
  }

  function looksLikeOrganicH3(h3) {
    const a = h3.closest("a[href]");
    if (!a) return false;

    const search = document.getElementById("search");
    if (!search || !search.contains(h3)) return false;

    const href = a.getAttribute("href") || "";
    const badPrefixes = ["#", "/search?", "/imgres?"];
    for (let i = 0; i < badPrefixes.length; i++) {
      if (href.startsWith(badPrefixes[i])) return false;
    }
    return true;
  }

  function extractFinalUrlFromAnchor(a) {
    try {
      const href = a.getAttribute("href") || "";

      // /url?q=...
      if (
        href.startsWith("/url?") ||
        href.startsWith("https://www.google.") ||
        href.startsWith("https://google.")
      ) {
        const u = new URL(href, location.origin);
        const q = u.searchParams.get("q") || u.searchParams.get("url");
        if (q) return q;
        return u.toString();
      }

      if (href.startsWith("http://") || href.startsWith("https://")) return href;
      return null;
    } catch {
      return null;
    }
  }

  function normalizeUrlKey(url) {
    try {
      const u = new URL(url);
      // note per URL without #hash
      return u.origin + u.pathname + u.search;
    } catch {
      return null;
    }
  }

  function hostFromUrl(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }

  // ====== STORAGE (notes v2) ======
  function storageGetAllNotesV2() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY, LEGACY_KEY], (res) => {
        const v2 = res && res[STORAGE_KEY] ? res[STORAGE_KEY] : null;
        if (v2 && typeof v2 === "object" && v2.byUrl && v2.bySite) {
          resolve(v2);
          return;
        }

        // migrate legacy -> bySite
        const legacy = res && res[LEGACY_KEY] ? res[LEGACY_KEY] : null;
        const migrated = {
          byUrl: {},
          bySite: legacy && typeof legacy === "object" ? legacy : {},
        };

        chrome.storage.local.set({ [STORAGE_KEY]: migrated }, () => resolve(migrated));
      });
    });
  }

  function storageSetAllNotesV2(obj) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: obj }, () => resolve());
    });
  }

  // ====== STORAGE (panel size) ======
  function storageGetPanelSize() {
    return new Promise((resolve) => {
      chrome.storage.local.get([PANEL_SIZE_KEY], (res) => {
        const v = res && res[PANEL_SIZE_KEY] ? res[PANEL_SIZE_KEY] : null;
        if (v && typeof v === "object" && Number.isFinite(v.w) && Number.isFinite(v.h)) {
          resolve({ w: v.w, h: v.h });
        } else {
          resolve(null);
        }
      });
    });
  }

  function storageSetPanelSize(w, h) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [PANEL_SIZE_KEY]: { w, h } }, () => resolve());
    });
  }

  // ====== STORAGE (badge colors) ======
  async function storageGetBadgeColors() {
    return new Promise((resolve) => {
      chrome.storage.local.get([BADGE_COLORS_KEY], (res) => {
        const colors = res && res[BADGE_COLORS_KEY] ? res[BADGE_COLORS_KEY] : {};
        badgeColorsCache = colors;
        console.log("[SERP] Badge colors loaded:", Object.keys(colors).length);
        resolve(colors);
      });
    });
  }

  function storageSetBadgeColor(badgeKey, bgColor, textColor) {
    return new Promise((resolve) => {
      chrome.storage.local.get([BADGE_COLORS_KEY], (res) => {
        const colors = res && res[BADGE_COLORS_KEY] ? res[BADGE_COLORS_KEY] : {};
        colors[badgeKey] = { bgColor, textColor };
        badgeColorsCache = colors;
        chrome.storage.local.set({ [BADGE_COLORS_KEY]: colors }, () => {
          console.log("[SERP] Badge color saved for", badgeKey);
          resolve();
        });
      });
    });
  }

  // ====== NOTES LOGIC ======
  function pickEffectiveNote(notesV2, urlKey, host) {
    if (urlKey && notesV2.byUrl && Object.prototype.hasOwnProperty.call(notesV2.byUrl, urlKey)) {
      return { text: notesV2.byUrl[urlKey] || "", scope: "url" };
    }
    if (host && notesV2.bySite && Object.prototype.hasOwnProperty.call(notesV2.bySite, host)) {
      return { text: notesV2.bySite[host] || "", scope: "site" };
    }
    return { text: "", scope: "url" };
  }

  // ====== PREVIEW LAYOUT (multiline + More/Less + responsive width) ======
  function computePreviewMaxWidth(wrap) {
    const marginRight = 14;
    const gap = 8;

    const rect = wrap.getBoundingClientRect();
    let available = window.innerWidth - marginRight - rect.left;

    if (!Number.isFinite(available)) available = 320;
    available = Math.max(180, available - gap);

    return available;
  }

  function applyPreviewLayout(wrap) {
    const preview = wrap.querySelector(".serp-note-preview");
    const toggle = wrap.querySelector(".serp-note-toggle");
    if (!preview || !toggle) return;

    if (preview.style.display === "none") {
      toggle.style.display = "none";
      preview.classList.remove("collapsed");
      preview.style.maxHeight = "";
      preview.dataset.expanded = "";
      return;
    }

    // width: as wide as possible with right margin
    const maxW = computePreviewMaxWidth(wrap);
    preview.style.maxWidth = maxW + "px";

    // height clamp relative to snippet height
    const root = wrap.closest(".serp-result-root");
    const snippetH = root ? root.getBoundingClientRect().height : 120;
    const clampH = Math.max(60, Math.min(220, Math.round(snippetH)));

    preview.style.maxHeight = "";
    preview.classList.remove("collapsed");

    const needsClamp = preview.scrollHeight > clampH + 6;

    if (!needsClamp) {
      toggle.style.display = "none";
      preview.dataset.expanded = "";
      return;
    }

    const expanded = preview.dataset.expanded === "1";
    if (expanded) {
      preview.classList.remove("collapsed");
      preview.style.maxHeight = "";
      toggle.textContent = "Less";
    } else {
      preview.classList.add("collapsed");
      preview.style.maxHeight = clampH + "px";
      toggle.textContent = "More";
    }

    toggle.style.display = "inline-flex";
  }

  function updatePreview(wrap, text) {
    const preview = wrap.querySelector(".serp-note-preview");
    const toggle = wrap.querySelector(".serp-note-toggle");
    if (!preview) return;

    const t = (text || "").trim();
    if (!t) {
      preview.textContent = "";
      preview.title = "";
      preview.style.display = "none";
      preview.dataset.expanded = "";
      if (toggle) toggle.style.display = "none";
      return;
    }

    // preserve newlines (CSS white-space: pre-wrap)
    preview.textContent = t;
    preview.title = t;

    preview.style.display = "block";
    preview.dataset.expanded = ""; // default collapsed on update
    applyPreviewLayout(wrap);
  }

  // ====== UI: styles ======
  function injectStylesOnce() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;

    const css = [
      "/* Palettes:\n",
      "   page light -> dark bg, light text\n",
      "   page dark  -> light bg, dark text\n",
      "*/\n",

      ':root[data-serp-theme="light"]{\n',
      "  --serp-bg: #111;\n",
      "  --serp-fg: #fff;\n",
      "  --serp-border: rgba(0,0,0,.30);\n",
      "  --serp-muted-bg: #1a1a1a;\n",
      "  --serp-input-bg: #111;\n",
      "  --serp-input-fg: #fff;\n",
      "  --serp-shadow: 0 10px 30px rgba(0,0,0,.35);\n",
      "}\n",

      ':root[data-serp-theme="dark"]{\n',
      "  --serp-bg: #fff;\n",
      "  --serp-fg: #111;\n",
      "  --serp-border: rgba(0,0,0,.18);\n",
      "  --serp-muted-bg: #f3f3f3;\n",
      "  --serp-input-bg: #fff;\n",
      "  --serp-input-fg: #111;\n",
      "  --serp-shadow: 0 10px 30px rgba(0,0,0,.22);\n",
      "}\n",

      ".serp-result-root{\n",
      "  position: relative !important;\n",
      "  overflow: visible !important;\n",
      "}\n",

      ".serp-num-badge, .serp-ads-badge{\n",
      "  position: absolute;\n",
      "  left: 0;\n",
      "  top: 50%;\n",
      "  transform: translate(calc(-100% - 12px), -50%);\n",
      "  display: inline-flex;\n",
      "  align-items: center;\n",
      "  justify-content: center;\n",
      "  min-width: 38px;\n",
      "  height: 26px;\n",
      "  padding: 0 8px;\n",
      "  border-radius: 12px;\n",
      "  border: none;\n",
      "  font: 700 13px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;\n",
      "  z-index: 20;\n",
      "  user-select: none;\n",
      "  pointer-events: auto;\n",
      "  transition: all 0.2s ease;\n",
      "}\n",

      ".serp-note-wrap{\n",
      "  position: absolute;\n",
      "  right: 0;\n",
      "  top: 50%;\n",
      "  transform: translate(calc(100% + 10px), -50%);\n",
      "  width: auto;\n",
      "  z-index: 20;\n",
      "  display: inline-flex;\n",
      "  align-items: center;\n",
      "  gap: 8px;\n",
      "}\n",

      ".serp-note-btn{\n",
      "  border: 1px solid var(--serp-border);\n",
      "  background: var(--serp-bg);\n",
      "  color: var(--serp-fg);\n",
      "  border-radius: 10px;\n",
      "  padding: 6px 10px;\n",
      "  font: 700 12px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;\n",
      "  cursor: pointer;\n",
      "  user-select: none;\n",
      "}\n",

      ".serp-note-preview{\n",
      "  display: none;\n",
      "  border: 1px solid var(--serp-border);\n",
      "  background: var(--serp-muted-bg);\n",
      "  color: var(--serp-fg);\n",
      "  border-radius: 10px;\n",
      "  padding: 6px 10px;\n",
      "  font: 600 12px/1.25 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;\n",
      "  white-space: pre-wrap;\n",
      "  overflow-wrap: anywhere;\n",
      "  word-break: break-word;\n",
      "  max-width: none;\n",
      "}\n",

      ".serp-note-preview.collapsed{\n",
      "  overflow: hidden;\n",
      "}\n",

      ".serp-note-toggle{\n",
      "  display: none;\n",
      "  border: 1px solid var(--serp-border);\n",
      "  background: var(--serp-bg);\n",
      "  color: var(--serp-fg);\n",
      "  border-radius: 10px;\n",
      "  padding: 6px 10px;\n",
      "  font: 800 12px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;\n",
      "  cursor: pointer;\n",
      "  user-select: none;\n",
      "}\n",

      "/* Global floating editor panel */\n",
      ".serp-note-panel{\n",
      "  position: fixed;\n",
      "  left: 14px;\n",
      "  top: 14px;\n",
      "  right: auto;\n",
      "  width: 380px;\n",
      "  max-width: calc(100vw - 28px);\n",
      "  max-height: calc(100vh - 28px);\n",
      "  border: 1px solid var(--serp-border);\n",
      "  background: var(--serp-muted-bg);\n",
      "  border-radius: 16px;\n",
      "  box-shadow: var(--serp-shadow);\n",
      "  z-index: 999999;\n",
      "  padding: 12px;\n",
      "  display: none;\n",
      "  resize: both;\n",
      "  overflow: auto;\n",
      "}\n",

      ".serp-note-panel-header{\n",
      "  display: flex;\n",
      "  align-items: center;\n",
      "  justify-content: space-between;\n",
      "  gap: 8px;\n",
      "  margin-bottom: 10px;\n",
      "}\n",

      ".serp-note-panel-title{\n",
      "  font: 800 12px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;\n",
      "  color: var(--serp-fg);\n",
      "  opacity: .9;\n",
      "  white-space: nowrap;\n",
      "  overflow: hidden;\n",
      "  text-overflow: ellipsis;\n",
      "}\n",

      ".serp-note-panel-close{\n",
      "  border: 1px solid var(--serp-border);\n",
      "  background: var(--serp-bg);\n",
      "  color: var(--serp-fg);\n",
      "  border-radius: 10px;\n",
      "  padding: 6px 10px;\n",
      "  font: 800 12px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;\n",
      "  cursor: pointer;\n",
      "}\n",

      ".serp-note-scope{\n",
      "  width: 100%;\n",
      "  box-sizing: border-box;\n",
      "  border: 1px solid var(--serp-border);\n",
      "  background: var(--serp-input-bg);\n",
      "  color: var(--serp-input-fg);\n",
      "  border-radius: 12px;\n",
      "  padding: 10px 10px;\n",
      "  font: 700 12px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;\n",
      "  outline: none;\n",
      "  margin-bottom: 10px;\n",
      "}\n",

      ".serp-note-text{\n",
      "  width: 100%;\n",
      "  box-sizing: border-box;\n",
      "  border: 1px solid var(--serp-border);\n",
      "  background: var(--serp-input-bg);\n",
      "  color: var(--serp-input-fg);\n",
      "  border-radius: 12px;\n",
      "  padding: 10px;\n",
      "  font: 600 13px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;\n",
      "  outline: none;\n",
      "  min-height: 140px;\n",
      "  resize: none;\n",
      "}\n",

      ".serp-note-actions{\n",
      "  margin-top: 10px;\n",
      "  display: flex;\n",
      "  gap: 10px;\n",
      "  justify-content: flex-end;\n",
      "  flex-wrap: wrap;\n",
      "}\n",

      ".serp-note-action{\n",
      "  border: 1px solid var(--serp-border);\n",
      "  background: var(--serp-bg);\n",
      "  color: var(--serp-fg);\n",
      "  border-radius: 12px;\n",
      "  padding: 10px 12px;\n",
      "  font: 800 12px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;\n",
      "  cursor: pointer;\n",
      "}\n",

      ".serp-note-action.danger{\n",
      "  border-color: rgba(180,0,0,.35);\n",
      "}\n",
    ].join("");

    style.textContent = css;
    document.head.appendChild(style);
  }

  // ====== UI: per-result note widget (button + multiline preview + toggle) ======
  function makeNotesWidget(host, urlKey, initialText) {
    const wrap = document.createElement("div");
    wrap.className = NOTE_WRAP_CLASS;
    wrap.dataset.host = host || "";
    wrap.dataset.urlKey = urlKey || "";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "serp-note-btn";
    btn.textContent = "Note";
    btn.dataset.action = "open-note";

    const preview = document.createElement("div");
    preview.className = "serp-note-preview";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "serp-note-toggle";
    toggle.textContent = "More";
    toggle.dataset.action = "toggle-preview";

    wrap.appendChild(btn);
    wrap.appendChild(preview);
    wrap.appendChild(toggle);

    updatePreview(wrap, initialText);
    return wrap;
  }

  // ====== UI: global floating panel ======
  async function ensurePanel() {
    if (panelEl) return panelEl;

    if (!cachedPanelSize) {
      cachedPanelSize = await storageGetPanelSize();
    }

    const panel = document.createElement("div");
    panel.className = "serp-note-panel";
    panel.dataset.role = "note-panel";

    // SAFETY: even if CSS fails, don't render it like a normal div
    panel.style.display = "none";
    panel.style.position = "fixed";
    panel.style.zIndex = "999999";

    const header = document.createElement("div");
    header.className = "serp-note-panel-header";

    const title = document.createElement("div");
    title.className = "serp-note-panel-title";
    title.dataset.role = "note-title";
    title.textContent = "Note";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "serp-note-panel-close";
    closeBtn.textContent = "Close";
    closeBtn.dataset.action = "close-note";

    header.appendChild(title);
    header.appendChild(closeBtn);

    const scope = document.createElement("select");
    scope.className = "serp-note-scope";
    scope.dataset.role = "note-scope";

    const optUrl = document.createElement("option");
    optUrl.value = "url";
    optUrl.textContent = "This URL";

    const optSite = document.createElement("option");
    optSite.value = "site";
    optSite.textContent = "This site";

    scope.appendChild(optUrl);
    scope.appendChild(optSite);

    const ta = document.createElement("textarea");
    ta.className = "serp-note-text";
    ta.placeholder = "Write a note...";
    ta.dataset.role = "note-textarea";

    const actions = document.createElement("div");
    actions.className = "serp-note-actions";

    const del = document.createElement("button");
    del.type = "button";
    del.className = "serp-note-action danger";
    del.textContent = "Delete";
    del.dataset.action = "delete-note";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "serp-note-action";
    cancel.textContent = "Cancel";
    cancel.dataset.action = "cancel-note";

    const save = document.createElement("button");
    save.type = "button";
    save.className = "serp-note-action";
    save.textContent = "Save";
    save.dataset.action = "save-note";

    actions.appendChild(del);
    actions.appendChild(cancel);
    actions.appendChild(save);

    panel.appendChild(header);
    panel.appendChild(scope);
    panel.appendChild(ta);
    panel.appendChild(actions);

    if (cachedPanelSize && cachedPanelSize.w && cachedPanelSize.h) {
      panel.style.width = cachedPanelSize.w + "px";
      panel.style.height = cachedPanelSize.h + "px";
    }

    const hostNode = document.body || document.documentElement;
    hostNode.appendChild(panel);

    // Persist panel size while resizing (only when visible)
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => {
        if (panel.style.display !== "block") return;

        const w = Math.round(panel.getBoundingClientRect().width);
        const h = Math.round(panel.getBoundingClientRect().height);

        const w2 = Math.max(320, w);
        const h2 = Math.max(240, h);

        cachedPanelSize = { w: w2, h: h2 };

        if (panel._saveTimer) clearTimeout(panel._saveTimer);
        panel._saveTimer = setTimeout(() => {
          storageSetPanelSize(w2, h2);
        }, 250);
      });
      ro.observe(panel);
    }

    panelEl = panel;
    return panelEl;
  }

  // Open panel next to the clicked snippet/result (right if possible, else left)
  function openPanelAtWrap(wrap, titleText, scopeValue, noteText) {
    if (!panelEl) return;

    panelActiveWrap = wrap;

    const title = panelEl.querySelector('[data-role="note-title"]');
    const scope = panelEl.querySelector('[data-role="note-scope"]');
    const ta = panelEl.querySelector('[data-role="note-textarea"]');

    if (title) title.textContent = titleText || "Note";
    if (scope) scope.value = scopeValue || "url";
    if (ta) ta.value = noteText || "";

    // show first to get size
    panelEl.style.display = "block";

    const anchor = wrap.closest(".serp-result-root") || wrap;
    const a = anchor.getBoundingClientRect();
    const p = panelEl.getBoundingClientRect();

    const gap = 12;
    const margin = 14;

    let left = a.right + gap;
    let top = a.top;

    if (left + p.width + margin > window.innerWidth) {
      const leftCandidate = a.left - gap - p.width;
      if (leftCandidate >= margin) {
        left = leftCandidate;
      } else {
        left = Math.max(margin, window.innerWidth - p.width - margin);
      }
    }

    const maxTop = Math.max(margin, window.innerHeight - p.height - margin);
    top = Math.max(margin, Math.min(top, maxTop));

    panelEl.style.left = left + "px";
    panelEl.style.top = top + "px";
    panelEl.style.right = "auto";

    if (ta) setTimeout(() => ta.focus(), 0);
  }

  function closePanel() {
    if (!panelEl) return;
    panelEl.style.display = "none";
    panelActiveWrap = null;
  }

  // ====== MAIN ======
  async function labelAds() {
    const adContainers = [document.getElementById("tads"), document.getElementById("tadsb")].filter(Boolean);

    for (let i = 0; i < adContainers.length; i++) {
      const container = adContainers[i];
      const h3List = container.querySelectorAll("h3");

      h3List.forEach((h3) => {
        if (!(h3 instanceof HTMLElement)) return;

        const root = ensureRoot(getResultRootFromH3(h3));
        if (!root) return;

        if (root.dataset[MARK_ADS] === "1") return;

        addBadge(root, "ads", "Ads");
        root.dataset[MARK_ADS] = "1";
      });
    }
  }

  async function numberOrganic() {
    const base = getBaseIndexFromUrl();
    let counter = 0;

    const search = document.getElementById("search");
    if (!search) return;

    const h3List = search.querySelectorAll("h3");
    const seen = new Set();
    const rootsInOrder = [];

    h3List.forEach((h3) => {
      if (!(h3 instanceof HTMLElement)) return;
      if (!looksLikeOrganicH3(h3)) return;
      if (isInAdsContainer(h3)) return;

      const root = ensureRoot(getResultRootFromH3(h3));
      if (!root) return;
      if (root.dataset[MARK_ADS] === "1") return;

      if (seen.has(root)) return;
      seen.add(root);
      rootsInOrder.push(root);
    });

    rootsInOrder.forEach((root) => {
      if (root.dataset[MARK_NUM] === "1") return;

      counter += 1;
      const n = base + (counter - 1);

      addBadge(root, "num", String(n));
      root.dataset[MARK_NUM] = "1";
    });
  }

  async function attachNotes() {
    const notesV2 = await storageGetAllNotesV2();

    const search = document.getElementById("search");
    if (!search) return;

    const h3List = search.querySelectorAll("h3");
    const seen = new Set();
    const roots = [];

    h3List.forEach((h3) => {
      if (!(h3 instanceof HTMLElement)) return;
      if (!looksLikeOrganicH3(h3)) return;
      if (isInAdsContainer(h3)) return;

      const root = ensureRoot(getResultRootFromH3(h3));
      if (!root) return;
      if (root.dataset[MARK_ADS] === "1") return;

      if (seen.has(root)) return;
      seen.add(root);
      roots.push(root);
    });

    roots.forEach((root) => {
      if (root.dataset[MARK_NOTE] === "1") return;

      const h3 = root.querySelector('a[href] h3');
      const a = h3 ? h3.closest('a[href]') : null;
      if (!a) return;

      const finalUrl = extractFinalUrlFromAnchor(a);
      if (!finalUrl) return;

      const urlKey = normalizeUrlKey(finalUrl);
      const host = hostFromUrl(finalUrl);

      if (!urlKey || !host) return;

      const picked = pickEffectiveNote(notesV2, urlKey, host);
      const widget = makeNotesWidget(host, urlKey, picked.text);

      if (!hasDirectChildWithClass(root, NOTE_WRAP_CLASS)) {
        root.appendChild(widget);
      }

      applyPreviewLayout(widget);
      root.dataset[MARK_NOTE] = "1";
    });
  }

  async function run() {
    if (!isSearchPage()) return;
    syncThemeFlag();
    injectStylesOnce();
    await ensurePanel();
    await labelAds();
    await numberOrganic();
    await attachNotes();
  }

  // ====== EVENTS ======
  document.addEventListener("click", async (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;

    // Click outside panel closes it (but not when clicking note widgets)
    if (panelEl && panelEl.style.display === "block") {
      const clickedInsidePanel = panelEl.contains(t);
      const clickedNoteWidget = !!t.closest("." + NOTE_WRAP_CLASS);
      if (!clickedInsidePanel && !clickedNoteWidget) {
        closePanel();
        return;
      }
    }

    const action = t.dataset.action;

    // More/Less toggle (must be OUTSIDE save/delete)
    if (action === "toggle-preview") {
      const wrap = t.closest("." + NOTE_WRAP_CLASS);
      if (!wrap) return;

      const preview = wrap.querySelector(".serp-note-preview");
      if (!preview) return;

      const expanded = preview.dataset.expanded === "1";
      preview.dataset.expanded = expanded ? "" : "1";

      applyPreviewLayout(wrap);
      return;
    }

    // Open note panel
    if (action === "open-note") {
      const wrap = t.closest("." + NOTE_WRAP_CLASS);
      if (!wrap) return;

      const host = wrap.dataset.host || "";
      const urlKey = wrap.dataset.urlKey || "";

      const notesV2 = await storageGetAllNotesV2();
      const picked = pickEffectiveNote(notesV2, urlKey, host);

      const titleText = host ? "Note: " + host : "Note";
      await ensurePanel();
      openPanelAtWrap(wrap, titleText, picked.scope, picked.text);
      return;
    }

    // Close panel
    if (action === "close-note") {
      closePanel();
      return;
    }

    // Panel actions only when visible
    if (!panelEl || panelEl.style.display !== "block") return;

    if (action === "cancel-note") {
      if (!panelActiveWrap) {
        closePanel();
        return;
      }

      const host = panelActiveWrap.dataset.host || "";
      const urlKey = panelActiveWrap.dataset.urlKey || "";

      const notesV2 = await storageGetAllNotesV2();
      const picked = pickEffectiveNote(notesV2, urlKey, host);

      const scope = panelEl.querySelector('[data-role="note-scope"]');
      const ta = panelEl.querySelector('[data-role="note-textarea"]');

      if (scope) scope.value = picked.scope || "url";
      if (ta) ta.value = picked.text || "";

      closePanel();
      return;
    }

    if (action === "save-note" || action === "delete-note") {
      if (!panelActiveWrap) {
        closePanel();
        return;
      }

      const host = panelActiveWrap.dataset.host || "";
      const urlKey = panelActiveWrap.dataset.urlKey || "";

      const scopeEl = panelEl.querySelector('[data-role="note-scope"]');
      const ta = panelEl.querySelector('[data-role="note-textarea"]');

      const scope = scopeEl ? scopeEl.value : "url";
      const text = ta ? (ta.value || "") : "";

      const notesV2 = await storageGetAllNotesV2();

      if (action === "delete-note") {
        if (scope === "site") delete notesV2.bySite[host];
        else delete notesV2.byUrl[urlKey];
      } else {
        if (scope === "site") {
          if (!text.trim()) delete notesV2.bySite[host];
          else notesV2.bySite[host] = text;
        } else {
          if (!text.trim()) delete notesV2.byUrl[urlKey];
          else notesV2.byUrl[urlKey] = text;
        }
      }

      await storageSetAllNotesV2(notesV2);

      const picked = pickEffectiveNote(notesV2, urlKey, host);
      updatePreview(panelActiveWrap, picked.text);

      closePanel();
      return;
    }
  });

  // Close on ESC
  document.addEventListener("keydown", (e) => {
    if (!panelEl) return;
    if (panelEl.style.display !== "block") return;
    if (e.key === "Escape") closePanel();
  });

  // Re-layout previews on window resize
  window.addEventListener("resize", () => {
    const wraps = document.querySelectorAll("." + NOTE_WRAP_CLASS);
    wraps.forEach((w) => applyPreviewLayout(w));
  });

  // ====== OBSERVER + SPA NAV ======
  let observer = null;

  function attachObserver() {
    const target = document.getElementById("search") || document.body;
    if (!target) return;

    if (observer) observer.disconnect();

    let scheduled = false;
    observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        run();
      });
    });

    observer.observe(target, { childList: true, subtree: true });
  }

  function hookHistoryNavigation() {
    const _pushState = history.pushState;
    const _replaceState = history.replaceState;

    const fire = () => {
      run();
      attachObserver();
    };

    history.pushState = function () {
      const ret = _pushState.apply(this, arguments);
      fire();
      return ret;
    };

    history.replaceState = function () {
      const ret = _replaceState.apply(this, arguments);
      fire();
      return ret;
    };

    window.addEventListener("popstate", fire);
  }

  // START
  syncThemeFlag();
  storageGetBadgeColors().then(() => {
    run();
    attachObserver();
    hookHistoryNavigation();
  });

  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) {
      mq.addEventListener("change", () => {
        syncThemeFlag();
        run();
      });
    } else if (mq.addListener) {
      mq.addListener(() => {
        syncThemeFlag();
        run();
      });
    }
  }
})();