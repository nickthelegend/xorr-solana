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
