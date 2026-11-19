/**
 * Explicit remote executor adapter for the independent AI-PHONE-02 runtime.
 *
 * The adapter never contains a model key or model implementation. The actual
 * AI execution service is injected by AI_PHONE_EXECUTOR_URL and authenticated
 * with AI_PHONE_EXECUTOR_TOKEN. Missing configuration fails closed.
 */
export class RemoteAiExecutorError extends Error {
  constructor(message, code = "REMOTE_EXECUTOR_ERROR") {
    super(message);
    this.name = "RemoteAiExecutorError";
    this.code = code;
  }
}

export class RemoteAiExecutor {
  constructor(env = process.env, fetchImpl = globalThis.fetch) {
    this.url = (env.AI_PHONE_EXECUTOR_URL || "").replace(/\/+$/, "");
    this.token = env.AI_PHONE_EXECUTOR_TOKEN || "";
    this.fetch = fetchImpl;
    if (!this.url || !this.token) {
      throw new RemoteAiExecutorError(
        "AI_PHONE_EXECUTOR_URL and AI_PHONE_EXECUTOR_TOKEN are required",
        "EXECUTOR_CONFIG_REQUIRED"
      );
    }
    let parsed;
    try { parsed = new URL(this.url); } catch {
      throw new RemoteAiExecutorError("AI_PHONE_EXECUTOR_URL must be an absolute URL", "EXECUTOR_CONFIG_INVALID");
    }
    if (parsed.protocol !== "https:") {
      throw new RemoteAiExecutorError("AI_PHONE_EXECUTOR_URL must use HTTPS", "EXECUTOR_INSECURE");
    }
  }

  async execute(message, context = {}) {
    if (context.signal?.aborted) throw new RemoteAiExecutorError("Execution aborted", "ABORTED");
    const body = {
      message_id: message.message_id,
      sender_principal_id: message.sender_principal_id,
      content: message.content,
      authorization: context.authorization || null
    };
    let response;
    try {
      response = await this.fetch(this.url + "/execute", {
        method: "POST",
        redirect: "error",
        headers: {
          authorization: "Bearer " + this.token,
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000)
      });
    } catch (error) {
      throw new RemoteAiExecutorError("Remote AI executor request failed", "EXECUTOR_NETWORK_FAILURE");
    }
    const raw = await response.text();
    if (!response.ok) throw new RemoteAiExecutorError(
      "Remote AI executor rejected execution (HTTP " + response.status + ")",
      "EXECUTOR_HTTP_ERROR"
    );
    let payload;
    try { payload = JSON.parse(raw); } catch {
      throw new RemoteAiExecutorError("Remote AI executor returned invalid JSON", "EXECUTOR_INVALID_RESPONSE");
    }
    if (typeof payload?.content !== "string" || !payload.content.trim()) {
      throw new RemoteAiExecutorError("Remote AI executor returned no content", "EXECUTOR_EMPTY_RESPONSE");
    }
    return { content: payload.content, executor: payload.executor || "remote-ai" };
  }
}
