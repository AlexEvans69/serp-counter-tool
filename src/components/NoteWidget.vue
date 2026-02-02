<template>
  <div class="note-wrap">
    <button class="serp-note-btn" @click="handleOpenPanel">Note</button>
    <div v-if="text" class="note-preview-wrapper">
      <div
        ref="previewEl"
        class="note-preview"
        :class="{ expanded: isExpanded }"
        :style="previewStyle"
        @click="handlePreviewClick"
      >
        <div class="note-preview-inner" :style="previewBodyStyle">
          <div class="note-preview-text">{{ text }}</div>
        </div>
        <div v-if="showExpandBtn" class="note-preview-footer">
          <button class="note-toggle-btn" @click.stop="toggleExpand">
            <ChevronDown
              :size="12"
              :style="{
                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease',
              }"
            />
            <span>{{isExpanded ? "Show Less" : "Show More"}}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, onMounted, onUnmounted, nextTick, computed, watch } from "vue";
import ChevronDown from "./ChevronDown.vue";

const props = defineProps({
  text: String,
  onOpenPanel: Function,
  onLayoutChange: Function,
  maxPreviewHeight: {
    type: Number,
    default: 100,
  },
});

const isExpanded = ref(false);
const showExpandBtn = ref(false);
const previewEl = ref(null);
const maxWidth = ref(400);
const VISIBLE_LINE_HEIGHT = 13 * 1.35;
const VISIBLE_LINE_PADDING = 16;
const EXTRA_VISIBLE = 6;
const MIN_VISIBLE_LINES = 3;
const MIN_PREVIEW_LIMIT = Math.round(
  VISIBLE_LINE_HEIGHT * MIN_VISIBLE_LINES + VISIBLE_LINE_PADDING + EXTRA_VISIBLE
);
const previewLimit = ref(
  Math.max(40, props.maxPreviewHeight || 100, MIN_PREVIEW_LIMIT)
);
const computedMaxHeight = computed(() =>
  isExpanded.value ? "none" : `${previewLimit.value}px`
);

const badgeBg = ref(getBadgeTheme().bg);
const badgeFg = ref(getBadgeTheme().text);
const previewStyle = computed(() => ({
  maxWidth: `${maxWidth.value}px`,
  background: badgeBg.value,
  color: badgeFg.value,
}));
const previewBodyStyle = computed(() => ({
  maxHeight: computedMaxHeight.value,
  overflow: isExpanded.value ? "visible" : "hidden",
}));

function getBadgeTheme() {
  return window.__SERP_BADGE_THEME || { bg: "#667eea", text: "#ffffff" };
}

function applyBadgeTheme(theme) {
  const normalized = { bg: "#667eea", text: "#ffffff", ...(theme || {}) };
  badgeBg.value = normalized.bg;
  badgeFg.value = normalized.text;
}

function badgeThemeListener(theme) {
  applyBadgeTheme(theme);
}

function calculateMaxWidth() {
  if (!previewEl.value) return;

  const rect = previewEl.value.getBoundingClientRect();
  const rightEdge = rect.right;
  const windowWidth = window.innerWidth;

  const availableWidth = windowWidth - rightEdge + rect.width - 80;
  maxWidth.value = Math.max(200, Math.min(600, availableWidth));
}

function checkExpandButton() {
  if (!previewEl.value || !props.text) {
    showExpandBtn.value = false;
    isExpanded.value = false;
    return;
  }

  const textEl = previewEl.value.querySelector(".note-preview-text");
  const hasOverflow = textEl?.scrollHeight > previewLimit.value + 1;

  if (!hasOverflow) {
    isExpanded.value = false;
  }

  showExpandBtn.value = hasOverflow || isExpanded.value;
}

function handleOpenPanel() {
  if (typeof props.onOpenPanel === "function") {
    props.onOpenPanel();
  }
}

function handlePreviewClick() {
  if (typeof props.onOpenPanel === "function") {
    props.onOpenPanel();
  }
}

function toggleExpand() {
  isExpanded.value = !isExpanded.value;
  notifyLayoutChange();
}

function refreshPreviewState() {
  calculateMaxWidth();
  checkExpandButton();
  notifyLayoutChange();
}

function notifyLayoutChange() {
  if (typeof props.onLayoutChange === "function") {
    props.onLayoutChange();
  }
}

watch(
  () => props.text,
  () => {
    isExpanded.value = false;
    nextTick(() => {
      refreshPreviewState();
    });
  }
);

watch(
  () => props.maxPreviewHeight,
  (value) => {
    previewLimit.value = Math.max(40, value || 100, MIN_PREVIEW_LIMIT);
    if (isExpanded.value) return;
    nextTick(() => {
      checkExpandButton();
    });
  }
);

onMounted(() => {
  nextTick(() => {
    refreshPreviewState();
  });

  window.addEventListener("resize", calculateMaxWidth);
  if (!window.__SERP_BADGE_THEME_LISTENERS)
    window.__SERP_BADGE_THEME_LISTENERS = new Set();
  window.__SERP_BADGE_THEME_LISTENERS.add(badgeThemeListener);
  applyBadgeTheme(window.__SERP_BADGE_THEME);
});

onUnmounted(() => {
  window.removeEventListener("resize", calculateMaxWidth);
  if (window.__SERP_BADGE_THEME_LISTENERS) {
    window.__SERP_BADGE_THEME_LISTENERS.delete(badgeThemeListener);
  }
});
</script>

<style>
.serp-note-btn {
  cursor: pointer;
}
.note-preview {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: flex-start;
  background: var(--serp-badge-bg, var(--serp-note-card-bg));
  color: var(--serp-badge-fg, var(--serp-note-fg));
  border-radius: 8px;
  font: 600 13px/1.35 Space Grotesk, system-ui, -apple-system, Segoe UI, Roboto,
    Arial, sans-serif;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  max-width: none;
  gap: 6px;
  box-sizing: border-box;
  transition: box-shadow 0.24s ease;
  box-shadow: 0 16px 32px rgba(0, 0, 0, 0.45);
  position: relative;
  padding: 0;
  cursor: pointer;
}
.note-preview-inner {
  width: 100%;
  overflow: hidden;
  transition: max-height 0.24s ease;
}
.note-preview-text {
  width: 100%;
  word-break: break-word;
  white-space: pre-wrap;
  padding: 8px;
}
.note-preview-footer {
  width: 100%;
  display: flex;
  justify-content: center;
  margin-top: 4px;
  min-height: 24px;
}
.note-toggle-btn {
  width: auto;
  font: inherit;
  background: rgba(255, 255, 255, 0.08);
  border: none;
  color: inherit;
  border-radius: 8px;
  padding: 4px 10px;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s ease, transform 0.2s ease;
  display: flex;
  align-items: center;
  gap: 4px;
}
.note-toggle-btn:hover,
.note-toggle-btn:focus-visible {
  background: rgba(255, 255, 255, 0.16);
  transform: translateY(-1px);
}
</style>
