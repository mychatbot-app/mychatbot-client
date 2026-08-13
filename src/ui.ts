// The compact voice embed: a mic bubble that becomes a one-line pill in a call.
//
// Deliberately SMALL. The first embeddable UI was a verbatim port of the demo
// page's 430px card — transcript, footnote, the lot — and the owner's verdict
// was immediate: "it's bad and takes too much space". A customer site's voice
// control is furniture, not a feature tour: idle it is a 56px bubble, live it
// is one slim line — state, mute, end — plus a transcript BEHIND A TOGGLE:
// collapsed it costs nothing, open it is a small scrollable panel above the
// pill, because "where did it say the price?" is a question visitors actually
// have. Transcript text is model+visitor content and lands via textContent
// ONLY — it must stay inert.
//
// Two things stay OUT by design, enforced by test:
//   * telemetry — funnel beacons ride the onCallStart/onCallEnd callbacks; an
//     SDK that phones home from customers' pages would be spyware;
//   * demo showcase tools — the demo page registers its own client_tools.
import { init, start, stop, toggleMute, on, off, defaultCallerId } from "./browser";
import type { ClientTools, CallEvent, CallEventCallback } from "./types";

export type MountOptions = {
  agent_id: string;
  /** Agent name — used for accessible labels and the idle tooltip. */
  name?: string;
  api_url?: string;
  /** Accent color (any CSS color). Default: MyChatBot purple. */
  color?: string;
  /** Corner for the floating control. Default: bottom-right. */
  position?: "bottom-right" | "bottom-left";
  /** Render inline inside this element/selector instead of floating. */
  target?: string | Element;
  /**
   * The live transcript. "collapsed" (default) shows a toggle button on the
   * pill; "open" starts expanded; "off" removes the toggle entirely.
   */
  transcript?: "collapsed" | "open" | "off";
  /** Page functions the agent may call mid-conversation. */
  client_tools?: ClientTools;
  /** Fired once per call, when the conversation actually connects. */
  onCallStart?: () => void;
  /**
   * Fired once per call end: how it ended and the connected seconds.
   * reason: "hangup" (visitor pressed end) | "remote" (agent/network/tab).
   */
  onCallEnd?: (info: { reason: "hangup" | "remote"; seconds: number }) => void;
};

const ROOT_ID = "mcb-call";

// Static skeleton — ZERO interpolation, so no config value can become markup.
// Variable text lands via textContent/attributes after parsing.
const SKELETON = `
  <div class="mcb-toast" data-el="toast" role="alert" hidden></div>
  <button class="mcb-fab" type="button" data-el="fab">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>
    </svg>
  </button>
  <div class="mcb-panel" data-el="panel" hidden></div>
  <div class="mcb-pill" data-el="pill" hidden>
    <span class="mcb-dot" aria-hidden="true"></span>
    <span class="mcb-txt" data-el="state">Connecting</span>
    <button class="mcb-ib mcb-cc" type="button" data-el="cc" title="Show transcript" aria-label="Show transcript" aria-expanded="false">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    </button>
    <button class="mcb-ib mcb-mute" type="button" data-el="mute" title="Mute" aria-label="Mute microphone">
      <svg class="ic-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>
      </svg>
      <svg class="ic-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="4" y1="3" x2="20" y2="21"/>
      </svg>
    </button>
    <button class="mcb-ib mcb-end" type="button" data-el="end" title="End call" aria-label="End call">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" stroke="none" d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.7l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.68-1.36-2.66-1.85-.33-.16-.56-.51-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" transform="translate(0 0.58)"/>
      </svg>
    </button>
  </div>`;

