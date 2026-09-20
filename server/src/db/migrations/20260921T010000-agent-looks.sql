-- What the agent saw on its last sweep, per wallet.
--
-- A hired agent that takes nothing had nothing to say for itself: the app read "No agent is trading right now", which
-- is the same sentence a wallet that hired nobody sees. Watching an agent do nothing, an owner cannot tell "it is
-- working and nothing qualifies" from "it is broken" — and neither can anyone judging this.
--
-- One row per wallet, overwritten every sweep: this is a live status, not a history. The trail keeps the history of
-- what the agent DID; this says what it is doing between those moments.
CREATE TABLE IF NOT EXISTS agent_looks (
  wallet_id  TEXT PRIMARY KEY REFERENCES wallets(id) ON DELETE CASCADE,
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The outcome of the sweep as a whole: 'taken' when it traded, otherwise the reason it did not.
  outcome    TEXT NOT NULL,
  -- One sentence for the ticker on Home.
  headline   TEXT NOT NULL,
  -- Every symbol it looked at, with the gate that stopped each one (`SymbolLook[]`).
  looks      JSONB NOT NULL DEFAULT '[]'::jsonb
);
