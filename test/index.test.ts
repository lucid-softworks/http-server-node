import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import { createNodeHttpListener, nodeRequestToRequest } from "../src/index.js";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

async function listen(
  listener: ReturnType<typeof createNodeHttpListener>,
): Promise<string> {
  const server = createServer(listener);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe("Node HTTP server adapter", () => {
  it("converts Node-like requests with defaults, arrays, and bodies", async () => {
    const getMessage = Object.assign(Readable.from([]), {
      headers: { "x-many": ["one", "two"] },
      method: undefined,
      url: undefined,
    });
    const get = nodeRequestToRequest(getMessage as never);
    expect(get.url).toBe("http://localhost/");
    expect(get.method).toBe("GET");
    expect(get.headers.get("x-many")).toBe("one, two");

    const postMessage = Object.assign(Readable.from([Buffer.from("hello")]), {
      headers: { host: "example.com", ignored: undefined },
      method: "POST",
      url: "/submit",
    });
    const post = nodeRequestToRequest(
      postMessage as never,
      "https://override.test",
    );
    expect(post.url).toBe("https://override.test/submit");
    expect(await post.text()).toBe("hello");

    const headMessage = Object.assign(Readable.from([]), {
      headers: {},
      method: "HEAD",
      url: "/",
    });
    expect(nodeRequestToRequest(headMessage as never).body).toBeNull();
  });

  it("serves response bodies and empty responses", async () => {
    const origin = await listen(
      createNodeHttpListener(async (request) => {
        if (new URL(request.url).pathname === "/empty") {
          return new Response(null, { status: 204, statusText: "Nothing" });
        }
        return new Response(await request.text(), {
          headers: { x: "yes" },
          status: 201,
          statusText: "Made",
        });
      }),
    );
    const created = await fetch(`${origin}/echo`, {
      body: "hello",
      method: "POST",
    });
    expect(created.status).toBe(201);
    expect(created.headers.get("x")).toBe("yes");
    expect(await created.text()).toBe("hello");
    expect((await fetch(`${origin}/empty`)).status).toBe(204);
  });

  it("uses default and custom error responses", async () => {
    const defaultOrigin = await listen(
      createNodeHttpListener(() => {
        throw new Error("boom");
      }),
    );
    expect((await fetch(defaultOrigin)).status).toBe(500);

    const customOrigin = await listen(
      createNodeHttpListener(
        () => {
          throw new Error("boom");
        },
        { onError: async () => new Response("custom", { status: 502 }) },
      ),
    );
    const response = await fetch(customOrigin);
    expect(response.status).toBe(502);
    expect(await response.text()).toBe("custom");
  });
});
