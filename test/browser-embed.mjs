// The browser bundle: the compact voice embed and the boundaries that keep it
// shippable on customers' pages. Source+bundle assertions (this repo's tests
// are type-level; these properties are invisible to the type checker).
//
// Run: node test/browser-embed.mjs   (after npm run build)
import { readFile } from "node:fs/promises";

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(cond ? `  ✓ ${name}` : `  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

const ui = await readFile(new URL("../src/ui.ts", import.meta.url), "utf-8");
const facade = await readFile(new URL("../src/browser.ts", import.meta.url), "utf-8");

// --- the facade: v2 must be a drop-in superset of the v1 surface -------------
for (const fn of ["init", "start", "stop", "on", "off", "toggleMute", "isMuted", "getStatus"]) {
  check(`facade exports ${fn}`, new RegExp(`export (async )?function ${fn}\\b`).test(facade));
}
check("facade re-exports defaultCallerId and mount", /export \{ defaultCallerId \}/.test(facade) && /export \{ mount \}/.test(facade));

// The wire contract is snake_case FOREVER: every pasted v1 snippet calls
// init({ agent_id }) / start({ caller_id }). tsc only catches an
// inconsistent rename — a consistent camelCase refactor would compile
// cleanly and break every working site.
check(
  "the public wire stays snake_case",
  /agent_id: string/.test(facade) && /caller_id: string/.test(facade),
);
check(
  "and the facade translates it to the engine's camelCase",
  /agentId: cfg\.agent_id/.test(facade) && /callerId: opts\.caller_id/.test(facade) && /clientTools: opts\.client_tools/.test(facade),
);

// mount() wires its UI before init() ever runs, so listeners registered
// early must attach to the engine the moment it exists — dropping them
// strands the UI in "connecting" forever.
check("pre-init listeners are queued", /pending\.push\(\[event, cb\]\)/.test(facade));
check("and attached on init", /for \(const \[event, cb\] of pending\)/.test(facade));

// --- the compact UI ----------------------------------------------------------
// The transcript exists but stays behind a toggle: collapsed by default so
// the pill is one line, openable because "where did it say the price?" is a
// question visitors actually have, and removable via config.
check("the transcript is collapsed by default", /transcriptMode === "open"/.test(ui) && /opts\.transcript \|\| "collapsed"/.test(ui));
check("a toggle button controls it", /btnCC\.addEventListener/.test(ui) && /aria-expanded/.test(ui));
check('config "off" removes the toggle entirely', /transcriptMode === "off"\) btnCC\.remove\(\)/.test(ui));
// Transcript content is model+visitor text and must stay inert.
check("transcript text lands via textContent only", /body\.textContent = text/.test(ui) && /chip\.textContent/.test(ui));
check("a new call clears the previous transcript", /panel\.textContent = ""/.test(ui));

// The speaker chips say WHO is talking, at 10.5px semi-bold, on a sheet that
// goes dark with the visitor's OS. They used the light-surface accent (--c)
// and muted ink for both schemes, which left "You" and the agent's name barely
// legible on dark (owner, 2026-08-13). They now take their own variables, and
// the dark block must override BOTH — an override that sets only the tint
// would look fixed in a mock and stay unreadable in the hand.
const darkBlock = ui.slice(ui.indexOf("prefers-color-scheme: dark"), ui.indexOf("box-sizing:border-box"));
check(
  "the chips use their own colour variables, not the light-surface accent",
  /color:var\(--chip-ink\)/.test(ui) && /color:var\(--chip-bot-ink\)/.test(ui) &&
    !/\.mcb-chip \{[^}]*color:var\(--panel-mut\)/.test(ui),
);
check("dark mode re-inks the visitor chip", /--chip-ink:#[0-9A-Fa-f]{6}/.test(darkBlock), darkBlock.slice(0, 80));
check("dark mode re-inks the agent chip", /--chip-bot-ink:#[0-9A-Fa-f]{6}/.test(darkBlock));

// The one innerHTML assigns a compile-time constant; config lands via
// textContent/attributes, so no config value can become markup.
const innerHTMLUses = [...ui.matchAll(/\.innerHTML\s*=\s*([A-Za-z_]+)/g)].map((m) => m[1]);
check(
  `innerHTML only ever assigns the skeleton constant (${innerHTMLUses.join(", ") || "none"})`,
  innerHTMLUses.length === 1 && innerHTMLUses[0] === "SKELETON",
  innerHTMLUses.join(", "),
);
check("the agent name lands as attributes, never markup", /setAttribute\("aria-label", `Talk to \$\{name\}`\)/.test(ui));

// The author display rules beat the UA's [hidden]{display:none}, so without
// an explicit override the pill is visible from mount, reading "Connecting"
// under the idle bubble. Found by the first SCREENSHOT of the component —
// invisible to every source-level assertion here.
check("the stylesheet forces [hidden] to actually hide", /\[hidden\] \{ display:none !important/.test(ui));

// No telemetry in the SDK. Funnel beacons ride the onCallStart/onCallEnd
// callbacks; an SDK that phones home from customer pages would be spyware.
const uiCode = ui.split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
check("no beacon in SDK code", !/mcbEvent|demo_call_start|demo_call_end/.test(uiCode));
check("no demo showcase tool in SDK code", !/scroll_to_section/.test(uiCode));

// The hangup-before-stop ordering is load-bearing: the End button reports
// BEFORE stop(), because disconnect returns early on user hangups. Reporting
// only from disconnect loses the most common way a call ends.
const endHandler = ui.slice(ui.indexOf("btnEnd.addEventListener"), ui.indexOf("btnMute.addEventListener"));
check(
  "the End button reports the call end before stopping the session",
  endHandler.indexOf('reportCallEnd("hangup")') >= 0 &&
    endHandler.indexOf('reportCallEnd("hangup")') < endHandler.indexOf("stop()"),
);
check("a closed tab still reports the duration", /pagehide/.test(ui));

// Unmount unregisters every engine listener — a re-mount otherwise stacks a
// second set that writes to detached DOM and double-fires the callbacks.
check("every engine listener goes through the tracker", !/\n {2}on\(/.test(ui));
check("unmount unregisters them", /offs\.forEach\(\(f\) => f\(\)\)/.test(ui));

// --- the built bundle --------------------------------------------------------
let bundle = "";
try {
  bundle = await readFile(new URL("../dist/calls.js", import.meta.url), "utf-8");
} catch {
  console.log("  (dist/calls.js absent — run npm run build for bundle checks)");
}
if (bundle) {
  // tsup's export map keeps literal property names through minification.
  const m = bundle.match(/\{\s*defaultCallerId:[^}]{0,500}\}/);
  const map = m ? m[0] : "";
  for (const fn of ["init", "start", "stop", "on", "off", "toggleMute", "isMuted", "getStatus", "mount"]) {
    check(`bundle exports ${fn}`, new RegExp(`\\b${fn}:`).test(map), map.slice(0, 200));
  }
  check("bundle inlines its dependencies", !/from\s*["']@elevenlabs/.test(bundle));
  check("bundle carries no beacon", !/mcbEvent/.test(bundle));
}

console.log(failures === 0 ? "\nBROWSER EMBED OK" : `\nBROWSER EMBED FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