// Liquid-glass styling: translucent blurred surfaces with hairline light
// edges and inner highlights (the iOS material grammar), with the MyChatBot
// purple as the one saturated element. The first pass used flat white cards
// and 1px gray borders and read as generic; the owner's brief was explicit:
// half-transparent, 3D, and never a solid border on active states — active
// states are tinted fills and glows instead.
//
// Media-query variables, NOT light-dark(): Safari <17.5 and several in-app
// webviews drop every declaration using it — learned on the signup pages.
// backdrop-filter carries an @supports fallback to near-opaque surfaces for
// the same class of webviews.
const CSS = `
  #${ROOT_ID} {
    --c:#6C47FF; --c-soft:#8B6BFF; --c-deep:#5230E0;
    --ink:#191925; --mut:#5F5C72;
    --glass:rgba(255,255,255,.55); --glass-solid:rgba(255,255,255,.97);
    --edge:rgba(255,255,255,.55); --hilite:rgba(255,255,255,.55);
    --fill:rgba(120,120,128,.14); --fill-hover:rgba(120,120,128,.24);
    --ok:#1F9D62; --warn:#B26A00;
    --err-ink:#B3261E; --err-glass:rgba(253,236,236,.72);
    --shadow:0 18px 44px rgba(23,18,60,.20), 0 2px 10px rgba(23,18,60,.10);
    position:fixed; right:20px; bottom:20px; z-index:2147483000;
    display:flex; flex-direction:column; align-items:flex-end; gap:10px;
    font:400 13px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
    color:var(--ink);
  }
  #${ROOT_ID}.mcb-left { right:auto; left:20px; align-items:flex-start; }
  #${ROOT_ID}.mcb-inline { position:static; align-items:flex-start; }
  @media (prefers-color-scheme: dark) {
    #${ROOT_ID} {
      --ink:#EFEDF8; --mut:#A5A2BC;
      --glass:rgba(32,30,44,.55); --glass-solid:rgba(32,30,44,.97);
      --edge:rgba(255,255,255,.12); --hilite:rgba(255,255,255,.10);
      --fill:rgba(255,255,255,.10); --fill-hover:rgba(255,255,255,.18);
      --ok:#3ECF8E; --warn:#F0A64B;
      --err-ink:#F2B8B5; --err-glass:rgba(58,32,34,.62);
      --shadow:0 18px 44px rgba(0,0,0,.55), 0 2px 10px rgba(0,0,0,.35);
    }
  }
  #${ROOT_ID} * { box-sizing:border-box; }
  /* The author display rules below beat the UA's [hidden]{display:none}, so
     without this line the pill is visible from mount — caught by the first
     screenshot ever taken of the component, not by reading the code. */
  #${ROOT_ID} [hidden] { display:none !important; }

  /* The one saturated element: a 3D brand orb. Radial off-center light plus
     an inner top highlight and inner bottom shade make the sphere; the
     colored glow sits it above the page. */
  #${ROOT_ID} .mcb-fab { width:56px; height:56px; border-radius:50%; border:0; cursor:pointer;
    display:flex; align-items:center; justify-content:center; color:#fff;
    background:radial-gradient(130% 130% at 30% 18%, var(--c-soft) 0%, var(--c) 52%, var(--c-deep) 100%);
    box-shadow:0 14px 30px rgba(93,58,255,.42), 0 3px 8px rgba(93,58,255,.28),
      inset 0 1.5px 1px rgba(255,255,255,.45), inset 0 -3px 8px rgba(30,10,110,.35);
    transition:transform .18s cubic-bezier(.2,.9,.3,1.4), box-shadow .18s, filter .18s; }
  #${ROOT_ID} .mcb-fab:hover { transform:translateY(-2px) scale(1.045); filter:saturate(1.08);
    box-shadow:0 18px 40px rgba(93,58,255,.5), 0 4px 10px rgba(93,58,255,.3),
      inset 0 1.5px 1px rgba(255,255,255,.5), inset 0 -3px 8px rgba(30,10,110,.35); }
  #${ROOT_ID} .mcb-fab:active { transform:scale(.97); }
  #${ROOT_ID} .mcb-fab:focus-visible { outline:3px solid rgba(139,107,255,.55); outline-offset:3px; }
  #${ROOT_ID} .mcb-fab svg { width:24px; height:24px; filter:drop-shadow(0 1px 1px rgba(30,10,110,.35)); }
  #${ROOT_ID}[data-phase="connecting"] .mcb-fab { animation:mcb-breathe 1.1s ease-in-out infinite; }
  @keyframes mcb-breathe { 0%,100% { transform:scale(1) } 50% { transform:scale(1.07) } }

  /* Glass material: blur + saturate behind a translucent surface, a light
     hairline edge, and an inner top highlight. Shared by pill, panel, toast. */
  #${ROOT_ID} .mcb-pill, #${ROOT_ID} .mcb-panel, #${ROOT_ID} .mcb-toast {
    background:var(--glass-solid); border:1px solid var(--edge);
    box-shadow:var(--shadow), inset 0 1px 0 var(--hilite); }
  @supports (backdrop-filter: blur(4px)) or (-webkit-backdrop-filter: blur(4px)) {
    #${ROOT_ID} .mcb-pill, #${ROOT_ID} .mcb-panel, #${ROOT_ID} .mcb-toast {
      background:var(--glass);
      -webkit-backdrop-filter:blur(28px) saturate(1.8); backdrop-filter:blur(28px) saturate(1.8); }
  }

  #${ROOT_ID} .mcb-pill { display:flex; align-items:center; gap:9px; height:44px;
    padding:0 7px 0 14px; border-radius:999px; max-width:min(300px, calc(100vw - 40px)); }
  #${ROOT_ID} .mcb-dot { width:8px; height:8px; border-radius:50%; background:var(--ok); flex:0 0 auto;
    box-shadow:0 0 10px currentColor; color:var(--ok); }
  #${ROOT_ID}[data-mode="speaking"] .mcb-dot { background:var(--c); color:var(--c); animation:mcb-blink .9s ease-in-out infinite; }
  #${ROOT_ID}[data-phase="connecting"] .mcb-dot { background:var(--mut); color:var(--mut); animation:mcb-blink 1s ease-in-out infinite; }
  #${ROOT_ID}[data-muted="1"] .mcb-dot { background:var(--warn); color:var(--warn); animation:none; }
  @keyframes mcb-blink { 0%,100% { opacity:.35 } 50% { opacity:1 } }
  #${ROOT_ID} .mcb-txt { font:600 12.5px/1 inherit; letter-spacing:.02em; color:var(--ink);
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

  /* Controls: borderless translucent fills, iOS-style. Active states are
     tinted fills and glows — NEVER a border. */
  #${ROOT_ID} .mcb-ib { width:32px; height:32px; border-radius:50%; border:0;
    background:var(--fill); color:var(--ink); cursor:pointer; padding:0;
    display:flex; align-items:center; justify-content:center; flex:0 0 auto;
    transition:background .15s, transform .12s, box-shadow .15s; }
  #${ROOT_ID} .mcb-ib:hover { background:var(--fill-hover); transform:translateY(-1px); }
  #${ROOT_ID} .mcb-ib:active { transform:none; }
  #${ROOT_ID} .mcb-ib:focus-visible { outline:2px solid rgba(139,107,255,.55); outline-offset:2px; }
  #${ROOT_ID} .mcb-ib svg { width:15px; height:15px; }
  #${ROOT_ID} .mcb-cc[aria-expanded="true"] { background:rgba(108,71,255,.16); color:var(--c);
    box-shadow:0 0 0 4px rgba(108,71,255,.10); }
  #${ROOT_ID} .mcb-mute .ic-off { display:none; }
  #${ROOT_ID}[data-muted="1"] .mcb-mute { background:rgba(240,166,75,.18); color:var(--warn);
    box-shadow:0 0 0 4px rgba(240,166,75,.10); }
  #${ROOT_ID}[data-muted="1"] .mcb-mute .ic-on { display:none; }
  #${ROOT_ID}[data-muted="1"] .mcb-mute .ic-off { display:flex; }
  #${ROOT_ID} .mcb-end { color:#fff;
    background:radial-gradient(130% 130% at 30% 18%, #FF7A7E 0%, #E5484D 58%, #C2373C 100%);
    box-shadow:0 6px 14px rgba(229,72,77,.38), inset 0 1px 1px rgba(255,255,255,.4), inset 0 -2px 5px rgba(120,20,25,.35); }
  #${ROOT_ID} .mcb-end:hover { background:radial-gradient(130% 130% at 30% 18%, #FF8A8D 0%, #E5484D 52%, #B32F34 100%); }

  #${ROOT_ID} .mcb-panel { width:min(320px, calc(100vw - 40px)); max-height:190px; overflow-y:auto;
    border-radius:20px; padding:11px 13px; scrollbar-width:thin; }
  #${ROOT_ID} .mcb-panel:empty::before { content:"The conversation will appear here as you talk…";
    font:400 12px/1.4 inherit; color:var(--mut); }
  #${ROOT_ID} .mcb-line { display:block; }
  #${ROOT_ID} .mcb-line + .mcb-line { margin-top:9px; padding-top:9px;
    border-top:1px solid rgba(127,127,127,.14); }
  #${ROOT_ID} .mcb-chip { display:inline-block; max-width:100%; overflow:hidden; text-overflow:ellipsis;
    white-space:nowrap; vertical-align:middle; font:650 10.5px/1.1 inherit;
    padding:3.5px 9px; border-radius:999px; margin-bottom:4px;
    background:var(--fill); color:var(--mut); }
  #${ROOT_ID} .mcb-line[data-who="bot"] .mcb-chip { background:rgba(108,71,255,.16); color:var(--c); }
  #${ROOT_ID} .mcb-text { display:block; font:400 12.5px/1.45 inherit; color:var(--ink); overflow-wrap:break-word; }

  #${ROOT_ID} .mcb-toast { max-width:min(300px, calc(100vw - 40px)); padding:9px 13px;
    border-radius:14px; color:var(--err-ink); font:500 12px/1.4 inherit; }
  #${ROOT_ID} .mcb-toast { background:var(--err-glass); }
  @supports (backdrop-filter: blur(4px)) or (-webkit-backdrop-filter: blur(4px)) {
    #${ROOT_ID} .mcb-toast { -webkit-backdrop-filter:blur(20px) saturate(1.6); backdrop-filter:blur(20px) saturate(1.6); }
  }
  @media (prefers-reduced-motion: reduce) {
    #${ROOT_ID} *, #${ROOT_ID} { animation:none!important; transition:none!important }
  }`;

