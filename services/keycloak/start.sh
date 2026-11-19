#!/bin/sh
set -eu
case "${KC_DB_URL:-}" in
  postgres://*) export KC_DB_URL="jdbc:postgresql://${KC_DB_URL#postgres://}" ;;
  postgresql://*) export KC_DB_URL="jdbc:postgresql://${KC_DB_URL#postgresql://}" ;;
esac
exec /opt/keycloak/bin/kc.sh start --optimized --http-enabled=true --http-port=10000 --proxy-headers=xforwarded
