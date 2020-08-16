#!/usr/bin/env sh
set -eu

envsubst '${DOMAIN} ${NAMESPACE}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

exec "$@"
