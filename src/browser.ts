// The browser bundle's public surface: the v1 function API, backed by this
// repo's class engine, plus mount() — the compact call UI.
//
// Why a function facade over the class: every snippet ever pasted calls
// MyChatBotCalls.init/start/on as module-level functions (the v1 bundle's
// shape). v2 must be a drop-in superset of that surface, or upgrading the
// script URL breaks working sites. The class stays the npm API; this file is
// the browser one, and both drive the same engine.
import { MyChatBotCalls } from "./calls";
import { defaultCallerId } from "./caller-id";
import type {
  CallStatus,
  CallEvent,
  CallEventCallback,
  ClientTools,
} from "./types";

// The v1 wire shape. Every snippet ever pasted calls the browser bundle with
// snake_case — init({ agent_id }), start({ caller_id, client_tools }) — while
// this repo's engine speaks camelCase. THIS FILE is that translation, and it
// is the compatibility contract: renaming these fields breaks working sites.
export type BrowserCallsConfig = {
  agent_id: string;
  api_url?: string;
};

export type BrowserStartOptions = {
  caller_id: string;
  dynamic_variables?: Record<string, string | number | boolean>;
  client_tools?: ClientTools;
};

let engine: MyChatBotCalls | null = null;
let muted = false;
// Listeners registered before init() are queued and attached to the engine
// the moment it exists — mount() wires its UI before the visitor has picked
// an agent to call, and dropping those registrations silently would strand
// the UI in "connecting" forever.
const pending: Array<[CallEvent, CallEventCallback<any>]> = [];

export function init(cfg: BrowserCallsConfig): void {
  if (!cfg || !cfg.agent_id) {
    throw new Error("[MyChatbotCalls] agent_id is required");
  }
  engine = new MyChatBotCalls({ agentId: cfg.agent_id, apiUrl: cfg.api_url });
  muted = false;
  for (const [event, cb] of pending) {
    engine.on(event, cb);
  }
}

export async function start(opts: BrowserStartOptions): Promise<void> {
  if (!engine) {
    throw new Error("[MyChatbotCalls] Call init() first");
  }
  await engine.start({
    callerId: opts.caller_id,
    dynamicVariables: opts.dynamic_variables,
    clientTools: opts.client_tools,
  });
}

export async function stop(): Promise<void> {
  await engine?.stop();
}

export function toggleMute(): void {
  engine?.toggleMute();
  muted = !muted;
}

export function isMuted(): boolean {
  return muted;
}

export function getStatus(): CallStatus {
  return engine ? engine.status : "idle";
}

export function on<E extends CallEvent>(event: E, cb: CallEventCallback<E>): void {
  pending.push([event, cb]);
  engine?.on(event, cb);
}

export function off<E extends CallEvent>(event: E, cb: CallEventCallback<E>): void {
  const i = pending.findIndex(([e, c]) => e === event && c === cb);
  if (i >= 0) pending.splice(i, 1);
  engine?.off(event, cb);
}

export { defaultCallerId };
export { mount } from "./ui";
export type { MountOptions } from "./ui";
