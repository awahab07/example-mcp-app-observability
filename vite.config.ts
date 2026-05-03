/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const input = process.env.INPUT;
const viewRoot = input ? path.resolve(__dirname, path.dirname(input)) : __dirname;
const outDir = process.env.VITE_OUT_DIR
  ? path.resolve(__dirname, process.env.VITE_OUT_DIR)
  : path.resolve(__dirname, "dist/views");
const kibanaPortableServiceMapRoot = path.resolve(
  __dirname,
  "../kibana/x-pack/solutions/observability/plugins/apm/public/components/shared/service_map"
);
const reactRoot = path.resolve(__dirname, "node_modules/react");
const reactDomRoot = path.resolve(__dirname, "node_modules/react-dom");
const xyflowRoot = path.resolve(__dirname, "node_modules/@xyflow/react");

export default defineConfig({
  root: viewRoot,
  plugins: [react(), viteSingleFile()],
  server: {
    fs: {
      allow: [__dirname, kibanaPortableServiceMapRoot],
    },
  },
  resolve: {
    dedupe: ["react", "react-dom", "@xyflow/react"],
    alias: {
      "@shared": path.resolve(__dirname, "src/shared"),
      "@kibana-apm-service-map": path.resolve(
        kibanaPortableServiceMapRoot,
        "portable_service_map.tsx"
      ),
      "@kibana-apm-service-map-state": path.resolve(
        kibanaPortableServiceMapRoot,
        "portable_service_map_state.ts"
      ),
      react: reactRoot,
      "react/jsx-runtime": path.resolve(reactRoot, "jsx-runtime.js"),
      "react/jsx-dev-runtime": path.resolve(reactRoot, "jsx-dev-runtime.js"),
      "react-dom": reactDomRoot,
      "react-dom/client": path.resolve(reactDomRoot, "client.js"),
      "@xyflow/react": xyflowRoot,
    },
  },
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: {
      input: input ? path.resolve(__dirname, input) : undefined,
    },
  },
});
