import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  target: "node18",
  onSuccess: "rm -rf dist/templates && cp -r src/templates dist/templates",
});
