export type CallsConfig = {
  agentId: string;
};

export type StartOptions = {
  callerId?: string;
  dynamicVariables?: Record<string, string | number | boolean>;
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
