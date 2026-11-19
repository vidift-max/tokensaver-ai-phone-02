import { PhoneRuntimeClient } from "../../scripts/phone-runtime-client.mjs";
import { RemoteAiExecutor } from "../../scripts/remote-ai-executor.mjs";

const client = new PhoneRuntimeClient();
const executor = new RemoteAiExecutor();
const recipient = process.env.AI_PHONE_REPLY_TO_ID || "";

if (!recipient) throw new Error("AI_PHONE_REPLY_TO_ID is required");

const seen = new Set();
const interval = Number(process.env.AI_PHONE_POLL_MS || 2000);
if (!Number.isInteger(interval) || interval < 500 || interval > 30000) throw new Error("AI_PHONE_POLL_MS must be 500..30000");

async function tick() {
  const messages = await client.poll();
  for (const message of messages) {
    if (!message?.message_id || seen.has(message.message_id)) continue;
    if (message.sender_ai_phone_id === client.phoneId) {
      await client.acknowledge(message.message_id);
      seen.add(message.message_id);
      continue;
    }
    const result = await executor.execute(message, { authorization: { source: "phone-02-worker" } });
    await client.send(recipient, "reply-" + message.message_id, result.content);
    await client.acknowledge(message.message_id);
    seen.add(message.message_id);
  }
}

console.log("AI-PHONE-02 worker starting");
setInterval(() => tick().catch(error => console.error("worker tick failed", error.code || error.message)), interval);
await tick();
