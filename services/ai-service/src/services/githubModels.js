import { createOpenAI } from "@ai-sdk/openai";
import config from "../config/env.js";

const token = config.githubModelsToken;

export const githubModels = createOpenAI({
  name: "github-models",
  apiKey: token,
  baseURL: "https://models.github.ai/inference",
  headers: {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  },
});

export const busAdvisorChatModel = githubModels.chat(
  config.githubModelsChatModel || "openai/gpt-4o-mini"
);

export const busAdvisorEmbeddingModel = githubModels.embedding(
  config.githubModelsEmbeddingModel || "openai/text-embedding-3-small"
);
