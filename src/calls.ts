import { Conversation } from "@elevenlabs/client";
import { defaultCallerId } from "./caller-id";
import type {
  CallsConfig,
  StartOptions,
  CallStatus,
  CallEvent,
  CallEventCallback,
  CallEventPayload,
  ClientTools,
} from "./types";

/**
 * Normalize anything thrown into the shape of the 'error' event payload.
 * The underlying ElevenLabs client may reject with non-Error values — most
 * notably a raw CloseEvent when the WebSocket fails (offline, server
 * unreachable, etc.) — which would otherwise have no .message or .name and
 * collapse to a useless generic string. Surface code/reason/type instead.
 */
function normalizeError(
  err: unknown,
  fallbackMessage: string
): { message: string; name?: string; cause: unknown } {
  if (err instanceof Error) {
    return {
      message: err.message || fallbackMessage,
      name: err.name,
      cause: err,
    };
  }
  if (typeof CloseEvent !== "undefined" && err instanceof CloseEvent) {
    const reason = err.reason ? `, ${err.reason}` : "";
    return {
      message: `WebSocket closed (code ${err.code}${reason})`,
      name: "CloseEvent",
      cause: err,
    };
  }
  if (typeof Event !== "undefined" && err instanceof Event) {
    return {
      message: `${err.type} event`,
      name: err.constructor?.name || "Event",
      cause: err,
    };
  }
  if (typeof err === "string") {
    return { message: err || fallbackMessage, cause: err };
  }
  if (err && typeof err === "object") {
    const anyErr = err as { message?: unknown; name?: unknown };
    const message =
      typeof anyErr.message === "string" && anyErr.message
        ? anyErr.message
        : fallbackMessage;
    const name = typeof anyErr.name === "string" ? anyErr.name : undefined;
    return { message, name, cause: err };
  }
  return { message: fallbackMessage, cause: err };
}

export class MyChatBotCalls {
  private config: CallsConfig;
  private conversation: Conversation | null = null;
  private currentStatus: CallStatus = "idle";
  private micMuted = false;
  private currentlySpeaking = false;
  private listeners: Map<CallEvent, Set<CallEventCallback<any>>> = new Map();

  constructor(config: CallsConfig) {
    if (!config.agentId) {
      throw new Error("[@mychatbot/client] agentId is required");
    }
    this.config = config;
  }

  get status(): CallStatus {
    return this.currentStatus;
  }

  get muted(): boolean {
    return this.micMuted;
  }

  get isSpeaking(): boolean {
    return this.currentlySpeaking;
  }

  private emit<E extends CallEvent>(
    event: E,
    payload: CallEventPayload[E]
  ): void {
    const cbs = this.listeners.get(event);
    if (cbs) {
      cbs.forEach((cb) => {
        try {
          cb(payload);
        } catch (e) {
          console.error(`[@mychatbot/client] Error in ${event} listener:`, e);
        }
      });
    }
  }

  private setStatus(s: CallStatus): void {
    this.currentStatus = s;
    this.emit("statusChange", { status: s });
  }

  async start(opts?: StartOptions): Promise<void> {
    const callerId = opts?.callerId || defaultCallerId();

    if (
      this.currentStatus === "connected" ||
      this.currentStatus === "connecting"
    ) {
      console.warn("[@mychatbot/client] Already in a call");
      return;
    }

    this.setStatus("connecting");

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err: unknown) {
      this.setStatus("idle");
      this.emit("error", normalizeError(err, "Microphone access denied"));
      return;
    }

    // Build client tool definitions for API registration (strip handlers).
    const clientTools = opts?.clientTools;
    let clientToolDefs: any[] | undefined;
    if (clientTools && Object.keys(clientTools).length > 0) {
      clientToolDefs = Object.entries(clientTools).map(([name, tool]) => ({
        name,
        ...tool.definition,
      }));
    }

    // Pre-register the session so chat/client records exist for MCP tools.
    // Also sends client tool definitions for auto-sync.
    // The response includes client_context which we inject as a dynamic variable
    // since the initiation webhook is not fired for WebSDK calls.
    let serverDynVars: Record<string, string> = {};
    try {
      const apiUrl = this.config.apiUrl || "https://api.mychatbot.app";
      const body: Record<string, any> = {
        agent_id: this.config.agentId,
        caller_id: callerId,
      };
      if (clientToolDefs) {
        body.client_tools = clientToolDefs;
      }
      const res = await fetch(`${apiUrl}/calls/register-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.client_context) {
          serverDynVars.client_context = data.client_context;
        }
      }
    } catch (e) {
      console.warn("[@mychatbot/client] Failed to register session:", e);
      // Non-fatal: the call can still proceed, MCP tools may not work on first call
    }

    // Build clientTools handler map from our ClientTools definitions.
    const elClientTools: Record<string, (params: any) => Promise<any> | any> =
      {};
    if (clientTools) {
      for (const [name, tool] of Object.entries(clientTools)) {
        elClientTools[name] = tool.handler;
      }
    }

    try {
      this.conversation = await Conversation.startSession({
        agentId: this.config.agentId,
        connectionType: this.config.connectionType || "websocket",
        userId: callerId,
        dynamicVariables: {
          user_id: callerId,
          ...serverDynVars,
          ...opts?.dynamicVariables,
        },
        ...(Object.keys(elClientTools).length > 0 && {
          clientTools: elClientTools,
        }),
        onConnect: (props: { conversationId: string }) => {
          this.setStatus("connected");
          this.emit("connect", props);
        },
        onDisconnect: (details: any) => {
          this.setStatus("idle");
          this.currentlySpeaking = false;
          this.conversation = null;
          this.emit("disconnect", {
            reason: details?.reason || "unknown",
          });
        },
        onError: (message: string) => {
          this.emit("error", { message });
        },
        onModeChange: (props: { mode: "speaking" | "listening" }) => {
          this.currentlySpeaking = props.mode === "speaking";
          this.emit("modeChange", props);
        },
        onMessage: (props: { message: string; source: string }) => {
          this.emit("message", {
            message: props.message,
            role: props.source as "user" | "agent",
          });
        },
      });
    } catch (err: unknown) {
      this.setStatus("idle");
      this.conversation = null;
      this.emit("error", normalizeError(err, "Failed to start call"));
    }
  }

  async stop(): Promise<void> {
    if (!this.conversation) return;
    this.setStatus("disconnecting");
    try {
      await this.conversation.endSession();
    } catch {
      // endSession may throw if already disconnected
    }
    this.conversation = null;
    this.currentlySpeaking = false;
    this.setStatus("idle");
  }

  toggleMute(): void {
    if (!this.conversation) return;
    this.micMuted = !this.micMuted;
    this.conversation.setMicMuted(this.micMuted);
  }

  /** Raw output (agent) audio frequency data for visualization. */
  getOutputByteFrequencyData(): Uint8Array | undefined {
    return this.conversation?.getOutputByteFrequencyData();
  }

  /** Raw input (user mic) audio frequency data for visualization. */
  getInputByteFrequencyData(): Uint8Array | undefined {
    return this.conversation?.getInputByteFrequencyData();
  }

  on<E extends CallEvent>(event: E, callback: CallEventCallback<E>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off<E extends CallEvent>(event: E, callback: CallEventCallback<E>): void {
    this.listeners.get(event)?.delete(callback);
  }
}
