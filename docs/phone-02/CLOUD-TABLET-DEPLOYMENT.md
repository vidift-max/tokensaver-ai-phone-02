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
