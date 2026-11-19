import { PhoneRuntimeClient } from "../../scripts/phone-runtime-client.mjs";
import { RemoteAiExecutor } from "../../scripts/remote-ai-executor.mjs";

const client = new PhoneRuntimeClient();
const executor = new RemoteAiExecutor();
const recipient = process.env.AI_PHONE_REPLY_TO_ID || "";

if (!recipient) throw new Error("AI_PHONE_REPLY_TO_ID is required");

const seen = new Set();
const interval = Number(process.env.AI_PHONE_POLL_MS || 2000);
const heartbeatEvery = Number(process.env.AI_PHONE_HEARTBEAT_MS || 30000);
if (!Number.isInteger(interval) || interval < 500 || interval > 30000) {
  throw new Error("AI_PHONE_POLL_MS must be 500..30000");
}
if (!Number.isInteger(heartbeatEvery) || heartbeatEvery < 10000 || heartbeatEvery > 60000) {
  throw new Error("AI_PHONE_HEARTBEAT_MS must be 10000..60000");
}

let endpointFence = null;
let lastHeartbeat = 0;

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
  await ensureHeartbeat();
  const messages = await client.poll();
  for (const message of messages) {
    if (!message?.message_id || seen.has(message.message_id)) continue;

    if (message.sender_ai_phone_id === client.phoneId) {
      await client.acknowledge(message.message_id);
      seen.add(message.message_id);
      continue;
    }

    const result = await executor.execute(message, {
      authorization: { source: "phone-02-worker", phone_id: client.phoneId }
    });

    await client.send(recipient, "reply-" + message.message_id, result.content);
    await client.acknowledge(message.message_id);
    seen.add(message.message_id);
  }
}

console.log("AI-PHONE-02 worker starting");
setInterval(() => tick().catch(async error => {
  console.error("worker tick failed", error.code || error.message);
  try {
    await ensureHeartbeat(true);
  } catch (heartbeatError) {
    console.error("worker heartbeat recovery failed", heartbeatError.code || heartbeatError.message);
  }
}), interval);
await refreshBinding();
await tick();
