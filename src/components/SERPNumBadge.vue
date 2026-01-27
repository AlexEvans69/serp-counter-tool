<template>
  <span class="serp-num-badge">{{ label }}</span>
</template>

<script setup>
const props = defineProps({
  label: String,
});
</script>

<style scoped>
.serp-num-badge {
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
</style>
