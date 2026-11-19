FROM quay.io/keycloak/keycloak:26.3.5 AS builder
RUN /opt/keycloak/bin/kc.sh build --db=postgres

FROM quay.io/keycloak/keycloak:26.3.5
COPY --from=builder /opt/keycloak/ /opt/keycloak/
COPY services/keycloak/start.sh /opt/keycloak/bin/render-start.sh
RUN chmod 0755 /opt/keycloak/bin/render-start.sh
ENTRYPOINT ["/opt/keycloak/bin/render-start.sh"]
