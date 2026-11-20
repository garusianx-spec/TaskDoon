const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const NEXT_PORT = 3001;

const server = http.createServer((req, res) => {
  if (req.url === '/api/health') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    res.end('{"status":"ok"}');
    return;
  }

  const proxyReq = http.request(
    {
      hostname: '127.0.0.1',
      port: NEXT_PORT,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on('error', () => {
    res.writeHead(502);
    res.end('Bad Gateway');
  });

  req.pipe(proxyReq);
});

server.on('upgrade', (req, socket, head) => {
  const proxySocket = net.connect(NEXT_PORT, '127.0.0.1', () => {
    proxySocket.write(head);
    socket.pipe(proxySocket).pipe(socket);
  });
  proxySocket.on('error', () => socket.destroy());
});

server.listen(PORT, '0.0.0.0', () => {
  process.env.PORT = String(NEXT_PORT);
  process.env.HOSTNAME = '127.0.0.1';
  const serverPath = path.resolve(__dirname, 'server.js');
  require(serverPath);
});
