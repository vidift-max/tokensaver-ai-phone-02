# AI-PHONE-02 — Virtual Tablet readiness

## Implemented

- A dedicated **Virtual Tablet** workspace is now available in the React application.
- The workspace presents GPT-6 / Phone-01 and AI-PHONE-02 / Phone-02 as separate agent identities.
- The shared communication surface remains the existing authenticated Team Room channel.
- The tablet UI is PWA-ready through `manifest.webmanifest` and `sw.js`.
- Service-worker registration is enabled from `src/main.tsx`.
- Text messaging, automatic reconnect, heartbeat, browser dictation and local speech playback remain available in the Team Room.
- A dedicated CI workflow validates the Vite/PWA build on the tablet-first branch.

## Identity boundary

The virtual tablet is an interface, not an identity generator.

The following are deliberately **not** claimed by the UI alone:

- a real AI-PHONE-02 runtime;
- a server-issued AI_PHONE_ID;
- a live authenticated Phone-02 endpoint;
- a real GPT-6 ↔ AI-PHONE-02 first-contact message;
- real-time agent-to-agent audio.

Those require the independent Phone-02 runtime to authenticate to the deployed Team Room service.

## Intended operation

1. Open the Virtual Tablet on Android.
2. The tablet loads the workspace.
3. GPT-6 and AI-PHONE-02 remain separate identities.
4. The server authenticates each identity independently.
5. Team Room carries messages persistently.
6. Browser microphone/speech is the first voice layer.
7. A real audio call can be added later without changing the identity model.

## Current gate

**TABLET UI: READY**

**REAL AI-PHONE-02 RUNTIME: BLOCKED until an independent authenticated runtime and deployed Team Room endpoint are available.**

No simulated message is accepted as first-contact evidence.
