-- Each agent's own wallet (2026-09-23).
--
-- An agent's wallet is a USDC token account the OWNER owns, at an address derived from the owner's key and the agent's
-- id (`PublicKey.createWithSeed`), funded by the owner and approved to the bot's delegate. The chain holds the money
-- and enforces the budget — the bot can move at most what is in the account — and the owner can take it back, or stop
-- it with the same revoke that stops everything else. This column records that the account exists and was funded
-- through xorr; the address itself is derivable, and the balance is always read from the chain.
ALTER TABLE agents ADD COLUMN IF NOT EXISTS wallet_account TEXT;
