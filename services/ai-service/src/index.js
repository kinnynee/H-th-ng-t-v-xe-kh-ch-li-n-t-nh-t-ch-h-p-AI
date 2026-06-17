import http from 'node:http';

const port = Number(process.env.AI_SERVICE_PORT || 4100);

const server = http.createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ service: 'ai-service', status: 'ok' }));
    return;
  }

  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ service: 'ai-service', status: 'ready' }));
});

server.listen(port, () => {
  console.log(`ai-service placeholder listening on ${port}`);
});

// TODO: Bổ sung chatbot AI sau.