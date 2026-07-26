# `@lucid-softworks/http-server-node`

Adapters between Node HTTP streams and Web `Request`/`Response` handlers.

```ts
import { createServer } from "node:http";
import { createNodeHttpListener } from "@lucid-softworks/http-server-node";

const handler = () => new Response("ok");
const server = createServer(createNodeHttpListener(handler));
server.listen(3000);
```

Request and response bodies stream without mandatory buffering. Handler errors
receive a safe `500` response or a caller-provided asynchronous fallback.
