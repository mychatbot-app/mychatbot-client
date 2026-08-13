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
    <span class="mcb-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
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

// Liquid-glass, iteration 2. The first glass pass kept a WHITE pill with
// gray circle buttons and a static dot, and the owner's verdict was "still
// looks bad" — it read as debug UI. This pass borrows the Dynamic Island
// grammar: the in-call control is a DARK glass capsule in both themes (dark
// is what makes it self-contained and premium over any page), the state dot
// is a live five-bar waveform (a static dot says nothing; bars say VOICE),
// and the orb gets a real specular highlight plus a slow invitation pulse.
//
// Media-query variables, NOT light-dark(): Safari <17.5 and several in-app
// webviews drop every declaration using it. backdrop-filter carries an
// @supports fallback to near-opaque surfaces.
const CSS = `
  #${ROOT_ID} {
    --c:#6C47FF; --c-soft:#8B6BFF; --c-deep:#4F2BD8; --c-glow:#A78BFF;
    --ok:#34D399; --warn:#FBBF24;
    --panel:rgba(255,255,255,.6); --panel-solid:rgba(255,255,255,.97);
    --panel-edge:rgba(255,255,255,.6); --panel-ink:#191925; --panel-mut:#5F5C72;
    /* Speaker chips get their own colours because they are the one place the
       accent sits ON the panel rather than beside it. --c is tuned for white
       surfaces, so reusing it left "Nibir Assistant" as mid-purple text on a
       dark sheet — legible in the mock, not on a phone at arm's length. */
    --chip-bg:rgba(120,120,128,.16); --chip-ink:var(--panel-mut);
    --chip-bot-bg:rgba(108,71,255,.18); --chip-bot-ink:var(--c);
    --err-ink:#B3261E; --err-glass:rgba(253,236,236,.78);
    position:fixed; right:20px; bottom:20px; z-index:2147483000;
    display:flex; flex-direction:column; align-items:flex-end; gap:10px;
    font:400 13px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
  }
  #${ROOT_ID}.mcb-left { right:auto; left:20px; align-items:flex-start; }
  #${ROOT_ID}.mcb-inline { position:static; align-items:flex-start; }
  @media (prefers-color-scheme: dark) {
    #${ROOT_ID} {
      --panel:rgba(30,28,42,.6); --panel-solid:rgba(30,28,42,.97);
      --panel-edge:rgba(255,255,255,.12); --panel-ink:#EFEDF8; --panel-mut:#A5A2BC;
      /* Both chips carry NAMES — who is speaking — so they are read, not
         glanced at, and they sit at 10.5px semi-bold. On the dark sheet the
         light-surface values fell to roughly 3:1 and 2.4:1; these land near
         11:1 and 7:1, and the tints lift a little so the pill still reads as
         a pill (owner, 2026-08-13: "hard to read on the dark background"). */
      --chip-bg:rgba(255,255,255,.14); --chip-ink:#DCD9EC;
      --chip-bot-bg:rgba(139,107,255,.28); --chip-bot-ink:#C9B8FF;
      --err-ink:#F2B8B5; --err-glass:rgba(58,32,34,.66);
    }
  }
  #${ROOT_ID} * { box-sizing:border-box; }
  /* The author display rules below beat the UA's [hidden]{display:none}, so
     without this line the pill is visible from mount — caught by the first
     screenshot ever taken of the component, not by reading the code. */
  #${ROOT_ID} [hidden] { display:none !important; }

  /* ---- The orb ----------------------------------------------------------- */
  #${ROOT_ID} .mcb-fab { position:relative; width:58px; height:58px; border-radius:50%; border:0;
    cursor:pointer; display:flex; align-items:center; justify-content:center; color:#fff;
    background:radial-gradient(135% 135% at 32% 16%, var(--c-soft) 0%, var(--c) 50%, var(--c-deep) 100%);
    box-shadow:0 16px 34px rgba(93,58,255,.45), 0 4px 10px rgba(93,58,255,.3),
      inset 0 1.5px 1px rgba(255,255,255,.5), inset 0 -4px 10px rgba(28,8,105,.4);
    transition:transform .18s cubic-bezier(.2,.9,.3,1.4), box-shadow .18s, filter .18s; }
  /* Specular: a soft white blob at the light source, the thing that makes a
     sphere read as glossy rather than tinted. */
  #${ROOT_ID} .mcb-fab::before { content:""; position:absolute; left:10px; top:6px;
    width:24px; height:16px; border-radius:50%;
    background:radial-gradient(closest-side, rgba(255,255,255,.75), rgba(255,255,255,0));
    filter:blur(1px); pointer-events:none; }
  /* A slow ring every few seconds: the invitation. Removed for reduced-motion. */
  #${ROOT_ID} .mcb-fab::after { content:""; position:absolute; inset:0; border-radius:50%;
    box-shadow:0 0 0 0 rgba(139,107,255,.55); animation:mcb-invite 3.6s ease-out infinite;
    pointer-events:none; }
  @keyframes mcb-invite {
    0% { box-shadow:0 0 0 0 rgba(139,107,255,.5); opacity:1 }
    45% { box-shadow:0 0 0 14px rgba(139,107,255,0); opacity:0 }
    100% { box-shadow:0 0 0 0 rgba(139,107,255,0); opacity:0 }
  }
  #${ROOT_ID} .mcb-fab:hover { transform:translateY(-2px) scale(1.05); filter:saturate(1.1); }
  #${ROOT_ID} .mcb-fab:active { transform:scale(.96); }
  #${ROOT_ID} .mcb-fab:focus-visible { outline:3px solid rgba(139,107,255,.55); outline-offset:3px; }
  #${ROOT_ID} .mcb-fab svg { width:26px; height:26px; position:relative;
    filter:drop-shadow(0 1px 2px rgba(28,8,105,.45)); }
  #${ROOT_ID}[data-phase="connecting"] .mcb-fab { animation:mcb-breathe 1.1s ease-in-out infinite; }
  @keyframes mcb-breathe { 0%,100% { transform:scale(1) } 50% { transform:scale(1.07) } }

  /* ---- The island: dark glass capsule, both themes ------------------------ */
  #${ROOT_ID} .mcb-pill { display:flex; align-items:center; gap:10px; height:48px;
    padding:0 8px 0 16px; border-radius:999px; max-width:min(320px, calc(100vw - 40px));
    color:#F4F2FC; background:rgba(16,14,26,.96);
    border:1px solid rgba(255,255,255,.10);
    box-shadow:0 20px 44px rgba(10,6,40,.5), 0 3px 10px rgba(10,6,40,.35),
      inset 0 1px 0 rgba(255,255,255,.12);
    transform-origin:100% 100%; animation:mcb-pop .34s cubic-bezier(.2,.9,.3,1.25) both; }
  @keyframes mcb-pop { from { opacity:0; transform:scale(.6) translateY(10px) } to { opacity:1; transform:none } }
  @supports (backdrop-filter: blur(4px)) or (-webkit-backdrop-filter: blur(4px)) {
    #${ROOT_ID} .mcb-pill { background:rgba(16,14,26,.72);
      -webkit-backdrop-filter:blur(26px) saturate(1.7); backdrop-filter:blur(26px) saturate(1.7); }
  }
  #${ROOT_ID} .mcb-txt { font:600 13px/1 inherit; letter-spacing:.015em; color:#F4F2FC;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

  /* ---- The waveform: five bars that say VOICE ----------------------------- */
  #${ROOT_ID} .mcb-wave { display:flex; align-items:center; gap:2.5px; height:18px; flex:0 0 auto; }
  #${ROOT_ID} .mcb-wave i { display:block; width:3px; height:6px; border-radius:2px;
    background:var(--ok); box-shadow:0 0 8px rgba(52,211,153,.55);
    animation:mcb-breath 2.2s ease-in-out infinite; }
  #${ROOT_ID} .mcb-wave i:nth-child(2) { animation-delay:.18s }
  #${ROOT_ID} .mcb-wave i:nth-child(3) { animation-delay:.36s }
  #${ROOT_ID} .mcb-wave i:nth-child(4) { animation-delay:.54s }
  #${ROOT_ID} .mcb-wave i:nth-child(5) { animation-delay:.72s }
  @keyframes mcb-breath { 0%,100% { height:5px; opacity:.6 } 50% { height:10px; opacity:1 } }
  #${ROOT_ID}[data-mode="speaking"] .mcb-wave i { background:var(--c-glow);
    box-shadow:0 0 10px rgba(139,107,255,.75); animation:mcb-dance .8s ease-in-out infinite; }
  #${ROOT_ID}[data-mode="speaking"] .mcb-wave i:nth-child(2) { animation-delay:.1s }
  #${ROOT_ID}[data-mode="speaking"] .mcb-wave i:nth-child(3) { animation-delay:.2s }
  #${ROOT_ID}[data-mode="speaking"] .mcb-wave i:nth-child(4) { animation-delay:.3s }
  #${ROOT_ID}[data-mode="speaking"] .mcb-wave i:nth-child(5) { animation-delay:.4s }
  @keyframes mcb-dance { 0%,100% { height:5px } 30% { height:16px } 60% { height:8px } }
  #${ROOT_ID}[data-phase="connecting"] .mcb-wave i { background:rgba(244,242,252,.5);
    box-shadow:none; animation:mcb-breath 1.1s ease-in-out infinite; }
  #${ROOT_ID}[data-muted="1"] .mcb-wave i { background:var(--warn);
    box-shadow:0 0 8px rgba(251,191,36,.5); animation:none; height:5px; }

  /* ---- Controls on the island: translucent white fills, no borders -------- */
  #${ROOT_ID} .mcb-ib { width:34px; height:34px; border-radius:50%; border:0;
    background:rgba(255,255,255,.12); color:#F4F2FC; cursor:pointer; padding:0;
    display:flex; align-items:center; justify-content:center; flex:0 0 auto;
    transition:background .15s, transform .12s, box-shadow .15s; }
  #${ROOT_ID} .mcb-ib:hover { background:rgba(255,255,255,.22); transform:translateY(-1px); }
  #${ROOT_ID} .mcb-ib:active { transform:none; }
  #${ROOT_ID} .mcb-ib:focus-visible { outline:2px solid rgba(139,107,255,.7); outline-offset:2px; }
  #${ROOT_ID} .mcb-ib svg { width:16px; height:16px; }
  #${ROOT_ID} .mcb-cc[aria-expanded="true"] { background:rgba(139,107,255,.32); color:#fff;
    box-shadow:0 0 12px rgba(139,107,255,.45), inset 0 1px 0 rgba(255,255,255,.25); }
  #${ROOT_ID} .mcb-mute .ic-off { display:none; }
  #${ROOT_ID}[data-muted="1"] .mcb-mute { background:rgba(251,191,36,.28); color:#FFE9B8;
    box-shadow:0 0 12px rgba(251,191,36,.35); }
  #${ROOT_ID}[data-muted="1"] .mcb-mute .ic-on { display:none; }
  #${ROOT_ID}[data-muted="1"] .mcb-mute .ic-off { display:flex; }
  #${ROOT_ID} .mcb-end { color:#fff;
    background:radial-gradient(135% 135% at 32% 16%, #FF8589 0%, #E5484D 55%, #B92C31 100%);
    box-shadow:0 6px 16px rgba(229,72,77,.45), inset 0 1px 1px rgba(255,255,255,.45), inset 0 -2px 6px rgba(110,15,20,.4); }
  #${ROOT_ID} .mcb-end:hover { filter:brightness(1.08); }

  /* ---- The transcript: light glass sheet above the island ----------------- */
  #${ROOT_ID} .mcb-panel { width:min(320px, calc(100vw - 40px)); max-height:200px; overflow-y:auto;
    border-radius:22px; padding:12px 14px; scrollbar-width:thin;
    color:var(--panel-ink); background:var(--panel-solid); border:1px solid var(--panel-edge);
    box-shadow:0 18px 44px rgba(23,18,60,.22), inset 0 1px 0 rgba(255,255,255,.5);
    animation:mcb-rise .3s cubic-bezier(.2,.9,.3,1.15) both; }
  @keyframes mcb-rise { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:none } }
  @supports (backdrop-filter: blur(4px)) or (-webkit-backdrop-filter: blur(4px)) {
    #${ROOT_ID} .mcb-panel { background:var(--panel);
      -webkit-backdrop-filter:blur(28px) saturate(1.8); backdrop-filter:blur(28px) saturate(1.8); }
  }
  #${ROOT_ID} .mcb-panel:empty::before { content:"The conversation will appear here as you talk…";
    font:400 12px/1.4 inherit; color:var(--panel-mut); }
  #${ROOT_ID} .mcb-line { display:block; }
  #${ROOT_ID} .mcb-line + .mcb-line { margin-top:10px; padding-top:10px;
    border-top:1px solid rgba(127,127,127,.16); }
  #${ROOT_ID} .mcb-chip { display:inline-block; max-width:100%; overflow:hidden; text-overflow:ellipsis;
    white-space:nowrap; vertical-align:middle; font:650 10.5px/1.1 inherit;
    padding:4px 9px; border-radius:999px; margin-bottom:4px;
    background:var(--chip-bg); color:var(--chip-ink); }
  #${ROOT_ID} .mcb-line[data-who="bot"] .mcb-chip { background:var(--chip-bot-bg); color:var(--chip-bot-ink); }
  #${ROOT_ID} .mcb-text { display:block; font:400 13px/1.5 inherit; color:var(--panel-ink); overflow-wrap:break-word; }

  #${ROOT_ID} .mcb-toast { max-width:min(300px, calc(100vw - 40px)); padding:10px 14px;
    border-radius:14px; color:var(--err-ink); font:500 12px/1.4 inherit;
    background:var(--err-glass); border:1px solid rgba(255,255,255,.35);
    box-shadow:0 12px 30px rgba(23,18,60,.2); }
  @supports (backdrop-filter: blur(4px)) or (-webkit-backdrop-filter: blur(4px)) {
    #${ROOT_ID} .mcb-toast { -webkit-backdrop-filter:blur(20px) saturate(1.6); backdrop-filter:blur(20px) saturate(1.6); }
  }
  @media (prefers-reduced-motion: reduce) {
    #${ROOT_ID} *, #${ROOT_ID} *::before, #${ROOT_ID} *::after, #${ROOT_ID} { animation:none!important; transition:none!important }
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
