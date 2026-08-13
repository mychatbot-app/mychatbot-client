import { defineConfig } from "tsup";

export default defineConfig([
  {
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
  },
  {
    // The browser bundle: the v1 function surface plus mount(), published to
    // GCS as v2/calls.js. Built HERE so the calls SDK has one home — v1 was
    // built from the widget repo's parallel copy, which is now frozen where a
    // year of browser caches already hold it (the bucket serves
    // max-age=31536000, so an in-place v1 update could never propagate
    // anyway).
    entry: { calls: "src/browser.ts" },
    format: ["iife"],
    globalName: "MyChatBotCalls",
    platform: "browser",
    // Everything inlined — the pasted snippet must be the only request.
    noExternal: [/.*/],
    minify: true,
    // tsup names iife output <entry>.global.js; the published object is
    // calls.js and the snippet URL is the contract.
    outExtension: () => ({ js: ".js" }),
    dts: false,
    sourcemap: false,
  },
]);
