# The Solana mainnet fork behind the hosted xorr-solana executor (PLAN.md §10, phase 6) — rebuilt 2026-09-19.
#
# Build context is the REPOSITORY ROOT (`docker build -f infra/solana-fork/Dockerfile .`), because the fork is stood up
# by the same bootstrap the tests and the README use (`server/src/solana/fork-bootstrap.ts`): real mainnet USDC and
# xStocks, Jupiter v6 and today's routes resolved live from Jupiter, a test-USDC mint authority, a funded venue vault.
# The previous image cloned a fixed list with Circle's real mint authority (so no faucet could work) and no routes.
#
# One public port: `rpc-proxy.mjs` serves JSON-RPC and upgrades websockets onto the validator's second port, because a
# Railway service exposes one port and the app's confirmations subscribe over a websocket.

FROM public.ecr.aws/docker/library/node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends curl bzip2 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Agave 2.3: 3.x hard-requires io_uring, which Railway's containers do not provide (the validator panics at start,
# `assertion failed: io_uring_supported()`). The fork clones mainnet's own Token-2022 program, so an older validator's
# bundled one does not decide how xStocks (Scaled UI) behave.
ARG SOLANA_RELEASE=v2.3.13
RUN sh -c "$(curl -sSfL https://release.anza.xyz/${SOLANA_RELEASE}/install)"
ENV PATH="/root/.local/share/solana/install/active_release/bin:${PATH}"

WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
# `npm install` from the lockfile rather than `npm ci`: the container's npm finds optional peer entries missing from a
# lockfile the developers' npm accepts, and refuses outright; install resolves them and keeps every locked version.
RUN npm install --no-audit --no-fund
COPY server/tsconfig.json ./
COPY server/src ./src
COPY infra/solana-fork/entrypoint.sh /usr/local/bin/fork-entrypoint
COPY infra/solana-fork/rpc-proxy.mjs /app/rpc-proxy.mjs
RUN chmod 0755 /usr/local/bin/fork-entrypoint

ENTRYPOINT ["/usr/local/bin/fork-entrypoint"]
