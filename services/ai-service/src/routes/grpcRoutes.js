import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { aiSdkAssistant } from "../services/aiService.js";
import config from "../config/env.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROTO_PATH = resolve(__dirname, "../../../../proto/ai_service.proto");

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const aiProto = protoDescriptor.bus.ai.v1;

/**
 * Controller cho gRPC Chat
 */
async function chat(call, callback) {
  try {
    const { message } = call.request;
    const result = await aiSdkAssistant({ messages: [{ role: "user", content: message }] });
    callback(null, { reply: result.answer, action: JSON.stringify(result.toolCalls || []) });
  } catch (error) {
    callback({
      code: grpc.status.INTERNAL,
      details: error.message,
    });
  }
}

/**
 * Controller cho gRPC Health
 */
function health(call, callback) {
  callback(null, {
    ok: true,
    service: "ai-service",
    mode: config.openaiApiKey ? "ai-sdk" : "rule-based"
  });
}

export function createGrpcServer() {
  const server = new grpc.Server();
  server.addService(aiProto.ChatService.service, {
    Chat: chat,
    Health: health,
  });
  return server;
}
