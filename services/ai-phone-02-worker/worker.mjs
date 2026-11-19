import http from "node:http";
import { PhoneRuntimeClient } from "./scripts/phone-runtime-client.mjs";
import { RemoteAiExecutor } from "./scripts/remote-ai-executor.mjs";

let client = null;
let executor = null;


function requireRuntimeConfig() {
  if (!client) client = new PhoneRuntimeClient();
  if (!executor) executor = new RemoteAiExecutor();
}
function configurationReady() {
  return true;
}

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
let nextBindingRetryAt = 0;

async function refreshBinding() {
  if (Date.now() < nextBindingRetryAt) {
    const error = new Error("Phone-02 binding retry is in backoff");
    error.code = "OIDC_RETRY_BACKOFF";
    throw error;
  }
  requireRuntimeConfig();
  try {
    if (!client.sessionToken) {
      await client.exchangeOidcSession();
      await client.joinRoom();
    }
    // A fresh session invalidates the previous attachment's session binding.
    // Re-attaching first lets the API safely fence the old generation and bind
    // the pre-enrolled endpoint credential to this session before snapshot read.
    const attachment = await client.attach();
    endpointFence = attachment?.endpoint_fence;
    const snapshot = await client.getSnapshot();
    if (!Number.isInteger(endpointFence)) endpointFence = snapshot?.attachment?.endpoint_fence;
    if (!Number.isInteger(endpointFence) ||
        snapshot?.attachment?.endpoint_fence !== endpointFence) {
      throw new Error("Phone-02 endpoint is not currently attached to the active session");
    }
    nextBindingRetryAt = 0;
  } catch (error) {
    nextBindingRetryAt = Date.now() + (error.status === 429 ? 60000 : 15000);
    throw error;
  }
}

async function ensureHeartbeat(force = false) {
  if (!configurationReady()) return;
  requireRuntimeConfig();
  const now = Date.now();
  if (client.sessionToken && client.shouldRenewSession?.(now)) {
    client.sessionToken = "";
    client.sessionExpiresAt = 0;
    endpointFence = null;
    lastHeartbeat = 0;
  }
  if (!force && now - lastHeartbeat < heartbeatEvery && Number.isInteger(endpointFence)) return;
  if (!Number.isInteger(endpointFence)) await refreshBinding();
  await client.heartbeat(endpointFence);
  lastHeartbeat = now;
}

async function tick() {
  if (stopping || ticking || !configurationReady()) return;
  if (!Number.isInteger(endpointFence) && Date.now() < nextBindingRetryAt) return;
  requireRuntimeConfig();
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

      if (typeof message.sender_ai_phone_id !== "string" || !message.sender_ai_phone_id) {
        throw new Error("incoming message has no sender_ai_phone_id");
      }
      await client.send(message.sender_ai_phone_id, "reply-" + message.message_id, result.content);
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
    console.error("worker tick failed", JSON.stringify({code:error.code||null,status:error.status||null,message:error.message}));
    if (error.code === "AUTHORIZATION_LOST") {
      // Never reuse a session rejected by the server. The next tick performs
      // a fresh OIDC exchange, rejoins the room and revalidates the endpoint fence.
      client.sessionToken = "";
      endpointFence = null;
      lastHeartbeat = 0;
      nextBindingRetryAt = Date.now() + 1000;
      return;
    }
    if (["OIDC_AUTH_FAILED","OIDC_EXCHANGE_FAILED","OIDC_RETRY_BACKOFF"].includes(error.code)) return;
    try {
      await ensureHeartbeat(true);
    } catch (heartbeatError) {
      console.error(
        "worker heartbeat recovery failed",
        JSON.stringify({code:heartbeatError.code||null,status:heartbeatError.status||null,message:heartbeatError.message})
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
      polling: !stopping,
      configured: configurationReady()
    }));
    return;
  }

  if (request.method === "GET" && request.url === "/health/ready") {
    const ready = Number.isInteger(endpointFence) && !stopping && configurationReady();
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
    if (configurationReady()) {
      requireRuntimeConfig();
      await refreshBinding();
    }
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
