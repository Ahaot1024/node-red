#!/bin/sh
mkdir -p /app/nziot/data/node_modules
cp -r /app/nziot/nziot-flow-runner /app/nziot/data/node_modules/
exec "$@"
