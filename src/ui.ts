// The compact voice embed: a mic bubble that becomes a one-line pill in a call.
//
// Deliberately SMALL. The first embeddable UI was a verbatim port of the demo
// page's 430px card — transcript, footnote, the lot — and the owner's verdict
// was immediate: "it's bad and takes too much space". A customer site's voice
// control is furniture, not a feature tour: idle it is a 56px bubble, live it
// is one slim line — state, mute, end — and nothing else. No transcript at
// all, which also means this component never renders model output.
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
  <div class="mcb-pill" data-el="pill" hidden>
    <span class="mcb-dot" aria-hidden="true"></span>
    <span class="mcb-txt" data-el="state">Connecting</span>
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

// Media-query variables, NOT light-dark(): Safari <17.5 and several in-app
// webviews drop every declaration using it — learned on the signup pages.
const CSS = `
  #${ROOT_ID} {
    --c:#6C47FF; --card:#FFFFFF; --ink:#191925; --mut:#6B6880; --line:#ECEAF6;
    --ok:#1F9D62; --warn:#B26A00; --err-bg:#FDF0F0; --err-ink:#B3261E; --err-line:#F3C9C9;
    --shadow:0 10px 30px rgba(23,18,60,.22), 0 3px 10px rgba(23,18,60,.10);
    position:fixed; right:20px; bottom:20px; z-index:2147483000;
    display:flex; flex-direction:column; align-items:flex-end; gap:8px;
    font:400 13px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
    color:var(--ink);
  }
  #${ROOT_ID}.mcb-left { right:auto; left:20px; align-items:flex-start; }
  #${ROOT_ID}.mcb-inline { position:static; align-items:flex-start; }
  @media (prefers-color-scheme: dark) {
    #${ROOT_ID} {
      --card:#1F1D29; --ink:#EFEDF8; --mut:#A5A2BC; --line:#37344A;
      --ok:#3ECF8E; --warn:#F0A64B; --err-bg:#3A2022; --err-ink:#F2B8B5; --err-line:#5A3236;
      --shadow:0 10px 30px rgba(0,0,0,.5), 0 3px 10px rgba(0,0,0,.35);
    }
  }
  #${ROOT_ID} * { box-sizing:border-box; }
  /* The author display rules below beat the UA's [hidden]{display:none}, so
     without this line the pill is visible from mount — caught by the first
     screenshot ever taken of the component, not by reading the code. */
  #${ROOT_ID} [hidden] { display:none !important; }
  #${ROOT_ID} .mcb-fab { width:56px; height:56px; border-radius:50%; border:0; cursor:pointer;
    display:flex; align-items:center; justify-content:center; color:#fff;
    background:var(--c); box-shadow:var(--shadow);
    transition:transform .15s, filter .15s; }
  #${ROOT_ID} .mcb-fab:hover { transform:scale(1.06); filter:brightness(1.06); }
  #${ROOT_ID} .mcb-fab:focus-visible { outline:3px solid #C9B8FF; outline-offset:2px; }
  #${ROOT_ID} .mcb-fab svg { width:24px; height:24px; }
  #${ROOT_ID}[data-phase="connecting"] .mcb-fab { animation:mcb-breathe 1.1s ease-in-out infinite; }
  @keyframes mcb-breathe { 0%,100% { transform:scale(1) } 50% { transform:scale(1.08) } }

  #${ROOT_ID} .mcb-pill { display:flex; align-items:center; gap:8px; height:40px;
    padding:0 6px 0 12px; border-radius:999px; background:var(--card);
    border:1px solid var(--line); box-shadow:var(--shadow); max-width:min(300px, calc(100vw - 40px)); }
  #${ROOT_ID} .mcb-dot { width:8px; height:8px; border-radius:50%; background:var(--ok); flex:0 0 auto; }
  #${ROOT_ID}[data-mode="speaking"] .mcb-dot { background:var(--c); animation:mcb-blink .9s ease-in-out infinite; }
  #${ROOT_ID}[data-phase="connecting"] .mcb-dot { background:var(--mut); animation:mcb-blink 1s ease-in-out infinite; }
  #${ROOT_ID}[data-muted="1"] .mcb-dot { background:var(--warn); animation:none; }
  @keyframes mcb-blink { 0%,100% { opacity:.35 } 50% { opacity:1 } }
  #${ROOT_ID} .mcb-txt { font:600 12px/1 inherit; letter-spacing:.02em; color:var(--ink);
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  #${ROOT_ID} .mcb-ib { width:30px; height:30px; border-radius:50%; border:1px solid var(--line);
    background:transparent; color:var(--ink); cursor:pointer; padding:0;
    display:flex; align-items:center; justify-content:center; flex:0 0 auto; }
  #${ROOT_ID} .mcb-ib:hover { background:rgba(127,127,127,.12); }
  #${ROOT_ID} .mcb-ib:focus-visible { outline:2px solid #C9B8FF; outline-offset:1px; }
  #${ROOT_ID} .mcb-ib svg { width:15px; height:15px; }
  #${ROOT_ID} .mcb-mute .ic-off { display:none; }
  #${ROOT_ID}[data-muted="1"] .mcb-mute { border-color:var(--warn); color:var(--warn); }
  #${ROOT_ID}[data-muted="1"] .mcb-mute .ic-on { display:none; }
  #${ROOT_ID}[data-muted="1"] .mcb-mute .ic-off { display:flex; }
  #${ROOT_ID} .mcb-end { border-color:transparent; background:#E5484D; color:#fff; }
  #${ROOT_ID} .mcb-end:hover { background:#CC3B40; }
  #${ROOT_ID} .mcb-toast { max-width:min(300px, calc(100vw - 40px)); padding:8px 12px;
    border-radius:10px; background:var(--err-bg); border:1px solid var(--err-line);
    color:var(--err-ink); font:500 12px/1.4 inherit; box-shadow:var(--shadow); }
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

  fab.addEventListener("click", () => {
    ended = false;
    toast.hidden = true;
    toast.textContent = "";
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
