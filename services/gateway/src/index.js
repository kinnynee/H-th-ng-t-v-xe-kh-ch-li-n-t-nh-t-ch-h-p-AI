import http from 'node:http';

const port = Number(process.env.GRAPHQL_PORT || 4000);

const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(
    JSON.stringify({
      service: 'graphql-gateway',
      status: 'ready',
    })
  );
});

server.listen(port, () => {
  console.log(`graphql-gateway placeholder listening on ${port}`);
});

// TODO: Bổ sung GraphQL schema/resolver sau.