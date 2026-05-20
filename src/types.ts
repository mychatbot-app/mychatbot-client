export type ConnectionType = "websocket" | "webrtc";

export type CallsConfig = {
  agentId: string;
  /** Connection type. Defaults to "websocket". Use "websocket" for audio visualization support. */
  connectionType?: ConnectionType;
  /** API URL for session registration. Defaults to "https://api.mychatbot.app". */
  apiUrl?: string;
};

/**
 * Per-call overrides forwarded to the underlying ElevenLabs session.
 * Used to switch the agent's first message language, inject a one-off
 * system prompt, override the voice, etc. Mirrors the public override
 * shape of @elevenlabs/client. Each field must also be allow-listed in
 * the agent's "Security → Allowed overrides" settings on ElevenLabs.
 */
export type CallOverrides = {
  agent?: {
    prompt?: { prompt?: string };
    /** Override the greeting verbatim. Usually leave undefined and let
     * the agent's language_presets translation handle it. */
    firstMessage?: string;
    /** ISO 639 language code, e.g. "en", "ru", "uk". Selects the
     * matching language_preset (and its first_message_translation)
     * on the ElevenLabs agent. */
    language?: Language;
  };
  tts?: { voiceId?: string };
  conversation?: { textOnly?: boolean };
};

/**
 * ISO 639 language codes supported by ElevenLabs Conversational AI.
 * Re-exported from @elevenlabs/client so consumers don't need that
 * dependency directly.
 */
export type Language =
  | "en" | "ja" | "zh" | "de" | "hi" | "fr" | "ko" | "pt" | "pt-br"
  | "it" | "es" | "id" | "nl" | "tr" | "pl" | "sv" | "bg" | "ro"
  | "ar" | "cs" | "el" | "fi" | "ms" | "da" | "ta" | "uk" | "ru"
  | "hu" | "hr" | "sk" | "no" | "vi" | "tl";

export type StartOptions = {
  callerId?: string;
  dynamicVariables?: Record<string, string | number | boolean>;
  clientTools?: ClientTools;
  /** Per-call overrides for the ElevenLabs agent (language, voice, etc.). */
  overrides?: CallOverrides;
};

export type CallStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnecting";

export type CallEvent =
  | "connect"
  | "disconnect"
  | "error"
  | "statusChange"
  | "modeChange"
  | "message";

export type CallEventPayload = {
  connect: { conversationId: string };
  disconnect: { reason: string };
  error: {
    /** Human-readable message. Falls back to a generic string when no underlying error is available. */
    message: string;
    /** Original Error.name when the error originated from a thrown Error/DOMException (e.g. "NotAllowedError", "TypeError"). */
    name?: string;
    /** Original thrown value, when available — lets consumers branch on the underlying cause. */
    cause?: unknown;
  };
  statusChange: { status: CallStatus };
  modeChange: { mode: "speaking" | "listening" };
  message: { message: string; role: "user" | "agent" };
};

export type CallEventCallback<E extends CallEvent> = (
  payload: CallEventPayload[E]
) => void;

export type ClientToolParameter = {
  type: "string" | "number" | "boolean";
  description: string;
  required?: boolean;
};

export type ClientToolDefinition = {
  description: string;
  parameters?: Record<string, ClientToolParameter>;
  expects_response?: boolean;
};

export type ClientTools = Record<
  string,
  {
    definition: ClientToolDefinition;
    handler: (params: any) => Promise<any> | any;
  }
>;
