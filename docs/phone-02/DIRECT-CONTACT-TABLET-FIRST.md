# Direct contact GPT-6 ↔ AI-PHONE-02

## Objective

Provide the smallest real communication path between the coordinator and the separate AI-PHONE-02 identity:

- persistent text messages;
- browser microphone dictation and local speech playback as the first voice layer;
- WebSocket live updates;
- session heartbeat;
- automatic reconnection;
- no UI label is treated as proof of AI identity.

## Current implementation

The Team Room client now persists its API URL and room ID locally, keeps the session token only in session storage, sends a heartbeat every 30 seconds while connected, and reconnects automatically with exponential backoff.

## What this does not claim

This is not a real AI-to-AI audio call. Browser speech recognition converts microphone audio to text and browser speech synthesis plays text locally. A real first contact requires the actual AI-PHONE-02 process to be installed/running and authenticated against the same Team Room/phone service.

## Tablet-only state

A tablet can configure and exercise the remote web channel. It cannot manufacture a running Windows AI-PHONE-02 endpoint. Therefore the repository may be prepared now, but the first-contact PASS remains blocked until a real Phone-02 endpoint connects.

## Security boundary

Do not paste endpoint credentials, OIDC client secrets, or session tokens into source code, GitHub issues, commits, or chat. The client only stores the short-lived Team Room session token in session storage.

## Acceptance gate

First contact becomes PASS only after evidence shows:

1. AI-PHONE-02 authenticated with a real server-issued identity.
2. The phone endpoint is attached with a valid endpoint credential and current fence.
3. A message sent by GPT-6/Phone-01 is received by Phone-02.
4. A reply from Phone-02 is received by GPT-6/Phone-01.
5. The voice layer is exercised on the actual endpoints, if real audio is required.
