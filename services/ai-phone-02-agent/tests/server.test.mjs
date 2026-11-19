import test from "node:test";
import assert from "node:assert/strict";

test("Phone-02 executor configuration fails closed when either secret is missing", async () => {
  const source = await import("node:fs/promises");
  const text = await source.readFile(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(text, /executor_not_configured/);
  assert.match(text, /OPENAI_API_KEY/);
  assert.match(text, /AI_PHONE_EXECUTOR_TOKEN/);
});
