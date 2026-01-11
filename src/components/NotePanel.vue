<template>
  <div class="serp-note-panel">
    <div class="serp-note-panel-header">
      <span class="serp-note-panel-title">Note</span>
      <button class="serp-note-panel-close" @click="close">&times;</button>
    </div>
    <select v-model="scope" class="serp-note-scope">
      <option value="url">This URL</option>
      <option value="site">This site</option>
    </select>
    <textarea v-model="text" class="serp-note-text"></textarea>
    <div class="serp-note-actions">
      <button class="serp-note-action danger" @click="deleteNote">
        Delete
      </button>
      <button class="serp-note-action" @click="cancel">Cancel</button>
      <button class="serp-note-action" @click="save">Save</button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from "vue";

const props = defineProps({
  scopeDefault: String,
  textDefault: String,
  onClose: Function,
  onSaveNote: Function,
  onDeleteNote: Function,
});

const scope = ref(props.scopeDefault || "url");
const text = ref(props.textDefault || "");

// Watch prop changes and update local state
watch(
  () => props.scopeDefault,
  (newVal) => {
    scope.value = newVal || "url";
  }
);

watch(
  () => props.textDefault,
  (newVal) => {
    text.value = newVal || "";
  }
);

function close() {
  if (typeof props.onClose === "function") {
    props.onClose();
  }
}
function cancel() {
  close();
}
function save() {
  if (typeof props.onSaveNote === "function") {
    props.onSaveNote({ scope: scope.value, text: text.value });
  }
}
function deleteNote() {
  if (typeof props.onDeleteNote === "function") {
    props.onDeleteNote({ scope: scope.value });
  }
}
</script>

<style>
.serp-note-panel {
  background: var(--serp-bg);
  border: 1px solid var(--serp-border);
  border-radius: 12px;
  box-shadow: var(--serp-shadow);
  width: 380px;
  max-width: 90vw;
  padding: 16px;
  color: var(--serp-fg);
}
.serp-note-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.serp-note-panel-title {
  font-weight: 800;
  font-size: 13px;
}
.serp-note-panel-close {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: var(--serp-fg);
}
.serp-note-scope,
.serp-note-text {
  width: 100%;
  margin-bottom: 10px;
  border-radius: 8px;
  border: 1px solid var(--serp-border);
  padding: 8px;
  font-size: 13px;
  background: var(--serp-input-bg);
  color: var(--serp-input-fg);
}
.serp-note-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
.serp-note-action {
  padding: 7px 14px;
  border-radius: 8px;
  border: 1px solid var(--serp-border);
  font-weight: bold;
  cursor: pointer;
  background: var(--serp-bg);
  color: var(--serp-fg);
}
.serp-note-action:hover {
  opacity: 0.8;
}
.serp-note-action.danger {
  border-color: #c00;
  background: #fee;
  color: #900;
}
</style>
