<template>
  <div class="note-wrap">
    <button class="serp-note-btn" @click="handleOpenPanel">Note</button>
    <div v-if="text" class="note-preview-wrapper">
      <div
        ref="previewEl"
        class="note-preview"
        :class="{ expanded: isExpanded }"
      >
        {{ text }}
      </div>
      <button
        v-if="showExpandBtn"
        class="note-expand-btn"
        @click="toggleExpand"
      >
        <span v-if="!isExpanded">▼ More</span>
        <span v-else>▲ Less</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from "vue";

const props = defineProps({
  text: String,
  onOpenPanel: Function,
});

const isExpanded = ref(false);
const showExpandBtn = ref(false);
const previewEl = ref(null);

function handleOpenPanel() {
  if (typeof props.onOpenPanel === "function") {
    props.onOpenPanel();
  }
}

function toggleExpand() {
  isExpanded.value = !isExpanded.value;
}

onMounted(() => {
  nextTick(() => {
    if (previewEl.value && props.text) {
      // Check if content exceeds 3 lines (approximately 60px)
      const fullHeight = previewEl.value.scrollHeight;
      showExpandBtn.value = fullHeight > 60;
    }
  });
});
</script>
