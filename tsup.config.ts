import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  // Emit dist/index.cjs (not .js) so the package.json "main" and
  // "exports.require" entries resolve. Without this, tsup defaults
  // CJS to .js while package.json points at .cjs, breaking Node CJS
  // consumers with MODULE_NOT_FOUND.
  outExtension: ({ format }) => ({ js: format === "cjs" ? ".cjs" : ".mjs" }),
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
});
