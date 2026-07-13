import path from "node:path";
import { fileURLToPath } from "node:url";
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const protoDirectory = path.resolve(__dirname, "../../../proto");
const loaderOptions = {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
};

export function loadGrpcProto(fileName) {
  const protoPath = path.resolve(protoDirectory, fileName);
  if (!protoPath.startsWith(`${protoDirectory}${path.sep}`)) {
    throw new Error("The gRPC proto must be inside the repository proto directory");
  }
  return grpc.loadPackageDefinition(protoLoader.loadSync(protoPath, loaderOptions));
}

const routerProto = loadGrpcProto("service_router.proto");
const healthProto = loadGrpcProto("health.proto");
const routerService = routerProto.bus.platform.v1.ServiceRouter.service;
const healthService = healthProto.grpc.health.v1.Health.service;

function grpcError(error) {
  return {
    code: grpc.status.INTERNAL,
    message: error instanceof Error ? error.message : String(error)
  };
}

function detailsOf(health = {}) {
  const ignored = new Set(["ok", "service", "serviceName", "status", "message", "details"]);
  return {
    ...Object.fromEntries(
      Object.entries(health)
        .filter(([key, value]) => !ignored.has(key) && value !== undefined && value !== null)
        .map(([key, value]) => [key, String(value)])
    ),
    ...Object.fromEntries(
      Object.entries(health.details ?? {})
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [key, String(value)])
    )
  };
}

async function readHealth(serviceName, health) {
  try {
    const value = await health();
    const ok = value?.ok !== false;
    return {
      serviceName,
      ok,
      status: value?.status ?? (ok ? "SERVING" : "NOT_SERVING"),
      checkedAt: new Date().toISOString(),
      details: detailsOf(value),
      message: value?.message ?? ""
    };
  } catch (error) {
    return {
      serviceName,
      ok: false,
      status: "NOT_SERVING",
      checkedAt: new Date().toISOString(),
      details: { error: error instanceof Error ? error.message : String(error) },
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

function stopWhenStreamEnds(call, stop) {
  call.on("cancelled", stop);
  call.on("error", stop);
  call.on("close", stop);
}

function createServiceRouter({ serviceName, health }) {
  return {
    getServiceInfo: async (_call, callback) => {
      callback(null, await readHealth(serviceName, health));
    },

    watchServiceStatus: (call) => {
      let stopped = false;
      const intervalSeconds = Math.min(60, Math.max(1, Number(call.request.intervalSeconds || 5)));
      const stop = () => {
        if (stopped) return;
        stopped = true;
        clearInterval(timer);
      };
      const send = async () => {
        if (!stopped) call.write(await readHealth(serviceName, health));
      };
      const timer = setInterval(() => send().catch(stop), intervalSeconds * 1_000);
      timer.unref?.();
      stopWhenStreamEnds(call, stop);
      send().catch(stop);
    },

    reportSignals: (call, callback) => {
      const signalTypes = [];
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        callback(null, {
          serviceName,
          receivedCount: signalTypes.length,
          signalTypes,
          lastReceivedAt: new Date().toISOString()
        });
      };
      call.on("data", (signal) => {
        signalTypes.push(signal.type || "unknown");
      });
      call.on("end", finish);
      call.on("cancelled", finish);
      call.on("error", (error) => {
        if (!finished) {
          finished = true;
          callback(grpcError(error));
        }
      });
    },

    connectSignals: (call) => {
      let stopped = false;
      let sequence = 0;
      const stop = () => { stopped = true; };
      stopWhenStreamEnds(call, stop);
      call.on("data", (signal) => {
        if (stopped) return;
        sequence += 1;
        call.write({
          serviceName,
          type: signal.type || "unknown",
          sequence,
          receivedAt: new Date().toISOString()
        });
      });
      call.on("end", () => {
        if (!stopped) call.end();
        stop();
      });
    }
  };
}

function createHealthRouter({ serviceName, health }) {
  const healthStatus = async (requestedService) => {
    if (requestedService && requestedService !== serviceName) return "SERVICE_UNKNOWN";
    const snapshot = await readHealth(serviceName, health);
    return snapshot.ok ? "SERVING" : "NOT_SERVING";
  };

  return {
    check: async (call, callback) => {
      try {
        callback(null, { status: await healthStatus(call.request.service) });
      } catch (error) {
        callback(grpcError(error));
      }
    },

    watch: (call) => {
      let stopped = false;
      const stop = () => {
        if (stopped) return;
        stopped = true;
        clearInterval(timer);
      };
      const send = async () => {
        if (!stopped) call.write({ status: await healthStatus(call.request.service) });
      };
      const timer = setInterval(() => send().catch(stop), 5_000);
      timer.unref?.();
      stopWhenStreamEnds(call, stop);
      send().catch(stop);
    }
  };
}

/** Registers the four gRPC router styles plus the standard gRPC Health API. */
export function createServiceGrpcServer({ serviceName, health = async () => ({ ok: true }) }) {
  const server = new grpc.Server();
  server.addService(routerService, createServiceRouter({ serviceName, health }));
  server.addService(healthService, createHealthRouter({ serviceName, health }));
  return server;
}

export function bindGrpcServer(server, bindAddress, serviceName = "service") {
  return new Promise((resolve, reject) => {
    server.bindAsync(bindAddress, grpc.ServerCredentials.createInsecure(), (error, port) => {
      if (error) {
        reject(error);
        return;
      }
      // Stderr keeps MCP's stdout transport free of diagnostic output.
      console.error(`[${serviceName}] gRPC listening on ${bindAddress} (${port})`);
      resolve(port);
    });
  });
}

/** Convenience bootstrap for services that only need the common gRPC router. */
export async function startGrpcServer({ serviceName, bindAddress, check }) {
  const server = createServiceGrpcServer({ serviceName, health: check });
  await bindGrpcServer(server, bindAddress, serviceName);
  return server;
}
