import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  base: "",
  plugins: [
    vue(),
    viteStaticCopy({
      targets: [
        {
          src: "manifest.json",
          dest: ".",
        },
      ],
    }),
  ],
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        contentScript: "src/contentScript.js",
      },
      output: {
        entryFileNames: "[name].js",
        format: "iife",
      },
    },
    emptyOutDir: true,
    sourcemap: false,
  },
  // Optional: needed for CRX js extension or specific plugin
});
