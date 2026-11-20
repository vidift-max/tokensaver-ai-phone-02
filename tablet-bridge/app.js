const $ = id => document.getElementById(id);
const mission = $("mission"), reply = $("reply"), status = $("status");
const KEY_MISSION = "ai-bridge-mission-v1", KEY_REPLY = "ai-bridge-reply-v1";
function say(message){ status.textContent = message; }
function setPill(id, text){ $(id).textContent = text; }
mission.value = localStorage.getItem(KEY_MISSION) || "";
reply.value = localStorage.getItem(KEY_REPLY) || "";
setPill("mission-state", mission.value ? "Salva" : "Vazia");
setPill("inbox-state", reply.value ? "Recebida" : "Aguardando");
mission.addEventListener("input", () => { localStorage.setItem(KEY_MISSION, mission.value); setPill("mission-state", mission.value ? "Salva" : "Vazia"); });
reply.addEventListener("input", () => { localStorage.setItem(KEY_REPLY, reply.value); setPill("inbox-state", reply.value ? "Recebida" : "Aguardando"); });

async function pasteFromClipboard(target, label){
  try {
    if (!navigator.clipboard?.readText) throw new Error("clipboard-read-unavailable");
    const text = await navigator.clipboard.readText();
    if (!text.trim()) { say("A área de transferência está vazia."); return; }
    target.value = text;
    target.dispatchEvent(new Event("input", {bubbles:true}));
    say(label + " colada da área de transferência.");
  } catch { say("Não foi possível ler a área de transferência. Toque no campo, mantenha pressionado e escolha Colar."); }
}
$("paste-mission").addEventListener("click", () => pasteFromClipboard(mission, "Missão"));
$("paste-reply").addEventListener("click", () => pasteFromClipboard(reply, "Resposta"));

async function shareText(text, label){
  if (!text.trim()) { say("Não há texto para compartilhar."); return; }
  if (!navigator.share) { say("Compartilhamento do sistema indisponível. Use Copiar e cole no ChatGPT."); return; }
  try { await navigator.share({title: label, text}); say("Menu de compartilhamento aberto. Escolha o ChatGPT."); }
  catch (error) { if (error.name !== "AbortError") say("Não foi possível abrir o compartilhamento."); }
}
$("share-mission").addEventListener("click", () => shareText(mission.value, "Missão para IA-2"));
$("send-reply").addEventListener("click", async () => { try { await navigator.clipboard.writeText(reply.value); say("Resposta copiada. Volte à conversa GPT-6 no navegador e cole."); } catch { reply.focus(); reply.select(); say("Selecione a resposta e use Copiar no menu do Android."); } });
$("clear").addEventListener("click", () => {
  if (!confirm("Apagar a missão e a resposta salvas neste navegador?")) return;
  mission.value = ""; reply.value = ""; localStorage.removeItem(KEY_MISSION); localStorage.removeItem(KEY_REPLY);
  setPill("mission-state","Vazia"); setPill("inbox-state","Aguardando");
  navigator.serviceWorker?.ready.then(registration => registration.active?.postMessage({type:"CLEAR_INBOX"}));
  say("Sessão local limpa.");
});
async function receiveSharedText(){
  try {
    const response = await fetch("./__shared_inbox__");
    if (!response.ok) return;
    const text = (await response.text()).trim();
    if (!text) return;
    reply.value = text; localStorage.setItem(KEY_REPLY, text); setPill("inbox-state","Recebida"); say("Texto compartilhado recebido da outra sessão.");
  } catch { /* no pending shared item */ }
}
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("./sw.js").then(() => receiveSharedText()).catch(() => say("Modo offline/compartilhamento não ativado neste endereço."));
}
if (new URLSearchParams(location.search).has("shared")) receiveSharedText();
let installPrompt;
window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); installPrompt = event; $("install").hidden = false; });
$("install").addEventListener("click", async () => { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; $("install").hidden = true; });
