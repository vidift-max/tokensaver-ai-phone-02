import http from "node:http";
import { PhoneRuntimeClient } from "../../scripts/phone-runtime-client.mjs";
import { RemoteAiExecutor } from "../../scripts/remote-ai-executor.mjs";

const client = new PhoneRuntimeClient();
const executor = new RemoteAiExecutor();
const recipient = process.env.AI_PHONE_REPLY_TO_ID || "";

if (!recipient) throw new Error("AI_PHONE_REPLY_TO_ID is required");

const seen = new Set();
const interval = Number(process.env.AI_PHONE_POLL_MS || 2000);
const heartbeatEvery = Number(process.env.AI_PHONE_HEARTBEAT_MS || 30000);
const port = Number(process.env.PORT || 10000);
const host = process.env.HOST || "0.0.0.0";

if (!Number.isInteger(interval) || interval < 500 || interval > 30000) {
  throw new Error("AI_PHONE_POLL_MS must be 500..30000");
}
if (!Number.isInteger(heartbeatEvery) || heartbeatEvery < 10000 || heartbeatEvery > 60000) {
  throw new Error("AI_PHONE_HEARTBEAT_MS must be 10000..60000");
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port");
}

let endpointFence = null;
let lastHeartbeat = 0;
let pollTimer = null;
let ticking = false;
let stopping = false;

async function refreshBinding() {
  const snapshot = await client.getSnapshot();
  endpointFence = snapshot?.attachment?.endpoint_fence;
  if (!Number.isInteger(endpointFence)) {
    throw new Error("Phone-02 endpoint is not currently attached");
  }
}

async function ensureHeartbeat(force = false) {
  const now = Date.now();
  if (!force && now - lastHeartbeat < heartbeatEvery) return;
  if (!Number.isInteger(endpointFence)) await refreshBinding();
  await client.heartbeat(endpointFence);
  lastHeartbeat = now;
}

async function tick() {
  if (stopping || ticking) return;
  ticking = true;
  try {
    await ensureHeartbeat();
    const messages = await client.poll();
    for (const message of messages) {
      if (!message?.message_id || seen.has(message.message_id)) continue;

      if (message.sender_ai_phone_id === client.phoneId) {
        await client.acknowledge(message.message_id);
        seen.add(message.message_id);
        continue;
      }

      const incomingContent = typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content);
      const result = await executor.execute({
        ...message,
        content: incomingContent
      }, {
        authorization: {
          source: "phone-02-worker",
          phone_id: client.phoneId,
          sender_ai_phone_id: message.sender_ai_phone_id
        }
      });

      await client.send(recipient, "reply-" + message.message_id, result.content);
      await client.acknowledge(message.message_id);
      seen.add(message.message_id);
    }
  } finally {
    ticking = false;
  }
}

async function guardedTick() {
  try {
    await tick();
  } catch (error) {
    console.error("worker tick failed", error.code || error.message);
    try {
      await ensureHeartbeat(true);
    } catch (heartbeatError) {
      console.error(
        "worker heartbeat recovery failed",
        heartbeatError.code || heartbeatError.message
      );
    }
  }
}

const server = http.createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health/live") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      service: "ai-phone-02-worker",
      status: "live",
      attached: Number.isInteger(endpointFence),
      polling: !stopping
    }));
    return;
  }

  if (request.method === "GET" && request.url === "/health/ready") {
    const ready = Number.isInteger(endpointFence) && !stopping;
    response.writeHead(ready ? 200 : 503, { "content-type": "application/json" });
    response.end(JSON.stringify({
      service: "ai-phone-02-worker",
      status: ready ? "ready" : "not_ready"
    }));
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not_found" }));
});

server.listen(port, host, async () => {
  console.log("AI-PHONE-02 worker starting");
  try {
    await refreshBinding();
    await guardedTick();
  } catch (error) {
    console.error("worker startup binding failed", error.code || error.message);
  }
  pollTimer = setInterval(guardedTick, interval);
});

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log("AI-PHONE-02 worker shutting down", signal);
  if (pollTimer) clearInterval(pollTimer);
  await new Promise(resolve => server.close(resolve));
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
