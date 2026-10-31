#!/bin/sh
# Run from the repository root. Private files stay in the ignored mode0700 host directory.
set -eu
test -f docker-compose.prod.yml
test -d .local/prod
test ! -e .local/prod/tls/server.key
mkdir -p .local/prod/tls
chmod 700 .local/prod .local/prod/tls
openssl req -x509 -newkey rsa:3072 -nodes -days 30 \
  -subj /CN=localhost \
  -addext 'subjectAltName=DNS:localhost,DNS:storage.localhost,IP:127.0.0.1' \
  -keyout .local/prod/tls/server.key -out .local/prod/tls/server.crt
# Read-only bind secret is consumed by nginx UID101; parent mode0700 protects it on the host.
chmod 444 .local/prod/tls/server.key .local/prod/tls/server.crt
