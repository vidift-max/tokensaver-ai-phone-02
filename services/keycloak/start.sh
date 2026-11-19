#!/bin/sh
set -eu
case "${KC_DB_URL:-}" in
  postgres://*|postgresql://*)
    raw="${KC_DB_URL#*://}"
    db_user="${raw%%:*}"
    rest="${raw#*:}"
    db_password="${rest%@*}"
    host_db="${rest##*@}"
    export KC_DB_USERNAME="$db_user"
    export KC_DB_PASSWORD="$db_password"
    export KC_DB_URL="jdbc:postgresql://$host_db"
    ;;
esac
exec /opt/keycloak/bin/kc.sh start --optimized --http-enabled=true --http-port=10000 --proxy-headers=xforwarded
