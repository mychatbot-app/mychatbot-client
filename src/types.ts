export type ConnectionType = "websocket" | "webrtc";

export type CallsConfig = {
  agentId: string;
  /** Connection type. Defaults to "websocket". Use "websocket" for audio visualization support. */
  connectionType?: ConnectionType;
  /** API URL for session registration. Defaults to "https://api.mychatbot.app". */
  apiUrl?: string;
};

export type StartOptions = {
  callerId?: string;
  dynamicVariables?: Record<string, string | number | boolean>;
  clientTools?: ClientTools;
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
  error: { message: string };
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
