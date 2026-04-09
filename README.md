# @mychatbot/client

Voice calling SDK for [MyChatBot Sales Platform](https://app.mychatbot.app) sales agents. Add a "Talk to Us" voice button to your website in minutes.

## Before You Install — Get Your Agent ID

You'll need a sales agent from the **MyChatBot Sales Platform** (not to be confused with our separate Agents Platform). The fastest way to create one:

1. Go to **[app.mychatbot.app/quick-start](https://app.mychatbot.app/quick-start)** — this is the Sales Platform's onboarding wizard
2. Sign up / log in (if you land on the Agents Platform by mistake, head back to `app.mychatbot.app`)
3. Click **"Create a voice agent for my website"**
4. Enter your website URL (and optional product feed URL)
5. The Platform Wizard reads your site, creates a tailored sales agent, and returns your **agent ID** plus a ready-to-paste snippet

The wizard does everything in one step — reads your business, writes instructions, sets up the voice sales agent, and creates a WebSDK Calls channel. You'll get back an agent ID that looks like `agent_xxxxxxxxxxxxxxxxxxxxxxxxxx` which you'll use below.

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
| `options.clientTools` | `ClientTools` | No | Client-side tools the agent can invoke (see below) |
| `options.dynamicVariables` | `Record<string, string \| number \| boolean>` | No | Dynamic variables passed to the agent |

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

### Client Tools

Register client-side tools that the agent can invoke during a call. The agent decides when to call each tool based on the conversation context.

```ts
await calls.start({
  callerId: defaultCallerId(),
  clientTools: {

    // Search & filter items in the UI
    searchItem: {
      definition: {
        description: "Search for products or items by keyword",
        parameters: {
          query: { type: "string", description: "Search query" },
        },
      },
      handler: async ({ query }) => {
        filterProducts(query);
      },
    },

    // Navigate to a specific page or product
    navigateTo: {
      definition: {
        description: "Navigate to a product page by ID",
        parameters: {
          product_id: { type: "number", description: "Product ID" },
        },
      },
      handler: async ({ product_id }) => {
        router.push(`/product/${product_id}`);
      },
    },

    // Highlight important text on the page
    highlightText: {
      definition: {
        description: "Highlight key specs or features on the page",
        parameters: {
          product_id: { type: "number", description: "Product ID" },
          keywords: { type: "string", description: "Comma-separated keywords to highlight" },
        },
        expects_response: false, // fire-and-forget
      },
      handler: ({ product_id, keywords }) => {
        highlightKeywords(product_id, keywords.split(","));
      },
    },

    // Add item to cart
    addToCartById: {
      definition: {
        description: "Add a product to the shopping cart",
        parameters: {
          product_id: { type: "number", description: "Product ID to add" },
        },
      },
      handler: async ({ product_id }) => {
        return cart.addItem(product_id); // returns confirmation
      },
    },

    // Switch website color theme
    changeTheme: {
      definition: {
        description: "Switch the website color theme",
        parameters: {
          theme: { type: "string", description: "'dark' or 'light'" },
        },
        expects_response: false,
      },
      handler: ({ theme }) => {
        document.documentElement.className = theme;
      },
    },

    // Apply a promo code
    applyDiscountCode: {
      definition: {
        description: "Apply a promotional discount code to the order",
        parameters: {
          code: { type: "string", description: "Discount code" },
        },
      },
      handler: async ({ code }) => {
        return cart.applyDiscount(code); // returns true/false
      },
    },
  },
});
```

Each tool requires:
- **`definition.description`** — tells the agent when to use the tool
- **`definition.parameters`** — parameter schema (type: `"string"` | `"number"` | `"boolean"`, plus `description` and optional `required` flag)
- **`definition.expects_response`** — whether the agent waits for the handler's return value (default: `true`)
- **`handler`** — the function called when the agent invokes the tool

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
