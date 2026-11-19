FROM quay.io/keycloak/keycloak:26.3.5

ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start","--http-enabled=true","--http-port=10000","--proxy-headers=xforwarded"]
