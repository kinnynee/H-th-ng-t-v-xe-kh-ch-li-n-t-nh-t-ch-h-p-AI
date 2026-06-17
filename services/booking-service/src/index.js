import http from 'node:http';

const port = Number(process.env.BOOKING_SERVICE_PORT || 4020);

const server = http.createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ service: 'booking-service', status: 'ok' }));
    return;
  }

  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ service: 'booking-service', status: 'ready' }));
});

server.listen(port, () => {
  console.log(`booking-service placeholder listening on ${port}`);
});

// TODO: Bổ sung booking/payment sau.