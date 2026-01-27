<template>
  <Teleport to="body">
    <div v-if="isOpen" class="color-picker-modal-overlay" @click.self="close">
        <div class="color-picker-modal-panel" @click.stop>

        <div class="modal-body">
          <section class="controls-column">
            <div class="color-picker-group">
              <label>Background Color</label>
              <div class="color-input-row">
                <input
                  v-model="tempBgColor"
                  type="color"
                  class="color-input"
                />
                <input
                  v-model="tempBgColor"
                  type="text"
                  class="color-text"
                  placeholder="#667eea"
                />
              </div>
            </div>

            <div class="color-picker-group">
              <label>Text Color</label>
              <div class="color-input-row">
                <input
                  v-model="tempTextColor"
                  type="color"
                  class="color-input"
                />
                <input
                  v-model="tempTextColor"
                  type="text"
                  class="color-text"
                  placeholder="#ffffff"
                />
              </div>
            </div>

            <div class="color-picker-preview modern">
              <span :style="{ background: tempBgColor, color: tempTextColor }">
                Preview
              </span>
            </div>
          </section>

          <section class="presets-column">
            <div class="presets-grid">
              <button
                v-for="preset in presets"
                :key="preset.label"
                class="preset-card"
                type="button"
                :style="{
                  background: 'linear-gradient(135deg,' + preset.bg + ' 0%,' + preset.text + ' 100%)'
                }"
                @click="selectPreset(preset)"
              >
                <div class="preset-content">
                  <div class="preset-swatch" :style="{ background: preset.bg }"></div>
                  <p class="preset-label">{{ preset.label }}</p>
                </div>
              </button>
            </div>
          </section>
        </div>

          <div class="modal-footer">
            <button @click="apply" class="btn-apply">Apply</button>
            <button @click="reset" class="btn-reset">Reset</button>
            <button @click="close" class="btn-cancel">Close</button>
          </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch } from "vue";

const props = defineProps({
  isOpen: Boolean,
  bgColor: String,
  textColor: String,
  onClose: Function,
  onApply: Function,
});

const tempBgColor = ref(props.bgColor || "#667eea");
const tempTextColor = ref(props.textColor || "#ffffff");
const presets = [
  { label: "Indigo Bloom", bg: "#5a67d8", text: "#f7f8ff" },
  { label: "Lime Glow", bg: "#1db954", text: "#fdfdf4" },
  { label: "Sunset Ember", bg: "#fe5f55", text: "#fff3e0" },
  { label: "Midnight Frost", bg: "#2d3246", text: "#f2f4ff" },
  { label: "Aurora Mist", bg: "#50c6c8", text: "#0c1a1b" },
  { label: "Copper Pulse", bg: "#d97706", text: "#1f1d1b" },
];

function selectPreset(preset) {
  tempBgColor.value = preset.bg;
  tempTextColor.value = preset.text;
}

const close = () => {
  if (typeof props.onClose === "function") {
    props.onClose();
  }
};

const apply = () => {
  if (typeof props.onApply === "function") {
    props.onApply({
      bgColor: tempBgColor.value,
      textColor: tempTextColor.value,
    });
  }
  close();
};

const reset = () => {
  tempBgColor.value = props.bgColor || "#667eea";
  tempTextColor.value = props.textColor || "#ffffff";
};

watch(
  () => props.bgColor,
  (value) => {
    tempBgColor.value = value || "#667eea";
  }
);

watch(
  () => props.textColor,
  (value) => {
    tempTextColor.value = value || "#ffffff";
  }
);

watch(() => props.isOpen, (open) => {
  if (open) {
    tempBgColor.value = props.bgColor || "#667eea";
    tempTextColor.value = props.textColor || "#ffffff";
  }
});
</script>

<style scoped>
.color-picker-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(8, 10, 16, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
  pointer-events: auto;
}

.color-picker-modal-panel {
  background: linear-gradient(160deg, rgba(11, 13, 23, 0.95), rgba(22, 25, 35, 0.98));
  border-radius: 20px;
  box-shadow: 0 25px 60px rgba(4, 4, 8, 0.55);
  min-width: 300px;
  max-width: 720px;
  width: min(92vw, 720px);
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  color: #f6f8ff;
  overflow: hidden;
}

.modal-body {
  padding: 12px 14px 16px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  align-items: flex-start;
}

.controls-column,
.presets-column {
  display: flex;
  flex-direction: column;
  gap: 8px;
  justify-content: flex-start;
}

.controls-column {
  max-width: 260px;
}

.color-picker-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.color-picker-group label {
  font: 600 11px 'Space Grotesk', system-ui, sans-serif;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.7);
}

.color-input-row {
  display: flex;
  gap: 12px;
}

.color-input {
  width: 54px;
  height: 40px;
  border-radius: 14px;
  border: none;
  box-shadow: inset 0 4px 10px rgba(0, 0, 0, 0.35);
  cursor: pointer;
}

.color-text {
  flex: 1;
  padding: 10px 14px;
  border-radius: 14px;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: #f6f8ff;
  font: 600 12px 'Inter', monospace;
  min-height: 40px;
}

.color-picker-preview {
  padding: 8px 12px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.3);
}

.color-picker-preview span {
  padding: 8px 20px;
  border-radius: 999px;
  font: 700 14px 'Space Grotesk', system-ui, sans-serif;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.presets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
}

.preset-card {
  border: none;
  border-radius: 14px;
  padding: 10px;
  min-height: 64px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.preset-card:hover {
  transform: translateY(-4px) scale(1.01);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
}

.preset-content {
  display: flex;
  gap: 12px;
  align-items: center;
}

.preset-swatch {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.4);
}

.preset-label {
  margin: 0;
  font: 600 13px 'Space Grotesk', system-ui, sans-serif;
}

.modal-footer {
  padding: 12px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  gap: 8px;
  background: rgba(8, 10, 16, 0.9);
}

button {
  flex: 1;
  padding: 12px 16px;
  border: none;
  border-radius: 14px;
  font: 600 13px 'Inter', system-ui, sans-serif;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.btn-apply {
  background: linear-gradient(135deg, #7c3aed 0%, #2563eb 100%);
  color: #fff;
  box-shadow: 0 12px 26px rgba(99, 102, 241, 0.45);
}

.btn-apply:hover {
  transform: translateY(-2px);
  box-shadow: 0 16px 32px rgba(99, 102, 241, 0.5);
}

.btn-reset {
  background: #f59e0b;
  color: #0f172a;
  box-shadow: 0 10px 26px rgba(245, 158, 11, 0.35);
}

.btn-cancel {
  background: #1f2937;
  color: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}

.btn-reset:hover,
.btn-cancel:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.4);
}
</style>
