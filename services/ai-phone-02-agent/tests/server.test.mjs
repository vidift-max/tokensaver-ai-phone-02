import test from "node:test";
import assert from "node:assert/strict";

test("Phone-02 executor contract requires a bearer token and OpenAI key", () => {
  assert.equal(Boolean(process.env.AI_PHONE_EXECUTOR_TOKEN), Boolean(process.env.OPENAI_API_KEY));
});
