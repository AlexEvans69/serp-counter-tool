<template>
  <!-- No hover UI - everything is attached inline -->
  <NotePanel
    v-if="panelState.visible"
    :x="panelState.x"
    :y="panelState.y"
    :scopeDefault="panelState.scope"
    :textDefault="panelState.text"
    @close="panelState.visible = false"
    @save-note="onSaveNote"
    @delete-note="onDeleteNote"
  />
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
const panelState = reactive({
  visible: false,
  x: 100,
  y: 100,
  scope: "url",
  text: "",
  urlKey: "",
  host: "",
  sourceNode: null,
});

// ---- Used to track which result/note got clicked ----
// marker on panel-open to allow updating correct preview
let latestNoteWidgetEl = null;

async function openPanelFor(
  anchor,
  resultNode,
  widgetEl,
  urlKey,
  host,
  text,
  scope
) {
  // Find position for panel based on result node
  const rect = (resultNode || widgetEl).getBoundingClientRect();
  let px = window.scrollX + rect.right + 18;
  let py = window.scrollY + rect.top;
  if (px + 420 > window.innerWidth) px = Math.max(20, window.innerWidth - 420);
  if (py + 340 > window.innerHeight)
    py = Math.max(20, window.innerHeight - 340);
  // Set state
  panelState.visible = true;
  panelState.x = px;
  panelState.y = py;
  panelState.text = text;
  panelState.scope = scope;
  panelState.urlKey = urlKey;
  panelState.host = host;
  panelState.sourceNode = resultNode;
  latestNoteWidgetEl = widgetEl;
}

// ---- Main inject logic ----
const injectedNodes = new Set();
let lastNotesObj = null;

async function injectAllFeatures() {
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
    const badgeEl = document.createElement("span");
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
    const noteEl = document.createElement("span");
    noteEl.className = noteWidgetClass;
    root.appendChild(noteEl);
    const noteApp = window.__VUE_CREATEAPP(NoteWidget, { text: picked.text });
    // Listen for note button click -> open panel at right place
    noteApp._instance && (noteApp._instance.exposed = {});
    noteApp.mount(noteEl);
    injectedNodes.add(noteEl);
    // Attach our handler for click
    noteEl.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!finalUrl) return;
      openPanelFor(a, root, noteEl, urlKey, host, picked.text, picked.scope);
    });
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

      const badgeEl = document.createElement("span");
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

// ---- Panel Save/Delete ----
async function onSaveNote({ scope, text }) {
  const urlKey = panelState.urlKey,
    host = panelState.host;
  const notesObj = await storageGetAllNotesV2();
  if (scope === "site") {
    if (!text.trim()) delete notesObj.bySite[host];
    else notesObj.bySite[host] = text;
  } else {
    if (!text.trim()) delete notesObj.byUrl[urlKey];
    else notesObj.byUrl[urlKey] = text;
  }
  await storageSetAllNotesV2(notesObj);
  panelState.visible = false;
  injectAllFeatures();
}
async function onDeleteNote({ scope }) {
  const urlKey = panelState.urlKey,
    host = panelState.host;
  const notesObj = await storageGetAllNotesV2();
  if (scope === "site") delete notesObj.bySite[host];
  else delete notesObj.byUrl[urlKey];
  await storageSetAllNotesV2(notesObj);
  panelState.visible = false;
  injectAllFeatures();
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

onMounted(() => {
  window.__VUE_CREATEAPP = (Component, props = {}) =>
    createApp(Component, props);
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
#app {
  display: none;
}

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

.note-wrap {
  position: absolute;
  right: 0;
  top: 6px;
  transform: translateX(calc(100% + 10px));
  width: auto;
  z-index: 20;
  display: inline-flex;
  align-items: flex-start;
  gap: 6px;
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

.serp-note-preview {
  border: 1px solid var(--serp-border);
  background: var(--serp-muted-bg);
  color: var(--serp-fg);
  border-radius: 10px;
  padding: 6px 10px;
  font: 600 12px/1.25 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  max-width: 200px;
  max-height: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}
</style>
