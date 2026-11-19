FROM quay.io/keycloak/keycloak:26.3.5 AS builder
RUN /opt/keycloak/bin/kc.sh build --db=postgres

FROM quay.io/keycloak/keycloak:26.3.5
COPY --from=builder /opt/keycloak/ /opt/keycloak/
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start","--optimized","--http-enabled=true","--http-port=10000","--proxy-headers=xforwarded"]
