import { Conversation } from "@elevenlabs/client";
import { defaultCallerId } from "./caller-id";
import type {
  CallsConfig,
  StartOptions,
  CallStatus,
  CallEvent,
  CallEventCallback,
  CallEventPayload,
} from "./types";

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
    } catch {
      this.setStatus("idle");
      this.emit("error", { message: "Microphone access denied" });
      return;
    }

    // Pre-register the session so chat/client records exist for MCP tools.
    // The response includes client_context which we inject as a dynamic variable
    // since ElevenLabs does not fire the initiation webhook for WebSDK calls.
    let serverDynVars: Record<string, string> = {};
    try {
      const apiUrl = this.config.apiUrl || "https://api.mychatbot.app";
      const res = await fetch(`${apiUrl}/calls/register-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: this.config.agentId,
          caller_id: callerId,
        }),
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
    } catch (err: any) {
      this.setStatus("idle");
      this.conversation = null;
      this.emit("error", {
        message: err?.message || "Failed to start call",
      });
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
