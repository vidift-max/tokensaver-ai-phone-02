/**
 * Fail-closed HTTP client for the AI Phone mailbox.
 * It does not execute missions or call an AI provider; callers must supply
 * an independently authorized executor and ACK only after durable handling.
 */
export class PhoneRuntimeError extends Error {
  constructor(message, status = 0, code = "PHONE_RUNTIME_ERROR") {
    super(message);
    this.name = "PhoneRuntimeError";
    this.status = status;
    this.code = code;
  }
}

export class PhoneRuntimeClient {
  constructor(env = process.env, fetchImpl = globalThis.fetch) {
    this.baseUrl = (env.AI_PHONE_API_URL || "").replace(/\/+$/, "");
    this.sessionToken = env.AI_PHONE_SESSION_TOKEN || "";
    this.oidcIssuer = (env.AI_PHONE_OIDC_ISSUER || "").replace(/\/+$/, "");
    this.oidcClientId = env.AI_PHONE_OIDC_CLIENT_ID || "";
    this.oidcClientSecret = env.AI_PHONE_OIDC_CLIENT_SECRET || "";
    this.roomId = env.TEAM_ROOM_ROOM_ID || "";
    this.endpointCredential = env.AI_PHONE_ENDPOINT_CREDENTIAL || "";
    this.phoneId = env.AI_PHONE_ID || "";
    this.endpointId = env.PHONE02_ENDPOINT_ID || "";
    this.fetch = fetchImpl;
    if (!this.baseUrl || !this.endpointCredential || !this.phoneId || !this.endpointId || (!this.sessionToken && (!this.oidcIssuer || !this.oidcClientId || !this.oidcClientSecret || !this.roomId))) {
      throw new PhoneRuntimeError(
        "AI_PHONE_API_URL, endpoint credential, phone identity, endpoint identity and either session token or OIDC runtime credentials are required",
        0, "CONFIG_REQUIRED"
      );
    }
    let parsed;
    try { parsed = new URL(this.baseUrl); }
    catch { throw new PhoneRuntimeError("AI_PHONE_API_URL must be an absolute URL", 0, "CONFIG_INVALID"); }
    if (!["https:", "http:"].includes(parsed.protocol) ||
        (parsed.protocol === "http:" && !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname))) {
      throw new PhoneRuntimeError("AI Phone API must use HTTPS except loopback development", 0, "INSECURE_API_URL");
    }
    if (this.endpointCredential.length < 40 || this.endpointCredential.length > 128) {
      throw new PhoneRuntimeError("AI_PHONE_ENDPOINT_CREDENTIAL has invalid length", 0, "CONFIG_INVALID");
    }
    if (typeof this.fetch !== "function") {
      throw new PhoneRuntimeError("Fetch implementation unavailable", 0, "CONFIG_INVALID");
    }
  }

  async request(method, route, body) {
    let response;
    try {
      response = await this.fetch(this.baseUrl + route, {
        method,
        redirect: "error",
        headers: {
          authorization: "Bearer " + this.sessionToken,
          "x-ai-phone-endpoint-credential": this.endpointCredential,
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" })
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(10000)
      });
    } catch {
      throw new PhoneRuntimeError("AI Phone request failed; processing must stop", 0, "NETWORK_FAILURE");
    }
    const raw = await response.text();
    let payload = null;
    if (raw) {
      try { payload = JSON.parse(raw); }
      catch { throw new PhoneRuntimeError("AI Phone returned invalid JSON", response.status, "INVALID_RESPONSE"); }
    }
    if (!response.ok) {
      const code = response.status === 401 || response.status === 403 || response.status === 412
        ? "AUTHORIZATION_LOST" : "HTTP_ERROR";
      throw new PhoneRuntimeError(`AI Phone rejected ${method} ${route} (HTTP ${response.status})`, response.status, code);
    }
    return payload;
  }

  async oidcToken() {
    if (!this.oidcIssuer || !this.oidcClientId || !this.oidcClientSecret) throw new PhoneRuntimeError("OIDC runtime credentials are required", 0, "CONFIG_REQUIRED");
    const body = new URLSearchParams({client_id:this.oidcClientId,client_secret:this.oidcClientSecret,grant_type:"client_credentials",scope:"team_room:connect"});
    const response = await this.fetch(this.oidcIssuer + "/realms/team-room/protocol/openid-connect/token", {method:"POST",redirect:"error",headers:{"content-type":"application/x-www-form-urlencoded",accept:"application/json"},body,signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw new PhoneRuntimeError("OIDC token acquisition failed", response.status, "OIDC_AUTH_FAILED");
    const payload = await response.json();
    if (typeof payload.access_token !== "string" || !payload.access_token) throw new PhoneRuntimeError("OIDC token response is invalid", 502, "INVALID_RESPONSE");
    return payload.access_token;
  }

  async exchangeOidcSession() {
    const token = await this.oidcToken();
    const response = await this.fetch(this.baseUrl + "/auth/exchange", {method:"POST",redirect:"error",headers:{authorization:"Bearer "+token,"content-type":"application/json",accept:"application/json"},body:JSON.stringify({room_id:this.roomId}),signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw new PhoneRuntimeError("Team Room OIDC exchange failed", response.status, "OIDC_EXCHANGE_FAILED");
    const payload = await response.json();
    if (typeof payload.access_token !== "string" || !payload.access_token) throw new PhoneRuntimeError("Team Room exchange response is invalid", 502, "INVALID_RESPONSE");
    this.sessionToken = payload.access_token;
    return payload;
  }

  async joinRoom() {
    if (!this.roomId) throw new PhoneRuntimeError("TEAM_ROOM_ROOM_ID is required", 0, "CONFIG_REQUIRED");
    return this.request("POST", "/team-room/" + encodeURIComponent(this.roomId) + "/join");
  }

  async attach() {
    if (!this.endpointId) throw new PhoneRuntimeError("PHONE02_ENDPOINT_ID is required", 0, "CONFIG_REQUIRED");
    return this.request("POST", "/ai-phone/attach", {endpoint_id:this.endpointId,endpoint_type:"WORKER",metadata:{label:"AI-PHONE-02 independent runtime"}});
  }

  async getSnapshot() {
    const snapshot = await this.request("GET", "/ai-phone/me");
    if (!snapshot || typeof snapshot !== "object") {
      throw new PhoneRuntimeError("AI Phone snapshot response is invalid", 502, "INVALID_RESPONSE");
    }
    return snapshot;
  }

  async heartbeat(endpointFence) {
    if (!Number.isInteger(endpointFence) || endpointFence < 0) {
      throw new PhoneRuntimeError("endpointFence must be a non-negative integer", 0, "INVALID_ARGUMENT");
    }
    return this.request("POST", "/ai-phone/heartbeat", { endpoint_fence: endpointFence });
  }

  async poll() {
    const messages = await this.request("GET", `/ai-phone/${encodeURIComponent(this.phoneId)}/messages`);
    if (!Array.isArray(messages)) {
      throw new PhoneRuntimeError("AI Phone mailbox response must be an array", 502, "INVALID_RESPONSE");
    }
    return messages;
  }

  async acknowledge(messageId) {
    if (typeof messageId !== "string" || !/^[0-9a-f-]{36}$/i.test(messageId)) {
      throw new PhoneRuntimeError("messageId must be a UUID", 0, "INVALID_ARGUMENT");
    }
    await this.request("POST",
      `/ai-phone/${encodeURIComponent(this.phoneId)}/messages/${encodeURIComponent(messageId)}/ack`);
  }

  async send(recipientPhoneId, idempotencyKey, content) {
    if (typeof recipientPhoneId !== "string" || !/^[0-9a-f-]{36}$/i.test(recipientPhoneId) ||
        typeof idempotencyKey !== "string" || !idempotencyKey.trim() || idempotencyKey.length > 200 ||
        content === undefined) {
      throw new PhoneRuntimeError("recipientPhoneId, idempotencyKey and content are required", 0, "INVALID_ARGUMENT");
    }
    return this.request("POST", `/ai-phone/${encodeURIComponent(recipientPhoneId)}/messages`, {
      idempotency_key: idempotencyKey,
      content
    });
  }
}
