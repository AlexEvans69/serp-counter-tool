<template>
  <!-- Panel mounted directly in note-wrap elements -->
</template>

<script setup>
import {
  ref,
  reactive,
  onMounted,
  onUnmounted,
  nextTick,
  watch,
  createApp,
} from "vue";
import NotePanel from "./components/NotePanel.vue";
import SERPBadge from "./components/SERPBadge.vue";
import NoteWidget from "./components/NoteWidget.vue";

// ---- Chrome storage helpers (v2, as in original JS) ----
const STORAGE_KEY = "serp_site_notes_v2";

function storageGetAllNotesV2() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (res) => {
      const v2 =
        res && res[STORAGE_KEY] ? res[STORAGE_KEY] : { byUrl: {}, bySite: {} };
      if (typeof v2.byUrl !== "object") v2.byUrl = {};
      if (typeof v2.bySite !== "object") v2.bySite = {};
      resolve(v2);
    });
  });
}
function storageSetAllNotesV2(obj) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: obj }, () => resolve());
  });
}

function normalizeUrlKey(url) {
  try {
    const u = new URL(url);
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
function extractFinalUrlFromAnchor(a) {
  try {
    const href = a.getAttribute("href") || "";
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

function pickEffectiveNote(notesObj, urlKey, host) {
  if (
    urlKey &&
    notesObj.byUrl &&
    Object.prototype.hasOwnProperty.call(notesObj.byUrl, urlKey)
  ) {
    return { text: notesObj.byUrl[urlKey] || "", scope: "url" };
  }
  if (
    host &&
    notesObj.bySite &&
    Object.prototype.hasOwnProperty.call(notesObj.bySite, host)
  ) {
    return { text: notesObj.bySite[host] || "", scope: "site" };
  }
  return { text: "", scope: "url" };
}

// ---- Panel handling ----
let activePanelApp = null;
let activePanelContainer = null;

async function openPanelFor(
  anchor,
  resultNode,
  widgetEl,
  urlKey,
  host,
  text,
  scope
) {
  console.log("[SERP COUNTER] openPanelFor called");

  // Close existing panel if any
  if (activePanelApp && activePanelContainer) {
    activePanelApp.unmount();
    activePanelContainer.remove();
  }

  // Create panel container and append to body (not to widget)
  const panelContainer = document.createElement("div");
  panelContainer.className = "serp-note-panel-container";

  // Calculate position relative to widget
  const rect = widgetEl.getBoundingClientRect();
  panelContainer.style.position = "fixed";
  panelContainer.style.left = `${rect.left}px`;
  panelContainer.style.top = `${rect.bottom + 8}px`;

  document.body.appendChild(panelContainer);

  // Create and mount panel
  const panelApp = window.__VUE_CREATEAPP(NotePanel, {
    scopeDefault: scope,
    textDefault: text,
    onClose: () => {
      panelApp.unmount();
      panelContainer.remove();
      activePanelApp = null;
      activePanelContainer = null;
    },
    onSaveNote: async ({ scope: noteScope, text: noteText }) => {
      const notesObj = await storageGetAllNotesV2();
      if (noteScope === "site") {
        if (!noteText.trim()) delete notesObj.bySite[host];
        else notesObj.bySite[host] = noteText;
      } else {
        if (!noteText.trim()) delete notesObj.byUrl[urlKey];
        else notesObj.byUrl[urlKey] = noteText;
      }
      await storageSetAllNotesV2(notesObj);
      panelApp.unmount();
      panelContainer.remove();
      activePanelApp = null;
      activePanelContainer = null;
      injectAllFeatures(true);
    },
    onDeleteNote: async ({ scope: noteScope }) => {
      const notesObj = await storageGetAllNotesV2();
      if (noteScope === "site") delete notesObj.bySite[host];
      else delete notesObj.byUrl[urlKey];
      await storageSetAllNotesV2(notesObj);
      panelApp.unmount();
      panelContainer.remove();
      activePanelApp = null;
      activePanelContainer = null;
      injectAllFeatures(true);
    },
  });

  panelApp.mount(panelContainer);
  activePanelApp = panelApp;
  activePanelContainer = panelContainer;

  console.log("[SERP COUNTER] Panel mounted to body");
}

// ---- Main inject logic ----
const injectedNodes = new Set();
let lastNotesObj = null;

async function injectAllFeatures(clearMarkers = false) {
  // 1. Fetch note state
  const notesObj = await storageGetAllNotesV2();
  lastNotesObj = notesObj;
  // 2. Find result blocks
  const search = document.getElementById("search");
  console.log(
    "[SERP COUNTER] injectAllFeatures called, search element found:",
    !!search
  );
  if (!search) return;

  // Clear markers if requested (after save/delete)
  if (clearMarkers) {
    const processed = search.querySelectorAll("[data-serp-processed]");
    processed.forEach((el) => {
      el.removeAttribute("data-serp-processed");
      // Remove old injected elements
      el.querySelectorAll(".vue-serp-badge, .vue-serp-note-widget").forEach(
        (injected) => {
          injected.remove();
        }
      );
    });
  }

  let index = getBaseIndexFromUrl();
  const badgeClass = "vue-serp-badge";
  const noteWidgetClass = "vue-serp-note-widget";
  const processedMarker = "data-serp-processed";
  // Number organic results + note widget
  const h3s = Array.from(search.querySelectorAll("h3"));
  console.log("[SERP COUNTER] Found h3 elements:", h3s.length);
  const seen = new Set();
  for (let h3 of h3s) {
    if (!(h3 instanceof HTMLElement)) continue;
    // Ad skip
    if (isInAdsContainer(h3)) continue;
    if (!looksLikeOrganicH3(h3)) continue;
    // Find root result node
    let root = ensureRoot(h3);
    if (!root || seen.has(root)) continue;

    // Skip if already processed
    if (root.hasAttribute(processedMarker)) continue;
    root.setAttribute(processedMarker, "true");

    seen.add(root);
    console.log("[SERP COUNTER] Injecting badge and note for result", index);
    // Add number badge
    const badgeEl = document.createElement("div");
    badgeEl.className = badgeClass;
    root.insertBefore(badgeEl, root.firstChild);
    const badgeApp = window.__VUE_CREATEAPP(SERPBadge, {
      type: "num",
      label: String(index),
    });
    badgeApp.mount(badgeEl);
    injectedNodes.add(badgeEl);
    // Add note widget
    const a = h3.closest("a[href]");
    const finalUrl = a ? extractFinalUrlFromAnchor(a) : null;
    const urlKey = finalUrl ? normalizeUrlKey(finalUrl) : null;
    const host = finalUrl ? hostFromUrl(finalUrl) : null;
    const picked = finalUrl
      ? pickEffectiveNote(notesObj, urlKey, host)
      : { text: "", scope: "url" };
    const noteEl = document.createElement("div");
    noteEl.className = noteWidgetClass;
    root.appendChild(noteEl);
    const noteApp = window.__VUE_CREATEAPP(NoteWidget, {
      text: picked.text,
      onOpenPanel: () => {
        console.log("[SERP COUNTER] Note panel opened for result", index);
        openPanelFor(a, root, noteEl, urlKey, host, picked.text, picked.scope);
      },
    });
    // Listen for note button click -> open panel at right place
    noteApp._instance && (noteApp._instance.exposed = {});
    noteApp.mount(noteEl);
    injectedNodes.add(noteEl);
    index++;
  }
  // 3. Label ads
  for (const id of ["tads", "tadsb"]) {
    const adContainer = document.getElementById(id);
    if (!adContainer) continue;
    let h3s = adContainer.querySelectorAll("h3");
    for (let h3 of h3s) {
      const root = ensureRoot(h3);
      if (!root) continue;

      // Skip if already processed
      if (root.hasAttribute(processedMarker)) continue;
      root.setAttribute(processedMarker, "true");

      const badgeEl = document.createElement("div");
      badgeEl.className = badgeClass;
      root.insertBefore(badgeEl, root.firstChild);
      const badgeApp = window.__VUE_CREATEAPP(SERPBadge, {
        type: "ads",
        label: "Ads",
      });
      badgeApp.mount(badgeEl);
      injectedNodes.add(badgeEl);
    }
  }
}

function getBaseIndexFromUrl() {
  try {
    const params = new URLSearchParams(location.search);
    const startRaw = params.get("start");
    const start = startRaw ? parseInt(startRaw, 10) : 0;
    return (Number.isFinite(start) ? start : 0) + 1;
  } catch {
    return 1;
  }
}
function isInAdsContainer(node) {
  return !!node.closest("#tads, #tadsb");
}
function looksLikeOrganicH3(h3) {
  const a = h3.closest("a[href]");
  if (!a) return false;
  const search = document.getElementById("search");
  if (!search || !search.contains(h3)) return false;
  const href = a.getAttribute("href") || "";
  const badPrefixes = ["#", "/search?", "/imgres?"];
  for (let prefix of badPrefixes) if (href.startsWith(prefix)) return false;
  return true;
}
function ensureRoot(h3) {
  let node = h3.closest("div[data-hveid], div.MjjYud, div");
  if (!node) return null;
  node.classList.add("serp-result-root");
  return node;
}

// ---- Mutation observer for changes/spa nav ----
let observer = null;
function startDomObserver() {
  const search = document.getElementById("search") || document.body;
  if (!search) return;
  if (observer) observer.disconnect();
  observer = new MutationObserver(() => {
    injectAllFeatures();
  });
  observer.observe(search, { childList: true, subtree: true });
}

// ---- Theme detection ----
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
  const cs = (
    getComputedStyle(document.documentElement).colorScheme || ""
  ).toLowerCase();
  if (cs.includes("dark")) return true;
  if (cs.includes("light")) return false;

  const bodyBg = getComputedStyle(document.body).backgroundColor;
  let rgb = parseRgb(bodyBg);

  if (!rgb || bodyBg === "transparent") {
    const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
    rgb = parseRgb(htmlBg);
  }

  if (rgb) return isDarkColor(rgb);
  return !!(
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function syncThemeFlag() {
  const isDark = detectPageDarkTheme();
  document.documentElement.dataset.serpTheme = isDark ? "dark" : "light";
}

onMounted(() => {
  syncThemeFlag();
  window.__VUE_CREATEAPP = (Component, props = {}) =>
    createApp(Component, props);
  console.log("[SERP COUNTER] App mounted");
  injectAllFeatures();
  startDomObserver();
  // Nav events (SPA update)
  window.addEventListener("popstate", injectAllFeatures);
});
onUnmounted(() => {
  if (observer) observer.disconnect();
  window.removeEventListener("popstate", injectAllFeatures);
});
</script>

<style>
/* Palettes:
   page light -> dark bg, light text
   page dark  -> light bg, dark text
*/

:root[data-serp-theme="light"] {
  --serp-bg: #111;
  --serp-fg: #fff;
  --serp-border: rgba(0, 0, 0, 0.3);
  --serp-muted-bg: #1a1a1a;
  --serp-input-bg: #111;
  --serp-input-fg: #fff;
  --serp-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}

:root[data-serp-theme="dark"] {
  --serp-bg: #fff;
  --serp-fg: #111;
  --serp-border: rgba(0, 0, 0, 0.18);
  --serp-muted-bg: #f3f3f3;
  --serp-input-bg: #fff;
  --serp-input-fg: #111;
  --serp-shadow: 0 10px 30px rgba(0, 0, 0, 0.22);
}

.serp-result-root {
  position: relative !important;
  overflow: visible !important;
}

.serp-num-badge,
.serp-ads-badge {
  position: absolute;
  left: 0;
  top: 8px;
  transform: translateX(calc(-100% - 10px));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 34px;
  height: 22px;
  padding: 0 6px;
  border-radius: 8px;
  border: 1px solid var(--serp-border);
  background: var(--serp-bg);
  color: var(--serp-fg);
  font: 800 12px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  z-index: 20;
  user-select: none;
  pointer-events: none;
}

.vue-serp-note-widget {
  position: absolute;
  right: 0;
  top: 6px;
  transform: translateX(calc(100% + 10px));
  width: auto;
}

.note-wrap {
  position: relative;
  display: inline-flex;
  align-items: flex-start;
  gap: 6px;
  z-index: 100;
  isolation: isolate;
}

.note-preview-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.note-preview {
  border: 1px solid var(--serp-border);
  background: var(--serp-muted-bg);
  color: var(--serp-fg);
  border-radius: 10px;
  padding: 6px 10px;
  font: 600 12px/1.25 system-ui, -apple-system, Segoe UI, Roboto, Arial,
    sans-serif;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  max-width: 200px;
  max-height: 60px;
  overflow: hidden;
  display: block;
  transition: max-height 0.2s ease;
}

.note-preview.expanded {
  max-height: 500px;
}

.note-expand-btn {
  align-self: flex-start;
  background: var(--serp-bg);
  border: 1px solid var(--serp-border);
  color: var(--serp-fg);
  border-radius: 6px;
  padding: 2px 6px;
  font: 600 10px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  cursor: pointer;
  user-select: none;
}

.note-expand-btn:hover {
  opacity: 0.8;
}

.serp-note-panel-container {
  position: fixed;
  z-index: 10000;
}

.serp-note-btn {
  border: 1px solid var(--serp-border);
  background: var(--serp-bg);
  color: var(--serp-fg);
  border-radius: 10px;
  padding: 6px 10px;
  font: 700 12px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  cursor: pointer;
  user-select: none;
}

.serp-note-btn:hover {
  opacity: 0.8;
}
</style>
