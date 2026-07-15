import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import { bindGrpcServer, createServiceGrpcServer } from "@bus-ai/shared/grpc";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const protoDirectory = path.resolve(__dirname, "../proto");
const load = (name) => grpc.loadPackageDefinition(protoLoader.loadSync(path.join(protoDirectory, name), {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
}));
const ServiceRouter = load("service_router.proto").bus.platform.v1.ServiceRouter;
const Health = load("health.proto").grpc.health.v1.Health;

function unary(invoke, request) {
  return new Promise((resolve, reject) => {
    invoke(request, (error, response) => (error ? reject(error) : resolve(response)));
  });
}

test("common gRPC router supports every RPC style and standard health", async (t) => {
  const server = createServiceGrpcServer({
    serviceName: "router-test",
    health: async () => ({ ok: true, details: { dependency: "ready" } })
  });
  const port = await bindGrpcServer(server, "127.0.0.1:0", "router-test");
  const address = `127.0.0.1:${port}`;
  const router = new ServiceRouter(address, grpc.credentials.createInsecure());
  const health = new Health(address, grpc.credentials.createInsecure());

  t.after(() => {
    router.close();
    health.close();
    server.forceShutdown();
  });

  const info = await unary(router.getServiceInfo.bind(router), {});
  assert.equal(info.serviceName, "router-test");
  assert.equal(info.ok, true);
  assert.equal(info.details.dependency, "ready");

  const watched = await new Promise((resolve, reject) => {
    const call = router.watchServiceStatus({ intervalSeconds: 1 });
    call.once("data", (response) => {
      call.cancel();
      resolve(response);
    });
    call.once("error", reject);
  });
  assert.equal(watched.status, "SERVING");

  const reported = await new Promise((resolve, reject) => {
    const call = router.reportSignals((error, response) => (error ? reject(error) : resolve(response)));
    call.write({ type: "CACHE_READY", payloadJson: "{}", sentAt: new Date().toISOString() });
    call.write({ type: "DATABASE_READY", payloadJson: "{}", sentAt: new Date().toISOString() });
    call.end();
  });
  assert.equal(reported.receivedCount, 2);
  assert.deepEqual(reported.signalTypes, ["CACHE_READY", "DATABASE_READY"]);

  const acknowledgement = await new Promise((resolve, reject) => {
    const call = router.connectSignals();
    call.once("data", (response) => {
      call.end();
      resolve(response);
    });
    call.once("error", reject);
    call.write({ type: "PING", payloadJson: "{}", sentAt: new Date().toISOString() });
  });
  assert.equal(acknowledgement.type, "PING");
  assert.equal(acknowledgement.sequence, 1);

  const healthStatus = await unary(health.check.bind(health), { service: "router-test" });
  assert.equal(healthStatus.status, "SERVING");
});
