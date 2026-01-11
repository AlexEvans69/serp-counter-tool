import { createApp } from "vue";
import App from "./App.vue";

// Mount Vue app into the SERP DOM
function mountVueApp() {
  if (!document.body) {
    document.addEventListener("DOMContentLoaded", mountVueApp, { once: true });
    return;
  }
  const mountEl = document.createElement("div");
  mountEl.id = "serp-vue-root";
  document.body.appendChild(mountEl);
  createApp(App).mount(mountEl);
  console.log("[SERP COUNTER] Vue app mounted");
}

mountVueApp();
