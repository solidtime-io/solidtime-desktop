#!/bin/bash
set -e

# Start a session DBus daemon and export its address
eval "$(dbus-launch --sh-syntax)"
export DBUS_SESSION_BUS_ADDRESS

echo "DBus session bus started at: $DBUS_SESSION_BUS_ADDRESS"

# Install dependencies. The node_modules volume is separate from the host's
# so native binaries are compiled for Linux. We check for vitest as a marker
# that deps have been installed.
cd /app
if [ ! -f node_modules/.package-lock.json ]; then
    echo "Installing dependencies..."
    npm ci
fi

# Run only the dbus integration tests
exec npx vitest run --config vitest.config.ts 'dbus' "$@"
