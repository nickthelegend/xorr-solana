/**
 * One public port for the fork: JSON-RPC to the validator's RPC port, websocket upgrades to its pubsub port.
 *
 * A Railway service exposes one port. The app confirms its transactions by subscribing over a websocket, which the
 * validator serves one port above its RPC; this forwards both from $PORT. Nothing is rewritten or filtered — the
 * validator's own answers, including its CORS headers, pass through unchanged.
 */
import http from 'node:http';
import net from 'node:net';

const RPC_PORT = 8899;
const WS_PORT = 8900;
const PORT = Number(process.env.PORT ?? 8080);

const server = http.createServer((req, res) => {
  const upstream = http.request(
    { host: '127.0.0.1', port: RPC_PORT, method: req.method, path: req.url, headers: req.headers },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on('error', (e) => {
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end(`fork unavailable: ${e.message}`);
  });
  req.pipe(upstream);
});

server.on('upgrade', (req, socket, head) => {
  const up = net.connect(WS_PORT, '127.0.0.1', () => {
    const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    up.write(lines.join('\r\n') + '\r\n\r\n');
    if (head?.length) up.write(head);
    socket.pipe(up).pipe(socket);
  });
  up.on('error', () => socket.destroy());
  socket.on('error', () => up.destroy());
});

server.listen(PORT, '::', () => console.log(`fork proxy on :${PORT} → rpc :${RPC_PORT}, ws :${WS_PORT}`));

/*
 * A fresh fork once a day (2026-09-24), at FORK_REFRESH_UTC_HOUR when it is set.
 *
 * A running validator cannot re-clone accounts, so its copies of mainnet's pools freeze at boot while mainnet moves on.
 * Jupiter builds each swap against mainnet's current pool, and once the price leaves the tick arrays the fork copied,
 * the route fails on chain (measured: NVDAx `InvalidTickArraySequence` 31 hours after boot). The executor no longer
 * papers over that with a vault fill, so the fork has to stay fresh instead: exiting here lets the service restart,
 * and every start runs the bootstrap again (`--reset`, today's routes). The executor sees the new genesis and resets
 * its book to match (`server/src/fork/solanaReset.ts`). Test balances start over; the app says so.
 */
const REFRESH_HOUR = process.env.FORK_REFRESH_UTC_HOUR;
if (REFRESH_HOUR !== undefined && REFRESH_HOUR !== '') {
  const hour = Number(REFRESH_HOUR);
  if (Number.isInteger(hour) && hour >= 0 && hour < 24) {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour));
    // At least an hour of life, so a fork that booted just before the hour is not thrown away at once.
    while (next.getTime() - now.getTime() < 3_600_000) next.setUTCDate(next.getUTCDate() + 1);
    console.log(`fork refresh scheduled for ${next.toISOString()}`);
    setTimeout(() => {
      console.log('daily refresh: exiting so the service restarts with a fresh clone of mainnet');
      process.exit(1);
    }, next.getTime() - now.getTime());
  } else {
    console.warn(`FORK_REFRESH_UTC_HOUR=${REFRESH_HOUR} is not an hour of the day (0-23); no daily refresh.`);
  }
}
