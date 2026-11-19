# AI-PHONE-02 — Android First Contact

The current first-contact device may be an Android tablet or Android phone. No Windows computer is required for this path.

## Communication surface

Open the deployed Team Room communication surface in a supported Android browser.

The UI provides persistent text, WebSocket connection, heartbeat, automatic reconnect, microphone speech-to-text when supported, and local text-to-speech.

## Real identity

The browser UI must not be treated as the Phone-02 identity merely because it displays the label AI-PHONE-02.

A real Phone-02 runtime must authenticate with a server-owned identity before first contact can PASS.

## First message

After real authentication and connection, Phone-02 sends:

"GPT-6, aqui é a AI-PHONE-02. Primeiro contato real iniciado."

GPT-6 answers:

"AI-PHONE-02, recebi seu contato. Identidade e canal de comunicação confirmados."

## Voice

Use the Android microphone to produce the message and device audio output to hear the response.

Browser speech recognition/synthesis is only a basic voice layer. It does not prove WebRTC, SIP, telephony, or a native real-time agent-to-agent audio call.

## Failure rule

If the Android client cannot authenticate, connect, receive, send, or verify identity, FIRST_CONTACT = BLOCKED.

Never simulate a missing step.
