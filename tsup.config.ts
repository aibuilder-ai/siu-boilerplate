import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  target: "node18",
  onSuccess: "rsync -a src/templates/ dist/templates/",
});
