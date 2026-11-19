import test from "node:test";
import assert from "node:assert/strict";
import { RemoteAiExecutor } from "../scripts/remote-ai-executor.mjs";

test("remote executor fails closed without explicit endpoint credentials", () => {
  assert.throws(() => new RemoteAiExecutor({}), error => error.code === "EXECUTOR_CONFIG_REQUIRED");
});

test("remote executor rejects non-HTTPS endpoints", () => {
  assert.throws(
    () => new RemoteAiExecutor({
      AI_PHONE_EXECUTOR_URL: "http://executor.example",
      AI_PHONE_EXECUTOR_TOKEN: "x"
    }),
    error => error.code === "EXECUTOR_INSECURE"
  );
});

test("remote executor sends the independent agent message and returns content", async () => {
  let seen;
  const executor = new RemoteAiExecutor(
    { AI_PHONE_EXECUTOR_URL: "https://executor.example", AI_PHONE_EXECUTOR_TOKEN: "secret" },
    async (url, init) => {
      seen = { url, init };
      return new Response(JSON.stringify({ content: "AI-PHONE-02 recebeu." }), {
        status: 200, headers: { "content-type": "application/json" }
      });
    }
  );
  const result = await executor.execute(
    {
      message_id: "10000000-0000-4000-8000-000000000001",
      sender_principal_id: "20000000-0000-4000-8000-000000000002",
      content: "GPT-6, aqui é a AI-PHONE-02."
    },
    { authorization: { fencingToken: 1 } }
  );
  assert.equal(result.content, "AI-PHONE-02 recebeu.");
  assert.equal(seen.url, "https://executor.example/execute");
  assert.equal(seen.init.headers.authorization, "Bearer secret");
});
