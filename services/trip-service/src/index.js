import http from 'node:http';

const port = Number(process.env.TRIP_SERVICE_PORT || 4010);

const server = http.createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ service: 'trip-service', status: 'ok' }));
    return;
  }

  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ service: 'trip-service', status: 'ready' }));
});

server.listen(port, () => {
  console.log(`trip-service placeholder listening on ${port}`);
});

// TODO: Bổ sung search trips sau.