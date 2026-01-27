<template>
  <div class="serp-note-panel">
    <div class="serp-note-panel-header">
      <div class="serp-note-scope-buttons">
        <button
          class="scope-btn"
          :class="{ active: scope === 'url' }"
          type="button"
          @click="scope = 'url'"
        >
          This URL
        </button>
        <button
          class="scope-btn"
          :class="{ active: scope === 'site' }"
          type="button"
          @click="scope = 'site'"
        >
          This site
        </button>
      </div>
      <button class="serp-note-panel-close" aria-label="Close" @click="close">×</button>
    </div>

      <div class="serp-note-body">
        <textarea v-model="text" class="serp-note-text" placeholder="Start typing..."></textarea>
      </div>

    <div class="serp-note-actions">
      <button class="serp-note-action danger" @click="deleteNote">Delete</button>
      <button class="serp-note-action ghost" @click="cancel">Cancel</button>
      <button class="serp-note-action primary" @click="save">Save</button>
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
  background: #0b0d14;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  box-shadow: 0 24px 40px rgba(0, 0, 0, 0.6);
  width: 420px;
  max-width: 92vw;
  min-width: 320px;
  min-height: 260px;
  padding: 24px;
  color: #f6f8ff;
  display: flex;
  flex-direction: column;
  gap: 18px;
  resize: both;
  overflow: auto;
}
.serp-note-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.serp-note-panel-close {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  padding: 0 16px;
  min-height: 44px;
  font-size: 18px;
  color: #f6f8ff;
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.2s ease;
}
.serp-note-panel-close:hover {
  border-color: rgba(255, 255, 255, 0.4);
  transform: translateY(-1px);
}
.serp-note-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.serp-note-scope-buttons {
  display: flex;
  gap: 10px;
}
.scope-btn {
  flex: 0 0 auto;
  min-width: 130px;
  border-radius: 12px;
  border: none;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
  font-size: 13px;
  white-space: nowrap;
  padding: 8px 12px;
}
.scope-btn.active {
  background: linear-gradient(135deg, #7c3aed 0%, #2563eb 100%);
  color: #fff;
  box-shadow: 0 8px 16px rgba(99, 102, 241, 0.35);
}
.serp-note-text {
  width: 100%;
  border-radius: 14px;
  border: none;
  padding: 10px 14px;
  font-size: 14px;
  background: rgba(255, 255, 255, 0.05);
  color: #f6f8ff;
  box-sizing: border-box;
  min-height: 140px;
  resize: none;
}
.serp-note-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.serp-note-action {
  flex: 1;
  border-radius: 12px;
  font-weight: 600;
  padding: 8px 12px;
  border: none;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  font-size: 13px;
}
.serp-note-action.primary {
  background: linear-gradient(135deg, #7c3aed 0%, #2563eb 100%);
  color: #fff;
  box-shadow: 0 10px 20px rgba(99, 102, 241, 0.35);
}
.serp-note-action.primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 24px rgba(99, 102, 241, 0.4);
}
.serp-note-action.ghost {
  background: rgba(255, 255, 255, 0.08);
  color: #f6f8ff;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18);
}
.serp-note-action.danger {
  background: rgba(248, 113, 113, 0.15);
  color: #f87171;
  box-shadow: inset 0 0 0 1px rgba(248, 113, 113, 0.4);
}
  </style>
