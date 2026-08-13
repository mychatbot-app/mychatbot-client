import { readFile } from "node:fs/promises";
import { defineConfig } from "tsup";

// The UI's CSS lives in a template literal, so minification leaves its
// comments untouched and they ship — verbatim — to every page that embeds us.
// That was 1.5KB of design rationale on customers' sites, including a note
// quoting the owner by date. The comments are worth keeping in SOURCE (a
// 150-line CSS string without section markers is unreadable), so they are
// removed here instead, from that one constant. test/browser-embed.mjs fails
// if any comment survives into the bundle.
const stripCSSComments = {
  name: "strip-css-comments",
  setup(build: { onLoad: (o: { filter: RegExp }, cb: (a: { path: string }) => Promise<{ contents: string; loader: "ts" }>) => void }) {
    build.onLoad({ filter: /src[\\/]ui\.ts$/ }, async ({ path }) => {
      const src = await readFile(path, "utf8");
      const marker = "const CSS = `";
      const open = src.indexOf(marker);
      if (open < 0) return { contents: src, loader: "ts" as const };
      const from = open + marker.length;
      const to = src.indexOf("`;", from);
      const css = src
        .slice(from, to)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^[ \t]*\n/gm, "");
      return { contents: src.slice(0, from) + css + src.slice(to), loader: "ts" as const };
    });
  },
};

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
    esbuildPlugins: [stripCSSComments],
  },
]);
