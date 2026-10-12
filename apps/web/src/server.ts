import type { IncomingMessage, ServerResponse } from "node:http";

import { sendUnexpectedServerError } from "./api.js";

export type WebHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

/**
 * Adapts the async web handler to node:http. A rejected handler must never become an
 * unhandled rejection: it is logged without request data and answered with a bounded 500.
 */
export function createWebRequestListener(
  handler: WebHandler,
  logError: (message: string) => void = (message) => console.error(message),
): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    handler(request, response).catch((error: unknown) => {
      logError(JSON.stringify({
        status: "REQUEST_ERROR",
        message: error instanceof Error ? error.message : String(error),
      }));
      sendUnexpectedServerError(response);
    });
  };
}
