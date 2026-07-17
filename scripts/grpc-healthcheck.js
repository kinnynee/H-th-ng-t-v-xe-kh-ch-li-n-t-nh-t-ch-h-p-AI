import path from "node:path";
import { fileURLToPath } from "node:url";
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";

const [address, serviceName] = process.argv.slice(2);
if (!address || !serviceName) {
  console.error("Usage: node scripts/grpc-healthcheck.js <host:port> <service-name>");
  process.exit(2);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const protoPath = path.resolve(__dirname, "../proto/health.proto");
const definition = protoLoader.loadSync(protoPath, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const Health = grpc.loadPackageDefinition(definition).grpc.health.v1.Health;
const client = new Health(address, grpc.credentials.createInsecure());
const deadline = new Date(Date.now() + 4_000);

client.check({ service: serviceName }, { deadline }, (error, response) => {
  client.close();
  if (error || response.status !== "SERVING") {
    console.error(error?.message || `${serviceName} is ${response.status}`);
    process.exitCode = 1;
  }
});
