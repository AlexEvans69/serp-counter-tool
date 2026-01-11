<template>
  <div v-show="visible" class="serp-note-panel" :style="{ left: `${x}px`, top: `${y}px` }">
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
      <button class="serp-note-action danger" @click="deleteNote">Delete</button>
      <button class="serp-note-action" @click="cancel">Cancel</button>
      <button class="serp-note-action" @click="save">Save</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const props = defineProps({
  visible: Boolean,
  x: Number,
  y: Number,
  scopeDefault: String,
  textDefault: String
});

const emit = defineEmits(["close","save-note","delete-note"]);

const scope = ref(props.scopeDefault || 'url');
const text = ref(props.textDefault || '');

function close() { emit('close'); }
function cancel() { close(); }
function save() { emit('save-note', { scope: scope.value, text: text.value }); close(); }
function deleteNote() { emit('delete-note', { scope: scope.value }); close(); }
</script>

<style scoped>
.serp-note-panel {
  position: fixed;
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0,0,0,.18);
  z-index: 3000;
  width: 380px;
  max-width: 90vw;
  max-height: 70vh;
  resize: both;
  overflow: auto;
  padding: 16px;
  left: 40px;
  top: 40px;
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
  background: none; border: none;
  font-size: 20px;
  cursor: pointer;
}
.serp-note-scope, .serp-note-text {
  width: 100%;
  margin-bottom: 10px;
  border-radius: 8px;
  border: 1px solid #aaa;
  padding: 8px;
  font-size: 13px;
}
.serp-note-actions {
  display: flex; gap: 10px; justify-content: flex-end;
}
.serp-note-action {
  padding: 7px 14px; border-radius: 8px; border: 1px solid #aaa;
  font-weight: bold; cursor: pointer;
  background: #f5f5f5;
}
.serp-note-action.danger { border-color: #c00; background: #fee; color: #900; }
</style>
