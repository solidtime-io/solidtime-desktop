FROM node:20-bookworm-slim

# dbus-daemon is needed for a real session bus.
# build-essential + python3 are needed for native npm packages (dbus-next, better-sqlite3, etc.)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        dbus \
        dbus-x11 \
        libdbus-1-dev \
        build-essential \
        python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
