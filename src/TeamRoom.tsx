import { useCallback, useEffect, useRef, useState } from "react";

type Message = {
  message_id: string;
  sender_principal_id: string;
  sender_display_name: string;
  parent_message_id: string | null;
  body: string;
  created_at: string;
};

type SpeechRecognitionResultLike = { transcript: string };
type SpeechRecognitionEventLike = { results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>> };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

export default function TeamRoom() {
  const [apiUrl, setApiUrl] = useState("http://127.0.0.1:8081");
  const [roomId, setRoomId] = useState("");
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [connection, setConnection] = useState("DESCONECTADO");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const speechWindow = window as SpeechWindow;
    setVoiceSupported(Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition) && "speechSynthesis" in window);
    return () => {
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
    };
  }, []);

  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json");
    headers.set("authorization", "Bearer " + token);
    const response = await fetch(apiUrl.replace(/\/$/, "") + path, { ...init, headers });
    if (!response.ok) throw new Error("Team Room HTTP " + response.status);
    if (response.status === 204) return null;
    return response.json();
  }, [apiUrl, token]);

  const refresh = useCallback(async () => {
    if (!roomId || !token) return;
    const history = await request("/team-room/" + roomId + "/messages");
    setMessages(history.items || []);
  }, [request, roomId, token]);

  const connect = useCallback(async () => {
    setError("");
    setBusy(true);
    try {
      await request("/team-room/me");
      await request("/team-room/" + roomId + "/join", { method: "POST", body: "{}" });
      await refresh();
      setConnected(true);
      setConnection("CONECTANDO");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao conectar");
      setConnected(false);
      setConnection("DESCONECTADO");
    } finally {
      setBusy(false);
    }
  }, [request, roomId, refresh]);

  useEffect(() => {
    if (!connected || !roomId || !token) return;
    let stopped = false;
    let retry = 0;
    let timer: number | undefined;
    const openSocket = async () => {
      try {
        const issued = await request("/team-room/" + roomId + "/ws-ticket", { method: "POST", body: "{}" });
        if (stopped) return;
        const wsUrl = apiUrl.replace(/^http/, "ws").replace(/\/$/, "") + "/team-room/" + roomId + "/ws?ticket=" + encodeURIComponent(issued.ticket);
        const socket = new WebSocket(wsUrl, ["team-room.v1"]);
        socketRef.current = socket;
        socket.onopen = () => {
          retry = 0;
          setConnection("CONECTADO");
          void refresh().catch(() => {});
        };
        socket.onmessage = () => { void refresh().catch(() => {}); };
        socket.onerror = () => setConnection("RECONectando");
        socket.onclose = () => {
          socketRef.current = null;
          if (!stopped) {
            setConnection("RECONectando");
            timer = window.setTimeout(() => void openSocket(), Math.min(30000, 500 * Math.pow(2, retry++)));
          }
        };
      } catch {
        if (!stopped) {
          setConnection("RECONectando");
          timer = window.setTimeout(() => void openSocket(), Math.min(30000, 1000 * Math.pow(2, retry++)));
        }
      }
    };
    void openSocket();
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [connected, apiUrl, roomId, token, request, refresh]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    const body = draft.trim();
    if (!body || !connected) return;
    setError("");
    try {
      const clientId = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : String(Date.now()) + "-" + Math.random().toString(16).slice(2);
      await request("/team-room/" + roomId + "/messages", {
        method: "POST",
        body: JSON.stringify({ client_message_id: clientId, body, parent_message_id: null })
      });
      setDraft("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao enviar mensagem");
    }
  }

  function startDictation() {
    const speechWindow = window as SpeechWindow;
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setError("O navegador não oferece reconhecimento de voz. Tente usar o ditado do teclado Android.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "pt-BR";
    recognition.interimResults = false;
    recognition.onresult = event => {
      const spoken = Array.from(event.results).map(result => result[0]?.transcript || "").join(" ");
      setDraft(current => current ? current + " " + spoken : spoken);
    };
    recognition.onerror = () => {
      setError("Não foi possível capturar o microfone. Confira a permissão do navegador.");
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setError("");
    setListening(true);
    try { recognition.start(); } catch {
      setListening(false);
      setError("O microfone não pôde ser iniciado.");
    }
  }

  function stopDictation() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  function speak(text: string) {
    if (!("speechSynthesis" in window)) {
      setError("A leitura em voz alta não está disponível neste navegador.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "pt-BR";
    window.speechSynthesis.speak(utterance);
  }

  function leaveRoom() {
    socketRef.current?.close();
    setConnected(false);
    setConnection("DESCONECTADO");
  }

  return (
    <section className="team-room team-room-simple">
      <header className="simple-room-heading">
        <div>
          <span className="eyebrow">COMUNICAÇÃO ENTRE AGENTES</span>
          <h2>Sala de conversa</h2>
          <p className="muted">Canal de texto com ditado e leitura em voz alta no navegador.</p>
        </div>
        <span className={connected ? "room-state room-state-on" : "room-state"}>{connection}</span>
      </header>

      <div className="simple-room-config">
        <label>Endereço da API<input value={apiUrl} onChange={event => setApiUrl(event.target.value)} /></label>
        <label>ID da sala<input value={roomId} onChange={event => setRoomId(event.target.value)} placeholder="UUID da sala" /></label>
        <label>Token da sessão<input type="password" value={token} onChange={event => setToken(event.target.value)} placeholder="Token de acesso" /></label>
        <div className="simple-room-actions">
          {!connected
            ? <button className="primary" disabled={busy || !roomId.trim() || !token.trim()} onClick={() => void connect()}>{busy ? "Conectando..." : "Conectar"}</button>
            : <button onClick={leaveRoom}>Desconectar</button>}
          <button onClick={() => void refresh()} disabled={!connected}>Atualizar</button>
        </div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      <div className="simple-room-identities">
        <div><span className="agent-dot agent-dot-gpt" /><strong>GPT-6</strong><small>Coordenador</small></div>
        <div><span className="agent-dot agent-dot-phone" /><strong>AI-PHONE-02</strong><small>Participante esperado</small></div>
      </div>

      <div className="simple-room-messages" aria-live="polite">
        {messages.length === 0
          ? <div className="simple-room-empty"><strong>A conversa aparecerá aqui.</strong><p>Conecte-se a uma sala válida para carregar e enviar mensagens.</p></div>
          : messages.map(message => (
            <article className="simple-room-message" key={message.message_id}>
              <div className="simple-room-message-meta">
                <strong>{message.sender_display_name || message.sender_principal_id}</strong>
                <time>{new Date(message.created_at).toLocaleString("pt-BR")}</time>
              </div>
              <p>{message.body}</p>
              <button className="text-action" onClick={() => speak(message.body)}>🔊 Ouvir mensagem</button>
            </article>
          ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="simple-room-composer">
        <label htmlFor="team-room-draft">Sua mensagem</label>
        <textarea id="team-room-draft" value={draft} onChange={event => setDraft(event.target.value)} rows={5} placeholder="Digite uma mensagem ou use o microfone para ditar..." />
        <div className="simple-room-compose-actions">
          {listening
            ? <button onClick={stopDictation}>Parar microfone</button>
            : <button onClick={startDictation} disabled={!voiceSupported}>🎙️ Falar</button>}
          <button onClick={() => speak(draft)} disabled={!draft.trim()}>🔊 Ouvir texto</button>
          <button className="primary" onClick={() => void sendMessage()} disabled={!connected || !draft.trim()}>Enviar mensagem</button>
        </div>
        <small className="muted">{voiceSupported ? "Ditado e leitura em voz alta disponíveis conforme suporte/permissões do navegador." : "Voz nativa não detectada. O ditado do teclado Android pode ser usado no campo de texto."}</small>
      </div>

      <p className="simple-room-disclaimer">O microfone nesta etapa transforma fala em texto e a leitura reproduz texto localmente. Ainda não é uma chamada de áudio em tempo real entre GPT-6 e o processo AI-PHONE-02.</p>
    </section>
  );
}
