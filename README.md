# @mychatbot/client

Voice calling SDK for [MyChatBot](https://mychatbot.app) agents.

## Install

```bash
npm install @mychatbot/client
```

## Quick Start

```ts
import { MyChatBotCalls, defaultCallerId } from "@mychatbot/client";

const calls = new MyChatBotCalls({ agentId: "your-agent-id" });

calls.on("connect", ({ conversationId }) => {
  console.log("Connected:", conversationId);
});

calls.on("message", ({ message, role }) => {
  console.log(`${role}: ${message}`);
});

calls.on("error", ({ message }) => {
  console.error("Error:", message);
});

// Start a call with a persistent caller ID (stored in localStorage)
await calls.start({ callerId: defaultCallerId() });

// Or with your own caller ID
await calls.start({ callerId: "my-user-123" });
```

## API

### `new MyChatBotCalls(config)`

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `config.agentId` | `string` | Yes | Your MyChatBot Calls agent ID |

### `calls.start(options?)`

Starts a voice call. Requests microphone permission if not already granted.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `options.callerId` | `string` | No | Caller identifier. Defaults to `defaultCallerId()` if omitted |

### `calls.stop()`

Ends the current call.

### `calls.toggleMute()`

Toggles microphone mute state.

### `calls.status`

Returns the current call status: `"idle"` | `"connecting"` | `"connected"` | `"disconnecting"`

### `calls.muted`

Returns `true` if the microphone is muted.

### `calls.on(event, callback)` / `calls.off(event, callback)`

Subscribe to or unsubscribe from events.

| Event | Payload | Description |
|-------|---------|-------------|
| `connect` | `{ conversationId: string }` | Call connected |
| `disconnect` | `{ reason: string }` | Call ended |
| `error` | `{ message: string }` | Error occurred |
| `statusChange` | `{ status: CallStatus }` | Status changed |
| `modeChange` | `{ mode: "speaking" \| "listening" }` | Agent started/stopped speaking |
| `message` | `{ message: string, role: "user" \| "agent" }` | Transcript message |

### `defaultCallerId()`

Returns a persistent caller ID stored in `localStorage`. Generates a new one on first call. Use this to identify returning visitors across page reloads and sessions.

## Vanilla JS

For non-bundled environments, use the standalone script from CDN:

```html
<script src="https://storage.googleapis.com/mychatbot-widget-assets/v1/calls.js"></script>
<script>
  MyChatBotCalls.init({ agent_id: "your-agent-id" });
</script>
<button onclick="MyChatBotCalls.start({ caller_id: MyChatBotCalls.defaultCallerId() })">
  Call
</button>
```

## License

MIT
