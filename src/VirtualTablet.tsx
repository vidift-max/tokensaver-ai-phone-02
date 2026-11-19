import { useEffect, useState } from "react";
import TeamRoom from "./TeamRoom";

type AgentState = "READY" | "WAITING" | "CONNECTED";

function AgentCard({ name, role, state, detail }: { name: string; role: string; state: AgentState; detail: string }) {
  return (
    <article className="virtual-agent-card">
      <div className="virtual-agent-icon">{name === "GPT-6" ? "G6" : "02"}</div>
      <div className="virtual-agent-copy">
        <strong>{name}</strong>
        <span>{role}</span>
        <small>{detail}</small>
      </div>
      <b className={"virtual-agent-state virtual-agent-state-" + state.toLowerCase()}>{state}</b>
    </article>
  );
}

export default function VirtualTablet() {
  const [installed, setInstalled] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setStandalone(window.matchMedia("(display-mode: standalone)").matches);
    setInstalled(Boolean(localStorage.getItem("phone02-tablet-installed")));
  }, []);

  function installHint() {
    localStorage.setItem("phone02-tablet-installed", "1");
    setInstalled(true);
  }

  return (
    <section className="virtual-tablet-shell">
      <div className="virtual-tablet-device">
        <header className="virtual-tablet-topbar">
          <div>
            <span className="eyebrow">AI-PHONE-02 · TABLET VIRTUAL</span>
            <h2>Central de trabalho das duas IAs</h2>
            <p className="muted">Interface única para manter GPT-6 e AI-PHONE-02 no mesmo canal persistente.</p>
          </div>
          <div className="virtual-tablet-actions">
            <span className="virtual-tablet-mode">{standalone ? "APP INSTALADO" : "NAVEGADOR"}</span>
            {!installed && !standalone && <button onClick={installHint}>Marcar como pronto para instalar</button>}
          </div>
        </header>

        <div className="virtual-agent-grid">
          <AgentCard name="GPT-6" role="Phone-01 · coordenador" state="READY" detail="Agente externo ao tablet; o canal recebe as mensagens dele." />
          <AgentCard name="AI-PHONE-02" role="Phone-02 · agente independente" state="WAITING" detail="Aguardando sessão autenticada real do Phone-02." />
        </div>

        <div className="virtual-tablet-banner">
          <strong>Regra de identidade</strong>
          <span>A tela não cria uma segunda IA. O estado só vira CONNECTED quando o servidor autenticar a sessão independente do AI-PHONE-02.</span>
        </div>

        <TeamRoom />

        <footer className="virtual-tablet-footer">
          <span>Texto: pronto</span>
          <span>Microfone: navegador</span>
          <span>Voz: reprodução local</span>
          <span>Identidade real: depende do runtime autenticado</span>
        </footer>
      </div>
    </section>
  );
}
