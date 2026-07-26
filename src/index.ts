import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

import {
  createHttpContext,
  type HttpHandler,
} from "@lucid-softworks/http-core";

type DuplexRequestInit = RequestInit & Readonly<{ duplex?: "half" }>;

function incomingHeaders(message: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(message.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  return headers;
}

/** Converts a Node request stream into a standards-based Request. */
export function nodeRequestToRequest(
  message: IncomingMessage,
  origin?: string,
): Request {
  const method = message.method ?? "GET";
  const base = origin ?? `http://${message.headers.host ?? "localhost"}`;
  const body =
    method === "GET" || method === "HEAD"
      ? undefined
      : (Readable.toWeb(message) as ReadableStream<Uint8Array>);
  const init: DuplexRequestInit = {
    ...(body === undefined ? {} : { body, duplex: "half" }),
    headers: incomingHeaders(message),
    method,
  };
  return new Request(new URL(message.url ?? "/", base), init);
}

/** Writes a standards-based Response to a Node server response stream. */
export async function writeNodeResponse(
  response: Response,
  output: ServerResponse,
): Promise<void> {
  output.statusCode = response.status;
  output.statusMessage = response.statusText;
  response.headers.forEach((value, name) => output.setHeader(name, value));
  if (response.body === null) {
    output.end();
    return;
  }
  const reader = response.body.getReader();
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- response stream reads are sequential
    const result = await reader.read();
    if (result.done) break;
    output.write(result.value);
  }
  output.end();
}

export type NodeHttpListenerOptions = Readonly<{
  onError?: (error: unknown) => Response | PromiseLike<Response>;
  origin?: string;
}>;

/** Adapts a Web handler into a Node `request` listener. */
export function createNodeHttpListener(
  handler: HttpHandler,
  options: NodeHttpListenerOptions = {},
): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response): void => {
    void (async (): Promise<void> => {
      try {
        const webRequest = nodeRequestToRequest(request, options.origin);
        await writeNodeResponse(
          await handler(webRequest, createHttpContext()),
          response,
        );
      } catch (error) {
        const fallback =
          options.onError === undefined
            ? new Response("Internal Server Error", { status: 500 })
            : await options.onError(error);
        await writeNodeResponse(fallback, response);
      }
    })();
  };
}
