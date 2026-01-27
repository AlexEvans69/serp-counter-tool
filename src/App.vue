<template>
  <ColorPickerModal
    :isOpen="colorPickerState.isOpen"
    :bgColor="colorPickerState.bgColor"
    :textColor="colorPickerState.textColor"
    :onClose="closeColorPicker"
    :onApply="handleColorPickerApply"
  />
</template>

<script setup>
import {
  ref,
  reactive,
  onMounted,
  onUnmounted,
  watch,
  createApp,
} from "vue";
import NotePanel from "./components/NotePanel.vue";
import SERPBadge from "./components/SERPBadge.vue";
import NoteWidget from "./components/NoteWidget.vue";
import ColorPickerModal from "./components/ColorPickerModal.vue";

const isAlreadyLoaded = (() => {
  if (window.__SERP_COUNTER_LOADED) return true;
  window.__SERP_COUNTER_LOADED = true;
  return false;
})();

const INSTANCE_ID = Math.random().toString(36).slice(2, 8);

// NOTE: Using global badge theme stored with notes instead of per-badge colors

const DEBUG = localStorage.getItem("serpCounterDebug") === "1";
function logDebug(...args) {
  if (DEBUG) console.log("[SERP COUNTER][DEBUG]", ...args);
}

// ---- Chrome storage helpers (v2, as in original JS) ----
const STORAGE_KEY = "serp_site_notes_v2";
const DEFAULT_BADGE_THEME = { bg: "#667eea", text: "#ffffff" };

function normalizeSiteEntries(notesObj) {
  if (!notesObj || !notesObj.bySite) return;
  const normalized = {};
  Object.entries(notesObj.bySite).forEach(([host, value]) => {
    const key = normalizeHost(host) || host;
    if (typeof value === "string" && value.trim() !== "") {
      normalized[key] = value;
    }
  });
  notesObj.bySite = normalized;
}

if (!window.__SERP_BADGE_THEME_LISTENERS) window.__SERP_BADGE_THEME_LISTENERS = new Set();
if (!window.__SERP_BADGE_THEME) window.__SERP_BADGE_THEME = { ...DEFAULT_BADGE_THEME };

function storageGetAllNotesV2() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([STORAGE_KEY], (res) => {
        const v2 =
          res && res[STORAGE_KEY] ? res[STORAGE_KEY] : { byUrl: {}, bySite: {} };
        if (typeof v2.byUrl !== "object") v2.byUrl = {};
        if (typeof v2.bySite !== "object") v2.bySite = {};
        if (typeof v2.badgeTheme !== "object" || v2.badgeTheme === null) {
          v2.badgeTheme = { ...DEFAULT_BADGE_THEME };
        }
        normalizeSiteEntries(v2);
        resolve(v2);
      });
    } catch (e) {
      console.log("[SERP COUNTER] Extension context lost, using empty notes");
      resolve({ byUrl: {}, bySite: {}, badgeTheme: { ...DEFAULT_BADGE_THEME } });
    }
  });
}
function storageSetAllNotesV2(obj) {
  return new Promise((resolve) => {
    try {
      normalizeSiteEntries(obj);
      chrome.storage.local.set({ [STORAGE_KEY]: obj }, () => resolve());
    } catch (e) {
      console.log("[SERP COUNTER] Extension context lost, skipping save");
      resolve();
    }
  });
}


function notifyBadgeThemeListeners(theme) {
  const listeners = window.__SERP_BADGE_THEME_LISTENERS;
  if (listeners && typeof listeners.forEach === "function") {
    listeners.forEach((cb) => {
      try {
        cb(theme);
      } catch (e) {
        logDebug("Badge theme listener error", e);
      }
    });
  }
}

function applyBadgeTheme(theme) {
  const normalized = { ...DEFAULT_BADGE_THEME, ...(theme || {}) };
  window.__SERP_BADGE_THEME = normalized;
  document.documentElement.style.setProperty("--serp-badge-bg", normalized.bg);
  document.documentElement.style.setProperty("--serp-badge-fg", normalized.text);
  document.documentElement.style.setProperty("--serp-note-btn-bg", normalized.bg);
  document.documentElement.style.setProperty("--serp-note-btn-fg", normalized.text);
  notifyBadgeThemeListeners(normalized);
}

async function persistBadgeTheme(theme) {
  const notesObj = await storageGetAllNotesV2();
  notesObj.badgeTheme = { ...DEFAULT_BADGE_THEME, ...(theme || {}) };
  await storageSetAllNotesV2(notesObj);
  applyBadgeTheme(notesObj.badgeTheme);
}

const colorPickerState = reactive({
  isOpen: false,
  bgColor: DEFAULT_BADGE_THEME.bg,
  textColor: DEFAULT_BADGE_THEME.text,
});

