import express from "express";
import cors from "cors";
import config from "./config/env.js";
import chatRoutes from "./routes/chatRoutes.js";

const app = express();
app.use(cors());
app.use(express.json());

// Mount tất cả routes
app.use(chatRoutes);

app.listen(config.port, () => {
  console.log(`[ai-service] listening on http://localhost:${config.port}`);
});
