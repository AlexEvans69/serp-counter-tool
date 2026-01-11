<template>
  <div class="note-wrap">
    <button class="serp-note-btn" @click="$emit('open-panel')">Note</button>
    <div class="serp-note-preview" v-if="text">
      {{ text.length > 120 ? text.slice(0, 120) + '...' : text }}
      <button v-if="text && text.length > 120" @click="$emit('toggle-expand')">More</button>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  text: String
});
</script>

<style scoped>
.note-wrap {
  display: inline-flex;
  align-items: flex-start;
  gap: 6px;
}
.serp-note-btn {
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 5px 10px;
  background: #f1f1f7;
  font-weight: bold;
  cursor: pointer;
}
.serp-note-preview {
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 5px 10px;
  background: #f9f9fa;
  min-width: 60px;
  font-size: 11px;
}
</style>