function openColorPickerFor() {
  const theme = window.__SERP_BADGE_THEME || DEFAULT_BADGE_THEME;
  colorPickerState.bgColor = theme.bg;
  colorPickerState.textColor = theme.text;
  colorPickerState.isOpen = true;
}

function closeColorPicker() {
  colorPickerState.isOpen = false;
}

async function handleColorPickerApply(colors) {
  await persistBadgeTheme({ bg: colors.bgColor, text: colors.textColor });
  closeColorPicker();
}


function normalizeUrlKey(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname + u.search;
  } catch {
    return null;
  }
}

function normalizeHost(host) {
  if (!host) return null;
  const trimmed = host.trim().toLowerCase();
  return trimmed.startsWith("www.") ? trimmed.slice(4) : trimmed;
}

function hostFromUrl(url) {
  try {
    return normalizeHost(new URL(url).hostname);
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

function getSnippetPreviewHeight(resultDiv) {
  if (!resultDiv) return 60;
  const selectors = [".VwiC3b", ".IsZvec", ".aCOpRe"]; // snippet containers used by Google
  for (const selector of selectors) {
    const el = resultDiv.querySelector(selector);
    if (el) {
      const height = el.getBoundingClientRect().height;
      if (height > 0) return height;
    }
  }
  const rect = resultDiv.getBoundingClientRect();
  if (rect && rect.height) return rect.height;
  return 60;
}

// ---- Panel handling ----
let activePanelApp = null;
let activePanelContainer = null;
let activePanelOverlay = null;
let activeOverlayClickHandler = null;

function cleanupActivePanelOverlay() {
  if (activePanelOverlay) {
    if (activeOverlayClickHandler) {
      activePanelOverlay.removeEventListener("click", activeOverlayClickHandler);
    }
    activePanelOverlay.remove();
    activePanelOverlay = null;
    activeOverlayClickHandler = null;
  }
}

function closeActivePanelWithoutSaving() {
  if (activePanelApp && activePanelContainer) {
    activePanelApp.unmount();
    activePanelContainer.remove();
    activePanelApp = null;
    activePanelContainer = null;
  }
  cleanupActivePanelOverlay();
}

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
    activePanelApp = null;
    activePanelContainer = null;
  }
  cleanupActivePanelOverlay();

  // Create panel container and append to body (not to widget)
  const panelContainer = document.createElement("div");
  panelContainer.className = "serp-note-panel-container";

  // Calculate position relative to widget
  const rect = widgetEl.getBoundingClientRect();
  panelContainer.style.position = "fixed";
  panelContainer.style.left = `${rect.left}px`;
  panelContainer.style.top = `${rect.bottom + 8}px`;

  const panelOverlay = document.createElement("div");
  panelOverlay.className = "serp-note-panel-overlay";
  panelOverlay.style.position = "fixed";
  panelOverlay.style.inset = "0";
  panelOverlay.style.zIndex = "10000";
  panelOverlay.style.pointerEvents = "auto";
  panelOverlay.style.overflow = "visible";

  const overlayClickHandler = (event) => {
    if (event.target !== panelOverlay) return;
    const saveButton = panelContainer.querySelector(".serp-note-action.primary");
    if (saveButton) {
      saveButton.click();
    } else {
      // Fallback: close panel without explicit save
      closeActivePanelWithoutSaving();
    }
  };

  panelOverlay.addEventListener("click", overlayClickHandler);
  panelContainer.addEventListener("click", (event) => event.stopPropagation());
  panelOverlay.appendChild(panelContainer);
  document.body.appendChild(panelOverlay);
  activePanelOverlay = panelOverlay;
  activeOverlayClickHandler = overlayClickHandler;

  // Create and mount panel
  const panelApp = window.__VUE_CREATEAPP(NotePanel, {
    scopeDefault: scope,
    textDefault: text,
    onClose: () => {
      panelApp.unmount();
      panelContainer.remove();
      cleanupActivePanelOverlay();
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
      cleanupActivePanelOverlay();
      activePanelApp = null;
      activePanelContainer = null;
      scheduleInject(true);
    },
    onDeleteNote: async ({ scope: noteScope }) => {
      const notesObj = await storageGetAllNotesV2();
      if (noteScope === "site") delete notesObj.bySite[host];
      else delete notesObj.byUrl[urlKey];
      await storageSetAllNotesV2(notesObj);
      panelApp.unmount();
      panelContainer.remove();
      cleanupActivePanelOverlay();
      activePanelApp = null;
      activePanelContainer = null;
      scheduleInject(true);
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

// Single-flight + debounce + observer pause
let injectRunning = false;
let injectQueued = false;
let rafScheduled = false;
let queuedClear = false;
let observer = null;
let lastResultsSignature = "";
let noteHostWrappers = new WeakSet();
const NOTE_MUTATION_GRACE_MS = 600;
let lastNoteLayoutChange = 0;

const now = () => (window.performance?.now?.() ?? Date.now());

function markNoteLayoutChange() {
  lastNoteLayoutChange = now();
}

function hasRecentNoteLayoutChange() {
  if (!lastNoteLayoutChange) return false;
  return now() - lastNoteLayoutChange < NOTE_MUTATION_GRACE_MS;
}

function scheduleInject(clear = false) {
  queuedClear = queuedClear || clear;
  if (rafScheduled) return;
  rafScheduled = true;

  requestAnimationFrame(async () => {
    rafScheduled = false;
    await runInject(queuedClear);
    queuedClear = false;
  });
}

function cleanupDuplicates(resultDiv) {
  // Keep only 1st badge, remove the rest
  const badges = Array.from(resultDiv.querySelectorAll(".vue-serp-badge"));
  let keptBadge = false;
  for (const badge of badges) {
    const foreign = badge.dataset.serpInstance && badge.dataset.serpInstance !== INSTANCE_ID;
    if (foreign) {
      badge.remove();
      continue;
    }
    if (keptBadge) {
      badge.remove();
      continue;
    }
    keptBadge = true;
  }

  // Keep only 1st note widget, remove the rest
  const notes = Array.from(resultDiv.querySelectorAll(".vue-serp-note-widget"));
  let keptNote = false;
  for (const note of notes) {
    const foreign = note.dataset.serpInstance && note.dataset.serpInstance !== INSTANCE_ID;
    if (foreign) {
      note.remove();
      continue;
    }
    if (keptNote) {
      note.remove();
      continue;
    }
    keptNote = true;
  }
}

function dedupeInjectedByUrlKey(search, allowedResultDivs) {
  const badgeSeen = new Set();
  const badges = Array.from(
    search.querySelectorAll(".vue-serp-badge[data-serp-urlkey]")
  );
  for (const badge of badges) {
    const key = badge.dataset.serpUrlkey || "";
    const rd = badge.closest("div[data-hveid]");
    if (allowedResultDivs && rd && !allowedResultDivs.has(rd)) {
      badge.remove();
      continue;
    }
    if (!key) continue;
    if (badgeSeen.has(key)) {
      badge.remove();
      continue;
    }
    badgeSeen.add(key);
  }

  const noteSeen = new Set();
  const notes = Array.from(
    search.querySelectorAll(".vue-serp-note-widget[data-serp-urlkey]")
  );
  for (const note of notes) {
    const key = note.dataset.serpUrlkey || "";
    const rd = note.closest("div[data-hveid]");
    if (allowedResultDivs && rd && !allowedResultDivs.has(rd)) {
      note.remove();
      continue;
    }
    if (!key) continue;
    if (noteSeen.has(key)) {
      note.remove();
      continue;
    }
    noteSeen.add(key);
  }
}

function getResultSignature(search) {
  const titles = Array.from(search.querySelectorAll(".yuRUbf h3"))
    .slice(0, 20)
    .map((h3) => h3.textContent?.trim() || "")
    .join("|");
  const count = search.querySelectorAll("div.MjjYud").length;
  return `${count}:${titles}`;
}

function getHighestInjectedBadgeIndex(search, badgeClass) {
  let maxIndex = 0;
  const badges = Array.from(
    search.querySelectorAll(`.${badgeClass}[data-serp-instance='${INSTANCE_ID}']`)
  );
  for (const badge of badges) {
    const text = badge.textContent?.trim() || "";
    const num = Number(text);
    if (!Number.isNaN(num) && num > maxIndex) {
      maxIndex = num;
    }
  }
  return maxIndex;
}

function hasDuplicateInjected(search) {
  const resultDivs = Array.from(search.querySelectorAll("div[data-hveid]"));
  for (const div of resultDivs) {
    if (div.querySelectorAll(".vue-serp-badge").length > 1) return true;
    if (div.querySelectorAll(".vue-serp-note-widget").length > 1) return true;
  }
  return false;
}

function hardCleanupInjected(search) {
  search
    .querySelectorAll(".vue-serp-badge, .vue-serp-note-widget")
    .forEach((el) => el.remove());
  search
    .querySelectorAll("[data-serp-processed]")
    .forEach((el) => el.removeAttribute("data-serp-processed"));
}

async function runInject(clearMarkers = false) {
  if (injectRunning) {
    injectQueued = true;
    queuedClear = queuedClear || clearMarkers;
    return;
  }

  const searchNode = document.getElementById("search");
  if (!clearMarkers && searchNode) {
    const signature = getResultSignature(searchNode);
    if (signature && signature === lastResultsSignature) {
      logDebug("Skipping inject; results signature unchanged.");
      return;
    }
  }
  injectRunning = true;

  // IMPORTANT: pause observer during inject to prevent it from triggering on our own DOM changes
  if (observer) observer.disconnect();

  try {
    await injectAllFeatures(clearMarkers);
  } finally {
    injectRunning = false;

    // re-enable observer
    startDomObserver();

    // if more inject requests came in, run once more
    if (injectQueued) {
      injectQueued = false;
      scheduleInject(false);
    }
  }
}

async function injectAllFeatures(clearMarkers = false) {
  // Clear injectedNodes tracking - rebuild it fresh
  injectedNodes.clear();
  noteHostWrappers = new WeakSet();
  
  const notesObj = await storageGetAllNotesV2();
  lastNotesObj = notesObj;
  applyBadgeTheme(notesObj.badgeTheme);

  const search = document.getElementById("search");
  console.log("[SERP COUNTER] injectAllFeatures called, search element found:", !!search);
  if (!search) return;

  const previousSignature = lastResultsSignature;
  const currentSignature = getResultSignature(search);
  const signatureMatches = previousSignature && currentSignature && previousSignature === currentSignature;
  lastResultsSignature = currentSignature;

  if (clearMarkers) {
    const processed = search.querySelectorAll("[data-serp-processed]");
    processed.forEach((el) => {
      el.removeAttribute("data-serp-processed");
      el.querySelectorAll(".vue-serp-badge, .vue-serp-note-widget").forEach((injected) => {
        injected.remove();
      });
    });
  }

  if (hasDuplicateInjected(search)) {
    logDebug("Detected duplicate injected elements; running hard cleanup.");
    hardCleanupInjected(search);
  }

  const badgeClass = "vue-serp-badge";
  const noteWidgetClass = "vue-serp-note-widget";
  const processedMarker = "data-serp-processed";

  // 1) Собираем ВСЕ органические результаты на странице (в порядке выдачи)
  const resultWrappers = Array.from(search.querySelectorAll("div.MjjYud"));
  console.log("[SERP COUNTER] Found result wrappers:", resultWrappers.length);
  
  logDebug("Result wrappers classes", resultWrappers.map(w => w.className).slice(0, 5));
  logDebug("Result wrappers structure", resultWrappers.map(w => ({
    classes: w.className,
    h3: w.querySelector("h3")?.textContent?.trim().slice(0, 40),
    dataHveid: !!w.querySelector("div[data-hveid]"),
    children: w.children.length,
  })).slice(0, 3));

  const organicItems = [];
  for (let wrapper of resultWrappers) {
    const resultDiv = wrapper.querySelector("div[data-hveid]");
    if (!resultDiv) {
      logDebug("No resultDiv found in wrapper", {
        classes: wrapper.className,
        h3: wrapper.querySelector("h3")?.textContent?.trim().slice(0,30),
      });
      continue;
    }

    if (isInAdsContainer(resultDiv)) continue;

    const titleContainer = resultDiv.querySelector(".yuRUbf");
    if (!titleContainer) {
      logDebug("No titleContainer (.yuRUbf) in resultDiv");
      continue;
    }

    const h3 = titleContainer.querySelector("h3");
    if (!h3) {
      logDebug("No h3 in titleContainer");
      continue;
    }

    const a = titleContainer.querySelector("a[href]");
    if (!a) {
      logDebug("No anchor in titleContainer");
      continue;
    }

    const href = a.getAttribute("href") || "";
    
    const titleText = h3.textContent?.trim().toLowerCase() || "";
    if (EXCLUDED_MODULE_LABELS.some((label) => titleText.includes(label))) {
      logDebug("Skipping module heading via title text", titleText);
      continue;
    }

    // Use improved organic result validator
    if (!isClassicOrganicResult(wrapper, resultDiv, titleContainer, h3, href)) {
      logDebug("Filtered out non-organic", {
        title: h3.textContent?.trim().slice(0, 30),
      });
      continue;
    }

    const finalUrl = extractFinalUrlFromAnchor(a);
    const urlKey = finalUrl ? normalizeUrlKey(finalUrl) : null;
    const host = finalUrl ? hostFromUrl(finalUrl) : null;

    organicItems.push({ wrapper, resultDiv, a, h3, finalUrl, urlKey, host });
  }

  const uniqueOrganicItems = [];
  const seenUrlKeys = new Set();
  const seenResultDivs = new WeakSet();
  for (const item of organicItems) {
    if (item.urlKey) {
      if (seenUrlKeys.has(item.urlKey)) {
        logDebug("Duplicate urlKey skipped", item.urlKey, item.h3?.textContent?.trim());
        continue;
      }
      seenUrlKeys.add(item.urlKey);
    } else {
      if (seenResultDivs.has(item.resultDiv)) {
        logDebug("Duplicate resultDiv skipped (no urlKey)");
        continue;
      }
      seenResultDivs.add(item.resultDiv);
    }
    uniqueOrganicItems.push(item);
  }

  console.log("[SERP] Organic items collected: total=" + organicItems.length + ", unique=" + uniqueOrganicItems.length);

  // Remove injected elements that belong to non-target resultDivs
  const allowedResultDivs = new WeakSet(
    uniqueOrganicItems.map((item) => item.resultDiv)
  );
  search
    .querySelectorAll(".vue-serp-badge, .vue-serp-note-widget")
    .forEach((el) => {
      const rd = el.closest("div[data-hveid]");
      if (!rd || !allowedResultDivs.has(rd)) {
        el.remove();
      }
    });

  dedupeInjectedByUrlKey(search, allowedResultDivs);

  logDebug(
    "Processed items (DOM order)",
    uniqueOrganicItems.map((it) => ({
      title: it.h3?.textContent?.trim(),
      urlKey: it.urlKey,
      top: Math.round(it.wrapper.getBoundingClientRect().top),
      left: Math.round(it.wrapper.getBoundingClientRect().left),
    }))
  );

  console.log("[SERP COUNTER] Filtered organic items:", uniqueOrganicItems.length);

  const highestBadgeIndex = getHighestInjectedBadgeIndex(search, badgeClass);
  // 2) Умная база нумерации
  const baseFromSmart = await getBaseIndexSmart();
  let base = baseFromSmart;
  if (signatureMatches && highestBadgeIndex > 0) {
    base = Math.max(base, highestBadgeIndex + 1);
  }
  console.log("[SERP COUNTER] Base index:", base);

  // 3) Сохраняем count органиков на текущей странице
  try {
    const sig = getQuerySignature();
    const start = getStartFromUrl();
    await saveOrganicCountForPage(sig, start, uniqueOrganicItems.length);
    console.log("[SERP COUNTER] Saved organic count for page", start, "count:", uniqueOrganicItems.length);
  } catch (e) {
    console.log("[SERP COUNTER] Failed to save organic count:", e);
  }

  // 4) Инжектим/обновляем
  let processedCount = 0;

  for (let i = 0; i < uniqueOrganicItems.length; i++) {
    const { wrapper, resultDiv, a, h3, finalUrl, urlKey, host } = uniqueOrganicItems[i];
    const index = base + i;
    
    // Create stable badge key: use urlKey if available, otherwise use position-based key
    const badgeKey = urlKey || `pos_${index}_${getQuerySignature()}`;

    if (!wrapper.hasAttribute(processedMarker)) {
      wrapper.setAttribute(processedMarker, "true");
      processedCount++;
    }

    // Clean up any duplicate badges/notes from re-entrance
    cleanupDuplicates(wrapper);

    const badgeCount = resultDiv.querySelectorAll("." + badgeClass).length;
    const noteCount = resultDiv.querySelectorAll("." + noteWidgetClass).length;
    if (badgeCount > 1 || noteCount > 1) {
      logDebug("Before inject duplicates", {
        index,
        badgeKey,
        badgeCount,
        noteCount,
        title: h3?.textContent?.trim(),
      });
    }

    const foreignBadge = resultDiv.querySelector(
      `.${badgeClass}[data-serp-instance]:not([data-serp-instance='${INSTANCE_ID}'])`
    );
    const foreignNote = resultDiv.querySelector(
      `.${noteWidgetClass}[data-serp-instance]:not([data-serp-instance='${INSTANCE_ID}'])`
    );
    if (foreignBadge || foreignNote) {
      logDebug("Foreign instance elements detected", {
        index,
        badgeKey,
        foreignBadge: !!foreignBadge,
        foreignNote: !!foreignNote,
      });
    }

    // Check if badge already exists with correct number
    const existingBadge = resultDiv.querySelector("." + badgeClass);
    if (
      existingBadge &&
      existingBadge.textContent === String(index) &&
      existingBadge.dataset.serpInstance === INSTANCE_ID
    ) {
      // Badge already correct, skip
      continue;
    }

    // Remove all existing badges before adding new one
    const allBadges = resultDiv.querySelectorAll("." + badgeClass);
    allBadges.forEach(el => {
      try {
        el.remove();
      } catch (e) {}
    });

    // Add fresh badge
    const badgeEl = document.createElement("div");
    badgeEl.className = badgeClass;
    badgeEl.dataset.serpInstance = INSTANCE_ID;
    badgeEl.dataset.serpBadgeKey = badgeKey;
    if (urlKey) badgeEl.dataset.serpUrlkey = urlKey;
    resultDiv.insertBefore(badgeEl, resultDiv.firstChild);

    const badgeApp = window.__VUE_CREATEAPP(SERPBadge, {
      type: "num",
      label: String(index),
      badgeKey: badgeKey,
      onRequestColorPicker: openColorPickerFor,
    });
    badgeApp.mount(badgeEl);
    injectedNodes.add(badgeEl);
    logDebug("Badge injected", {
      index,
      badgeKey,
      title: h3?.textContent?.trim(),
    });

    // Note widget (only add if not already present)
    let noteEl = resultDiv.querySelector(":scope > ." + noteWidgetClass);
    if (!noteEl) {
      const picked = finalUrl ? pickEffectiveNote(notesObj, urlKey, host) : { text: "", scope: "url" };

      noteEl = document.createElement("div");
      noteEl.className = noteWidgetClass;
      noteEl.dataset.serpInstance = INSTANCE_ID;
      if (urlKey) noteEl.dataset.serpUrlkey = urlKey;
      resultDiv.appendChild(noteEl);

      const noteApp = window.__VUE_CREATEAPP(NoteWidget, {
        text: picked.text,
        maxPreviewHeight: getSnippetPreviewHeight(resultDiv),
        onOpenPanel: () => {
          console.log("[SERP COUNTER] Note panel opened for result", index);
          openPanelFor(a, resultDiv, noteEl, urlKey, host, picked.text, picked.scope);
        },
        onLayoutChange: markNoteLayoutChange,
      });

      noteApp.mount(noteEl);
      injectedNodes.add(noteEl);
      logDebug("Note injected", {
        index,
        urlKey,
        title: h3?.textContent?.trim(),
      });
    }

    noteHostWrappers.add(resultDiv);
  }

  // Final diagnostic: count actual visible badges
  setTimeout(() => {
    const allBadges = search.querySelectorAll("." + badgeClass);
    const badgesByUrlKey = new Map();
    for (const badge of allBadges) {
      const urlKey = badge.dataset.serpUrlkey || "no-key";
      if (!badgesByUrlKey.has(urlKey)) {
        badgesByUrlKey.set(urlKey, []);
      }
      badgesByUrlKey.get(urlKey).push(badge.textContent);
    }
    
    const duplicates = Array.from(badgesByUrlKey.entries()).filter(([_, nums]) => nums.length > 1);
    if (duplicates.length > 0) {
      console.log("[SERP] DUPLICATE BADGES DETECTED:", duplicates);
    }
    console.log("[SERP] Final badge count:", allBadges.length, "unique urlKeys:", badgesByUrlKey.size);
  }, 100);


  console.log("[SERP COUNTER] Total organic results on page:", uniqueOrganicItems.length, "newly processed:", processedCount);
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

// ---- Storage helpers for page stats ----
function getQuerySignature() {
  try {
    const params = new URLSearchParams(location.search);
    const q = params.get("q") || "";
    return q; // Simplified: just the query
  } catch {
    return "";
  }
}

function getStartFromUrl() {
  try {
    const params = new URLSearchParams(location.search);
    return parseInt(params.get("start") || "0", 10);
  } catch {
    return 0;
  }
}

async function saveOrganicCountForPage(sig, start, count) {
  return new Promise((resolve) => {
    const key = `serp_organic_counts_v1`;
    chrome.storage.local.get([key], (res) => {
      const data = res[key] || {};
      const pageKey = `${sig}:${start}`;
      data[pageKey] = count;
      chrome.storage.local.set({ [key]: data }, () => resolve());
    });
  });
}

async function getOrganicCountForPage(sig, start) {
  return new Promise((resolve) => {
    const key = `serp_organic_counts_v1`;
    chrome.storage.local.get([key], (res) => {
      const data = res[key] || {};
      const pageKey = `${sig}:${start}`;
      resolve(data[pageKey] || null);
    });
  });
}

async function getBaseIndexSmart() {
  try {
    const sig = getQuerySignature();
    const start = getStartFromUrl();
    
    // If start=0 (first page), base is always 1
    if (start === 0) return 1;
    
    // Otherwise, we need to sum up organic counts from all previous pages
    let base = 1;
    let currentStart = 0;
    
    // Iterate through pages: 0, 10, 20, 30... until we reach current start
    while (currentStart < start) {
      const count = await getOrganicCountForPage(sig, currentStart);
      if (count === null) {
        // If we don't have count for this page, assume standard 10 results
        base += 10;
      } else {
        base += count;
      }
      currentStart += 10;
    }
    
    return base;
  } catch (e) {
    console.log("[SERP COUNTER] getBaseIndexSmart error:", e);
    // Fallback to old logic if something goes wrong
    const params = new URLSearchParams(location.search);
    const start = parseInt(params.get("start") || "0", 10);
    return start + 1;
  }
}
function isInAdsContainer(node) {
  return !!node.closest("#tads, #tadsb");
}

// Check if this is an excluded SERP module (People also ask, Things to know, Videos, etc.)
const EXCLUDED_MODULE_CLASSES = [
  "VeHlbe", // Q&A block
  "nVcaUb", // Videos
  "hlcw0c", // Related searches
  "Mg1HKc", // Products carousel
  "g-scrolling-carousel",
  "gws-onebox", // One box (things to know, etc)
  "sVlkI", // Entity/panel container
  "xpdopen", // Expandable modules
  "kp-blk",
  "kno-kp",
  "g-blk",
];
const EXCLUDED_MODULE_LABELS = [
  "people also ask",
  "people also search",
  "people also search for",
  "product sites",
  "products",
  "shopping results",
  "more sites",
  "related searches",
];

function nodeTextHasModuleLabel(node) {
  if (!node) return false;
  const text = node.textContent;
  if (!text) return false;
  const normalized = text.trim().toLowerCase();
  return EXCLUDED_MODULE_LABELS.some((label) => normalized.includes(label));
}

function hasModuleLabel(text) {
  if (!text) return false;
  const normalized = text.trim().toLowerCase();
  return EXCLUDED_MODULE_LABELS.some((label) => normalized.includes(label));
}

function elementContainsModuleLabel(root) {
  if (!root) return false;
  const selectors = "h2, h3, span, button, a";
  const candidates = root.querySelectorAll(selectors);
  for (const candidate of candidates) {
    if (nodeTextHasModuleLabel(candidate)) return true;
  }
  return false;
}

function hasExcludedSerpModule(element) {
  if (!element) return false;
  const searchRoot = document.getElementById("search");
  let depth = 0;
  let current = element;
  if (elementContainsModuleLabel(element)) return true;
  while (current && current !== searchRoot && depth < 7) {
    if (current.hasAttribute("data-attrid")) return true;
    const cls = current.className || "";
    if (EXCLUDED_MODULE_CLASSES.some((moduleClass) => cls.includes(moduleClass))) return true;

    const ariaLabel = current.getAttribute?.("aria-label") || "";
    if (hasModuleLabel(ariaLabel)) return true;

    const candidate = current.querySelector("h2, h3, span, button, a");
    if (candidate && hasModuleLabel(candidate.textContent)) return true;

    const prev = current.previousElementSibling;
    const next = current.nextElementSibling;
    if (nodeTextHasModuleLabel(prev) || nodeTextHasModuleLabel(next)) return true;

    current = current.parentElement;
    depth++;
  }

  return false;
}

// Check if this is a classic organic search result (not a module)
function isClassicOrganicResult(wrapper, resultDiv, titleContainer, h3, href) {
  // Must be a standard result structure
  if (!titleContainer || !h3) return false;
  
  // Exclude accordion buttons (People also ask questions)
  if (h3.closest("button[jsaction]")) return false;
  
  // Exclude special modules
  if (hasExcludedSerpModule(resultDiv) || hasExcludedSerpModule(wrapper)) return false;
  
  // Exclude bad prefixes
  if (href.startsWith("#") || href.startsWith("/search?") || href.startsWith("/imgres?")) return false;
  
  // Exclude YouTube videos
  if (href.includes("youtube.com") || href.includes("youtu.be")) return false;
  
  // Exclude Google's own results (except news.google.com which is organic)
  if ((href.startsWith("https://www.google.") || href.startsWith("https://google.")) && !href.includes("news.google.com")) return false;
  
  // Must have a title and link visible
  if (!h3.textContent.trim()) return false;
  
  return true;
}

// ---- Mutation observer for changes/spa nav ----
let injectTimerHandle = null;

function startPeriodicInject() {
  // Disabled: causes infinite loop. Using MutationObserver instead.
  if (injectTimerHandle) clearInterval(injectTimerHandle);
}

function isNodeInsideNoteZone(node) {
  let current = node;
  while (current) {
    if (
      current.nodeType === 1 &&
      (current.matches?.(".vue-serp-note-widget, .vue-serp-badge, .note-wrap, .note-preview-wrapper, .note-preview, .note-expand-btn, .serp-note-panel-container") || noteHostWrappers.has(current))
    ) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

function startDomObserver() {
  const search = document.getElementById("search");
  if (!search) {
    setTimeout(startDomObserver, 100);
    return;
  }

  if (observer) observer.disconnect();

  let scheduled = false;
  observer = new MutationObserver((mutations) => {
    if (hasRecentNoteLayoutChange()) {
      logDebug("Skipping DOM observer trigger while note layout settles.");
      return;
    }
    const hasExternalMutation = mutations.some((mutation) => {
      const added = Array.from(mutation.addedNodes || []);
      const removed = Array.from(mutation.removedNodes || []);
      const allNoteNodes = added.concat(removed).every(isNodeInsideNoteZone);
      return !allNoteNodes;
    });
    if (!hasExternalMutation) return;

    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scheduleInject(false);
    });
  });

  observer.observe(search, { childList: true, subtree: true });
  console.log("[SERP COUNTER] DOM observer started");
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
  if (isAlreadyLoaded) {
    logDebug("Duplicate content script instance detected; skipping init.");
    return;
  }
  syncThemeFlag();
  window.__VUE_CREATEAPP = (Component, props = {}) =>
    createApp(Component, props);
  console.log("[SERP COUNTER] App mounted");
  logDebug("Instance ID", INSTANCE_ID);
  scheduleInject(false);
  startPeriodicInject();
  // Nav events (SPA update)
  window.addEventListener("popstate", () => scheduleInject(false));
});
onUnmounted(() => {
  if (observer) observer.disconnect();
  if (injectTimerHandle) clearInterval(injectTimerHandle);
  window.removeEventListener("popstate", () => scheduleInject(false));
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
  --serp-border: rgba(255, 255, 255, 0.2);
  --serp-muted-bg: #1a1a1a;
  --serp-input-bg: #111;
  --serp-input-fg: #fff;
  --serp-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  --serp-note-bg: #1a1a1a;
  --serp-note-border: rgba(255, 255, 255, 0.15);
  --serp-note-card-bg: rgba(20, 24, 33, 0.95);
  --serp-note-fg: #f7f8ff;
}

:root[data-serp-theme="dark"] {
  --serp-bg: #fff;
  --serp-fg: #111;
  --serp-border: rgba(0, 0, 0, 0.15);
  --serp-muted-bg: #f5f5f5;
  --serp-input-bg: #fff;
  --serp-input-fg: #111;
  --serp-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
  --serp-note-bg: #f5f5f5;
  --serp-note-border: rgba(0, 0, 0, 0.1);
  --serp-note-card-bg: rgba(250, 250, 250, 0.95);
  --serp-note-fg: #0f172a;
}

.serp-result-root {
  position: relative !important;
  overflow: visible !important;
}

.serp-num-badge,
.serp-ads-badge {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translate(calc(-100% - 12px), -50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 38px;
  height: 26px;
  padding: 0 8px;
  border-radius: 12px;
  border: none;
  color: #fff;
  font: 700 13px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  z-index: 20;
  user-select: none;
  pointer-events: auto;
  transition: all 0.2s ease;
}

.serp-num-badge {
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
}

.serp-ads-badge {
  box-shadow: 0 2px 8px rgba(245, 166, 35, 0.3);
}

.vue-serp-note-widget {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translate(calc(100% + 10px), -50%);
  width: auto;
  z-index: 100;
}

.note-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  z-index: 100;
  isolation: isolate;
  pointer-events: auto;
}

.note-preview-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  pointer-events: auto;
}

.note-preview {
  border: 1px solid var(--serp-note-border);
  background: var(--serp-note-card-bg);
  color: var(--serp-note-fg);
  border-radius: 18px;
  padding: 14px 16px;
  font: 600 13px/1.35 Space Grotesk, system-ui, -apple-system, Segoe UI, Roboto,
    Arial, sans-serif;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  max-width: 220px;
  max-height: 64px;
  overflow: hidden;
  display: block;
  transition: max-height 0.24s ease, box-shadow 0.24s ease;
  box-shadow: 0 16px 32px rgba(0, 0, 0, 0.45);
}

.note-preview.expanded {
  max-height: 500px;
}

.note-expand-btn {
  align-self: center;
  background: linear-gradient(135deg, #7c3aed 0%, #2563eb 100%);
  border: none;
  color: #fff;
  border-radius: 14px;
  padding: 6px 14px;
  font: 600 12px/1 Space Grotesk, system-ui, -apple-system, Segoe UI, Roboto,
    Arial, sans-serif;
  cursor: pointer;
  user-select: none;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  pointer-events: auto;
  position: relative;
  z-index: 101;
  box-shadow: 0 10px 26px rgba(99, 102, 241, 0.35);
}

.note-expand-btn:hover {
  transform: translateY(-1px) scale(1.02);
  box-shadow: 0 14px 30px rgba(99, 102, 241, 0.45);
}

.serp-note-panel-container {
  position: fixed;
  z-index: 10000;
}

.serp-note-btn {
  border: none;
  background: var(--serp-note-btn-bg, #667eea);
  color: var(--serp-note-btn-fg, #fff);
  border-radius: 8px;
  padding: 6px 12px;
  font: 600 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s ease;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
  white-space: nowrap;
  pointer-events: auto;
  position: relative;
  z-index: 101;
}

.serp-note-btn:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  transform: translateY(-1px);
}
</style>
