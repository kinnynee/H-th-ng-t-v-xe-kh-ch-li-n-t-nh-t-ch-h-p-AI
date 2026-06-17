import http from 'node:http';

const port = Number(process.env.SEAT_SERVICE_PORT || 4030);

const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ service: 'seat-service', status: 'placeholder' }));
});

server.listen(port, () => {
  console.log(`seat-service placeholder listening on ${port}`);
});

// TODO: Bổ sung gRPC SeatInventoryService sau.