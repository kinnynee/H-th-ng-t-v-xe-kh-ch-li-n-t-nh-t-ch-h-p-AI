import express from "express";
import cors from "cors";
import config from "./config/env.js";
import chatRoutes from "./routes/chatRoutes.js";

import { createGrpcServer } from "./routes/grpcRoutes.js";
import grpc from "@grpc/grpc-js";

const app = express();
app.use(cors());
app.use(express.json());

// Mount tất cả routes
app.use(chatRoutes);

app.listen(config.port, () => {
  console.log(`[ai-service] HTTP listening on http://localhost:${config.port}`);
});

// Start gRPC server
const grpcServer = createGrpcServer();
const grpcPort = 50052;
grpcServer.bindAsync(`0.0.0.0:${grpcPort}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
  if (err) {
    console.error(`[ai-service] Failed to start gRPC server:`, err);
    return;
  }
  console.log(`[ai-service] gRPC listening on 0.0.0.0:${port}`);
});
