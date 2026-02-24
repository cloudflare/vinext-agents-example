/**
 * Cloudflare Worker entry point with image optimization and agent chat.
 *
 * For apps without image optimization, use vinext/server/app-router-entry
 * directly in wrangler.jsonc: "main": "vinext/server/app-router-entry"
 */
import { handleImageOptimization } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { routeAgentRequest } from "agents";

export { ChatAgent } from "./chat-agent";

interface Env {
  ASSETS: Fetcher;
  AI: unknown;
  ChatAgent: DurableObjectNamespace;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Image optimization via Cloudflare Images binding
    if (url.pathname === "/_vinext/image") {
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      });
    }

    console.log("Request:", request.url);

    // Route agent WebSocket/API requests (e.g. /agents/*)
    const agentResponse = await routeAgentRequest(request, env);
    if (agentResponse) return agentResponse;

    // Delegate everything else to vinext
    return handler.fetch(request);
  },
};