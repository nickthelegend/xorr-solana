-- Which agent armed each exit (2026-09-23).
--
-- An agent's entry arms a stop-loss and take-profit, and nothing recorded whose it was: Momentum Scout's profile read
-- "Nothing running yet" beside ten trades and five live exits, and those exits were listed under Drawdown Guard, an
-- agent nobody had hired. New exits carry `params.armedBy`; this backfills the ones already armed, from the agent's own
-- decision record — `proposals.payload.exitStrategyId` names the exit each autonomous entry created. Nothing is
-- guessed: an exit with no decision record naming it is left as it is.
UPDATE strategies s
   SET params = s.params || jsonb_build_object('armedBy', p.agent)
  FROM proposals p
 WHERE s.kind = 'exit-rules'
   AND NOT (s.params ? 'armedBy')
   AND p.payload->>'exitStrategyId' = s.id;

-- And one agent exit per holding. An exit sells the whole holding, so two agent exits on one stock is one too many:
-- whichever triggered first sold it all, and the other stayed live to fire on shares bought later, at levels written
-- for an entry that was gone. The newest agent exit on each holding stays; the older ones end. An exit the owner set by
-- hand has no `armedBy` and is not touched.
UPDATE strategies s
   SET state = 'ended'
 WHERE s.kind = 'exit-rules'
   AND s.state = 'live'
   AND s.params ? 'armedBy'
   AND EXISTS (
     SELECT 1 FROM strategies n
      WHERE n.wallet_id = s.wallet_id
        AND n.symbol = s.symbol
        AND n.chain = s.chain
        AND n.kind = 'exit-rules'
        AND n.state = 'live'
        AND n.params ? 'armedBy'
        AND (n.created_at > s.created_at OR (n.created_at = s.created_at AND n.id > s.id))
   );
