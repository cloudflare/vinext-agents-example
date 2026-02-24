# next.js + agents, powered by vinext 

A Next.js app running on Cloudflare Workers with an AI chat agent, powered by [vinext](https://github.com/cloudflare/vinext) and the [Agents SDK](https://developers.cloudflare.com/agents/).

This example demonstrates how to build a full-stack Next.js application that uses Cloudflare-specific bindings — Durable Objects, Workers AI, and the Agents SDK — with a single `vite dev` command for local development.

<img width="590" height="855" alt="image" src="https://github.com/user-attachments/assets/d91dbddf-ef92-445f-8f07-930672eac6bc" />


## How it works

[vinext](https://github.com/cloudflare/vinext) runs Next.js on Vite instead of the default Next.js compiler. By combining it with [`@cloudflare/vite-plugin`](https://developers.cloudflare.com/workers/vite-plugin/), the entire application — pages, API routes, and Cloudflare Worker logic — runs in a single worker during both development and production.

This means you get full access to Cloudflare bindings in `vite dev`:

- **Durable Objects** — stateful agents that persist across requests and maintain WebSocket connections
- **Workers AI** — run AI models directly via `env.AI` with no external API keys
- **Assets** — static files served from the edge with `env.ASSETS`
- **Images** — on-the-fly image optimization via `env.IMAGES`

### Vite config

The key is the plugin setup in `vite.config.ts`:

```ts
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
```

- **`vinext()`** — provides the Next.js compatibility layer on Vite, including React Server Components
- **`cloudflare()`** — runs the worker in miniflare during dev, targeting the RSC environment so server components execute inside the Workers runtime with full access to bindings

### Worker entry

The worker (`worker/index.ts`) is the single entry point. It handles image optimization, routes agent WebSocket/API requests via `routeAgentRequest`, and delegates everything else to vinext's RSC handler:

```ts
import handler from "vinext/server/app-router-entry";
import { routeAgentRequest } from "agents";

export { ChatAgent } from "./chat-agent";

export default {
  async fetch(request: Request, env: Env) {
    const agentResponse = await routeAgentRequest(request, env);
    if (agentResponse) return agentResponse;

    return handler.fetch(request);
  },
};
```

### Agent chat

The `ChatAgent` Durable Object (in `worker/chat-agent.ts`) extends `AIChatAgent` from `@cloudflare/ai-chat`. It streams responses from Workers AI, supports tool calls (weather, calculations, scheduling), and maintains persistent chat history via Durable Object SQLite storage.

The frontend (`app/chat/Chat.tsx`) connects over WebSocket using `useAgent` and `useAgentChat` hooks.

## Getting started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) to start chatting.

## Deploy

```bash
pnpm run deploy
```

This builds the app with Vite and deploys the worker to Cloudflare.

## Project structure

```
app/
  chat/
    Chat.tsx        — client-side chat UI (Kumo + Streamdown)
  page.tsx          — homepage (loads the chat UI)
  layout.tsx        — root layout
worker/
  index.ts          — Cloudflare Worker entry point
  chat-agent.ts     — ChatAgent Durable Object
vite.config.ts      — vinext + cloudflare plugin config
wrangler.jsonc      — Cloudflare Worker bindings and DO migrations
```
