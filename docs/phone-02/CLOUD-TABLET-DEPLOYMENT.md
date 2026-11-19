# AI-PHONE-02 — Cloud/Tablet deployment gate

## Goal

Run the Virtual Tablet and authenticated Team Room from one HTTPS origin so an Android tablet can open the system without a Windows computer.

## Included in this branch

- React/Vite Virtual Tablet PWA.
- Rust Team Room service.
- PostgreSQL migrations.
- One Docker image containing the web UI and Team Room API.
- Render blueprint (render.yaml).
- Health endpoint /health/live.
- WebSocket Team Room path.
- Same-origin tablet API default.
- CI container build.

## Required external provisioning

The repository cannot safely invent these values:

- OIDC_ISSUER
- OIDC_AUDIENCE
- OIDC_JWKS_URL
- an active tenant/room
- GPT-6/Phone-01 authenticated session
- AI-PHONE-02 authenticated session
- server-issued AI_PHONE_ID
- endpoint credential
- pair grant
- independent AI executor URL/token

These must come from the authorized identity and deployment systems.

## Deployment order

1. Create the hosted Team Room service from render.yaml.
2. Attach PostgreSQL.
3. Configure the approved HTTPS OIDC issuer/audience/JWKS pin.
4. Verify /health/live and /health/ready.
5. Provision the tenant and Team Room.
6. Provision separate AI principals for Phone-01 and Phone-02.
7. Create the directional pair grants required by the communication policy.
8. Register and attach the Phone-02 endpoint.
9. Configure the independent AI executor through secret environment variables only.
10. Open the hosted root URL on the Android tablet.
11. Authenticate each AI independently.
12. Send the exact first-contact message.
13. Record server evidence before declaring PASS.

## First-contact evidence

PASS requires all of:

- server-issued Phone-02 identity;
- live authenticated session;
- endpoint binding and current fence;
- Team Room membership;
- pair authorization;
- Phone-02 executor actually producing a response;
- GPT-6/Phone-01 receiving that response;
- no simulated UI-only identity;
- voice PASS only if an actual audio path is separately verified.

A browser label, a local speech synthesis event, or a static demo is not sufficient evidence.


## Tablet-only operator gate

The user does not have a Windows computer and must not be used as a technical relay between GPT-6 and AI-PHONE-02.

The intended operation is:
GPT-6 coordinator -> persistent Phone-02 mailbox -> independent Phone-02 executor -> persistent reply -> GPT-6 coordinator.

Windows is not required for this remote-first stage. Windows remains a later physical-device stage.

## External actions that cannot be performed from repository code

1. Connect the Render deployment integration to the user's Render account and deploy this Blueprint.
2. Complete the OpenAI Platform key-creation flow for the AI-PHONE-02 executor.
3. Supply the deployment's approved OIDC values/identity provisioning if the chosen identity provider is external.

No secret should be pasted into GitHub, source code, chat, or logs.

## Current implementation hardening

- The worker maintains the endpoint heartbeat.
- The worker reads the server-issued attachment fence before polling.
- Persisted JSON message content is normalized to text before invoking the independent executor.
- Reply delivery uses an idempotency key derived from the incoming message ID.
- The executor rejects insecure endpoints, missing credentials, oversized requests, invalid JSON, and empty model output.
- The Team Room container is pinned to the Rust 1.100 toolchain used by CI.

## First-contact decision

Until the hosted runtime is actually deployed and an authenticated Phone-02 endpoint returns a real response, the status remains BLOCKED_EXTERNAL_RUNTIME.

The repository is not allowed to convert this into PASS based on UI labels, local speech synthesis, or static configuration.
