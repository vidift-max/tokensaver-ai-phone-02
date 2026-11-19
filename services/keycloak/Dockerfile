FROM quay.io/keycloak/keycloak:26.3.5 AS builder
RUN /opt/keycloak/bin/kc.sh build --db=postgres

FROM quay.io/keycloak/keycloak:26.3.5
COPY --from=builder /opt/keycloak/ /opt/keycloak/
COPY --chmod=0755 services/keycloak/start.sh /opt/keycloak/bin/render-start.sh
ENTRYPOINT ["/opt/keycloak/bin/render-start.sh"]