/**
 * Mounts the compact voice control and wires it to the call engine.
 * Returns an unmount function.
 */
export function mount(opts: MountOptions): () => void {
  if (!opts || !opts.agent_id) {
    throw new Error("[MyChatbotCalls] mount: agent_id is required");
  }
  const name = (opts.name || "our assistant").trim() || "our assistant";

  // Re-mount replaces the previous instance: config changed, not stacked.
  document.getElementById(ROOT_ID)?.remove();
  document.getElementById(ROOT_ID + "-style")?.remove();

  const style = document.createElement("style");
  style.id = ROOT_ID + "-style";
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.setAttribute("data-phase", "idle");
  root.setAttribute("data-mode", "listening");
  root.setAttribute("data-muted", "0");
  // The one innerHTML: a compile-time constant. This component renders no
  // model output at all — there is no transcript — so nothing dynamic ever
  // needs to become markup.
  root.innerHTML = SKELETON;

  if (opts.color) root.style.setProperty("--c", opts.color);

  let host: Element = document.body;
  if (opts.target) {
    const t = typeof opts.target === "string" ? document.querySelector(opts.target) : opts.target;
    if (t) {
      host = t;
      root.classList.add("mcb-inline");
    }
  } else if (opts.position === "bottom-left") {
    root.classList.add("mcb-left");
  }
  host.appendChild(root);

  const el = (k: string) => root.querySelector(`[data-el="${k}"]`) as HTMLElement;
  const fab = el("fab") as HTMLButtonElement;
  const pill = el("pill");
  const toast = el("toast");
  const elState = el("state");
  const btnMute = el("mute") as HTMLButtonElement;
  const btnEnd = el("end") as HTMLButtonElement;
  const btnCC = el("cc") as HTMLButtonElement;
  const panel = el("panel");

  // The transcript: collapsed by default — the pill stays one line until the
  // visitor asks for it — openable from config, or absent entirely.
  const transcriptMode = opts.transcript || "collapsed";
  let transcriptOpen = transcriptMode === "open";
  if (transcriptMode === "off") btnCC.remove();
  const syncPanel = (inCall: boolean) => {
    panel.hidden = !(inCall && transcriptOpen);
    if (transcriptMode !== "off") {
      btnCC.setAttribute("aria-expanded", transcriptOpen ? "true" : "false");
      btnCC.title = transcriptOpen ? "Hide transcript" : "Show transcript";
      btnCC.setAttribute("aria-label", btnCC.title);
    }
  };
  // One line per turn, newest last, capped — enough to re-read the exchange,
  // small enough to stay a panel. All text lands via textContent: this is
  // model+visitor content and must stay inert.
  function addLine(who: "user" | "bot", text: string) {
    const line = document.createElement("div");
    line.className = "mcb-line";
    line.setAttribute("data-who", who);
    const chip = document.createElement("span");
    chip.className = "mcb-chip";
    chip.textContent = who === "user" ? "You" : name;
    const body = document.createElement("span");
    body.className = "mcb-text";
    body.textContent = text;
    line.appendChild(chip);
    line.appendChild(body);
    panel.appendChild(line);
    while (panel.children.length > 12) panel.removeChild(panel.firstChild!);
    panel.scrollTop = panel.scrollHeight;
  }

  fab.title = `Talk to ${name}`;
  fab.setAttribute("aria-label", `Talk to ${name}`);

  let ended = false;
  // Call-end reporting has its OWN flag: "ended" drives the UI transition and
  // the End button sets it BEFORE stop(), so the disconnect handler returns
  // early on every user hangup. Reporting only from disconnect would lose the
  // most common way a call ends.
  let callStartedAt = 0;
  let endReported = false;
  function reportCallEnd(reason: "hangup" | "remote") {
    if (endReported || !callStartedAt) return;
    endReported = true;
    const seconds = Math.max(0, Math.round((Date.now() - callStartedAt) / 1000));
    callStartedAt = 0;
    try {
      opts.onCallEnd?.({ reason, seconds });
    } catch {
      /* a listener must never break the call UI */
    }
  }

  const phase = (p: "idle" | "connecting" | "live") => {
    root.setAttribute("data-phase", p);
    const inCall = p !== "idle";
    pill.hidden = !inCall;
    fab.hidden = inCall;
    syncPanel(inCall);
  };
  const say = (s: string) => {
    elState.textContent = s;
  };
  function fail(msg: string) {
    ended = true;
    toast.textContent = msg;
    toast.hidden = false;
    phase("idle");
    fab.disabled = false;
  }

  // Registered through a tracker so unmount unregisters every one — a
  // re-mount otherwise stacks a second set writing to detached DOM.
  const offs: Array<() => void> = [];
  const listen = (event: CallEvent, cb: CallEventCallback<any>) => {
    on(event, cb);
    offs.push(() => off(event, cb));
  };

  listen("connect", () => {
    if (ended) return;
    callStartedAt = Date.now();
    endReported = false;
    try {
      opts.onCallStart?.();
    } catch {
      /* a listener must never break the call UI */
    }
    phase("live");
    root.setAttribute("data-mode", "listening");
    say("Listening");
  });

  listen("modeChange", (e: any) => {
    if (ended) return;
    const speaking = e && e.mode === "speaking";
    root.setAttribute("data-mode", speaking ? "speaking" : "listening");
    say(root.getAttribute("data-muted") === "1" ? (speaking ? "Speaking" : "Muted") : speaking ? "Speaking" : "Listening");
  });

  listen("message", (e: any) => {
    if (!e || !e.message) return;
    addLine(e.role === "user" ? "user" : "bot", e.message);
  });

  // The engine reports a denied microphone HERE, not by throwing from start().
  listen("error", (e: any) => {
    const m = (e && e.message) || "";
    fail(
      /microphone|permission|denied/i.test(m)
        ? "Microphone blocked — allow it in your browser's address bar, then try again."
        : "Couldn't start the call — try again in a moment.",
    );
  });

  listen("disconnect", () => {
    // Remote endings only — a user hangup already reported in the End
    // handler; reportCallEnd is idempotent either way.
    reportCallEnd("remote");
    if (ended) return;
    ended = true;
    phase("idle");
    fab.disabled = false;
  });

  // A closed tab fires neither handler; pagehide still reports the duration.
  const onPageHide = () => reportCallEnd("remote");
  window.addEventListener("pagehide", onPageHide);

  if (transcriptMode !== "off") {
    btnCC.addEventListener("click", () => {
      transcriptOpen = !transcriptOpen;
      syncPanel(root.getAttribute("data-phase") !== "idle");
    });
  }

  fab.addEventListener("click", () => {
    ended = false;
    toast.hidden = true;
    toast.textContent = "";
    panel.textContent = "";
    root.setAttribute("data-muted", "0");
    phase("connecting");
    say("Connecting");
    fab.disabled = true;
    try {
      init({ agent_id: opts.agent_id, api_url: opts.api_url });
      start({
        caller_id: defaultCallerId(),
        client_tools: opts.client_tools,
      }).catch(() => fail("Couldn't start the call — try again in a moment."));
    } catch {
      fail("Couldn't start the call — try again in a moment.");
    }
  });

  btnEnd.addEventListener("click", () => {
    reportCallEnd("hangup");
    ended = true;
    void stop().catch(() => {
      /* stopping a dead session is fine */
    });
    phase("idle");
    fab.disabled = false;
  });

  btnMute.addEventListener("click", () => {
    toggleMute();
    const m = root.getAttribute("data-muted") !== "1";
    root.setAttribute("data-muted", m ? "1" : "0");
    btnMute.setAttribute("aria-label", m ? "Unmute microphone" : "Mute microphone");
    btnMute.title = m ? "Unmute" : "Mute";
    say(m ? "Muted" : "Listening");
  });

  return function unmount() {
    window.removeEventListener("pagehide", onPageHide);
    offs.forEach((f) => f());
    root.remove();
    style.remove();
  };
}
