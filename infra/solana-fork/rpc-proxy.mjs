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
