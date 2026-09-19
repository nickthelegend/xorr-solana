# The Solana mainnet fork behind the hosted xorr-solana executor (PLAN.md §10, phase 6) — rebuilt 2026-09-19.
#
# Build context is the REPOSITORY ROOT (`docker build -f infra/solana-fork/Dockerfile .`), because the fork is stood up
# by the same bootstrap the tests and the README use (`server/src/solana/fork-bootstrap.ts`): real mainnet USDC and
# xStocks, Jupiter v6 and today's routes resolved live from Jupiter, a test-USDC mint authority, a funded venue vault.
# The previous image cloned a fixed list with Circle's real mint authority (so no faucet could work) and no routes.
#
# One public port: `rpc-proxy.mjs` serves JSON-RPC and upgrades websockets onto the validator's second port, because a
# Railway service exposes one port and the app's confirmations subscribe over a websocket.

FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends curl bzip2 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Anza (Agave) release, as the CI job installs it.
ARG SOLANA_RELEASE=stable
RUN sh -c "$(curl -sSfL https://release.anza.xyz/${SOLANA_RELEASE}/install)"
ENV PATH="/root/.local/share/solana/install/active_release/bin:${PATH}"

WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY server/tsconfig.json ./
COPY server/src ./src
COPY infra/solana-fork/entrypoint.sh /usr/local/bin/fork-entrypoint
COPY infra/solana-fork/rpc-proxy.mjs /app/rpc-proxy.mjs
RUN chmod 0755 /usr/local/bin/fork-entrypoint

ENTRYPOINT ["/usr/local/bin/fork-entrypoint"]
