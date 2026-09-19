#!/bin/bash
#
# Stand up the fork with the repository's bootstrap, then serve it on $PORT through the RPC/websocket proxy.
#
# The keys are required, not derived: on a fork anyone can reach, a delegate or mint authority computed from a public
# seed would let a stranger move every user's delegated USDC (server/src/solana/keys.ts). The same four secrets are set
# on the executor service, so the payer that mints test USDC here is the payer the executor's faucet signs with.

set -euo pipefail

for k in XORR_KEY_PAYER XORR_KEY_DELEGATE XORR_KEY_VENUE_VAULT XORR_KEY_DEV_OWNER; do
  if [ -z "${!k:-}" ]; then
    echo "Refusing to start: $k is not set. Generate a keypair and set it on this service and the executor." >&2
    exit 1
  fi
done

export XORR_CHAIN=solana-fork
export FORK_RPC=http://127.0.0.1:8899
export SOLANA_RPC_URL=$FORK_RPC
DATA="${FORK_DATA_DIR:-/data}"
mkdir -p "$DATA"
cd "$DATA"

echo "Bootstrapping the fork (upstream ${MAINNET_RPC:-https://api.mainnet-beta.solana.com})..."
npx --prefix /app/server tsx /app/server/src/solana/fork-bootstrap.ts

echo "Serving the fork on :${PORT:-8080}"
exec node /app/rpc-proxy.mjs
