<template>
  <span
    :class="[badgeClass, 'badge-interactive']"
    :style="customStyle"
    @click="handleClick"
  >
    {{ label }}
  </span>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";

const props = defineProps({
  type: String, // "num" or "ads"
  label: String,
  badgeKey: String,
  onRequestColorPicker: Function,
});

const bgColor = ref("#667eea");
const textColor = ref("#ffffff");

const badgeClass = computed(() =>
  props.type === "ads" ? "serp-ads-badge" : "serp-num-badge"
);

const customStyle = computed(() => {
  const style = {
    background: bgColor.value,
    color: textColor.value,
  };

  if (props.type === "ads") {
    style.boxShadow = "0 2px 8px rgba(245, 166, 35, 0.3)";
  } else {
    style.boxShadow = "0 2px 8px rgba(102, 126, 234, 0.3)";
  }

  return style;
});

function handleClick() {
  if (props.type === "ads") return;
  if (typeof props.onRequestColorPicker === "function") {
    props.onRequestColorPicker(props.badgeKey);
  }
}

function applyTheme(theme) {
  const normalized = theme || window.__SERP_BADGE_THEME || {
    bg: "#667eea",
    text: "#ffffff",
  };
  bgColor.value = normalized.bg || "#667eea";
  textColor.value = normalized.text || "#ffffff";
}

function themeListener(theme) {
  applyTheme(theme);
}

onMounted(() => {
  applyTheme(window.__SERP_BADGE_THEME);
  if (window.__SERP_BADGE_THEME_LISTENERS) {
    window.__SERP_BADGE_THEME_LISTENERS.add(themeListener);
  }
});

onBeforeUnmount(() => {
  if (window.__SERP_BADGE_THEME_LISTENERS) {
    window.__SERP_BADGE_THEME_LISTENERS.delete(themeListener);
  }
});
</script>

<style scoped>
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
  font: 700 13px/1 system-ui, -apple-system, 'Segoe UI', 'Roboto', sans-serif;
  z-index: 20;
  user-select: none;
  pointer-events: auto;
  transition: all 0.2s ease;
}

.badge-interactive {
  cursor: pointer !important;
}

.badge-interactive:hover {
  transform: translate(calc(-100% - 12px), -50%) scale(1.05) !important;
}

.serp-ads-badge {
  pointer-events: auto;
  cursor: default !important;
}
</style>
