import http from "node:http";
import OpenAI from "openai";

const port = Number(process.env.PORT || 8090);
const token = process.env.AI_PHONE_EXECUTOR_TOKEN || "";
const model = process.env.AI_PHONE_MODEL || "gpt-6-luna";
const system = process.env.AI_PHONE_SYSTEM_PROMPT ||
  "Você é a AI-PHONE-02, uma IA independente. Responda diretamente ao agente GPT-6. Nunca alegue identidade ou eventos que não estejam presentes no contexto recebido.";

function json(res, status, body) {
  res.writeHead(status, {"content-type":"application/json; charset=utf-8"});
  res.end(JSON.stringify(body));
}

const client = process.env.OPENAI_API_KEY ? new OpenAI({apiKey: process.env.OPENAI_API_KEY}) : null;

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health/live") return json(res, 200, {ok:true, service:"ai-phone-02-agent"});
  if (req.method !== "POST" || req.url !== "/execute") return json(res, 404, {error:"not_found"});
  if (!token || !client) return json(res, 503, {error:"executor_not_configured"});
  if (req.headers.authorization !== "Bearer " + token) return json(res, 401, {error:"unauthorized"});

  let raw = "";
  for await (const chunk of req) raw += chunk;
  let body;
  try { body = JSON.parse(raw); } catch { return json(res, 400, {error:"invalid_json"}); }
  if (typeof body.content !== "string" || !body.content.trim()) return json(res, 400, {error:"content_required"});

  try {
    const response = await client.responses.create({
      model,
      instructions: system,
      input: body.content
    });
    return json(res, 200, {content: response.output_text, executor:"ai-phone-02-openai"});
  } catch {
    return json(res, 502, {error:"model_execution_failed"});
  }
});

server.listen(port, "0.0.0.0");
