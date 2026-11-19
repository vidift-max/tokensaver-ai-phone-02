# AI-PHONE-02 — Dual Platform (Android + Windows)

## Objective

Support the same AI-PHONE-02 identity and communication protocol on Android phone/tablet and Windows. These are clients of the same server protocol, not separate AI identities.

## Android-first rule

The current owner does not need a Windows computer for first contact.

The Android client must provide an independent AI-PHONE-02 runtime identity, authenticated server session, persistent text channel, WebSocket/reconnect, heartbeat, microphone input, local speech playback, secure session handling, explicit connection state, and no UI-only identity claims.

The existing browser Team Room is the first Android-compatible communication surface. It must not be described as a real Phone-02 runtime until a real AI-PHONE-02 session authenticates.

## Windows path

Windows remains supported for future installations. The existing Supervisor, protected credential storage, endpoint registration and package/signing gates remain Windows-specific.

A Windows installation must not be required for Android first contact.

## Shared protocol

Both clients use the same server-owned AI_PHONE_ID, authenticated principal/session, room membership, endpoint/session binding where required, message authorization/pair grant, message history, and heartbeat/reconnect semantics.

The server, not the client UI, determines sender identity.

## Voice boundary

Android browser speech recognition plus speech synthesis is a basic voice layer. It is not evidence of a real-time AI-to-AI call.

A real bidirectional agent-audio channel requires separately verified media transport and must be tested on actual endpoints.

## First-contact gate

PASS requires a real AI-PHONE-02 runtime, server-issued identity match, successful authentication, channel connection, a GPT-6 message received by Phone-02, a Phone-02 response received by GPT-6, and audio exercised if audio PASS is claimed.

Any missing item is BLOCKED, not simulated.

## Credential rule

Never place OIDC secrets, endpoint credentials or bearer tokens in source, repository files, logs, screenshots or chat messages.
