import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const task = process.argv[2];
if (!['migrate', 'seed'].includes(task)) {
  throw new Error("Use `node scripts/db-tasks.js migrate` or `node scripts/db-tasks.js seed`.");
}

const envFile = path.resolve(".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const services = task === "migrate"
  ? [
      "services/trip-service/scripts/migrate.js",
      "services/booking-service/scripts/migrate.js",
      "services/seat-service/scripts/migrate.js"
    ]
  : [
      "services/trip-service/scripts/seed.js",
      "services/booking-service/scripts/seed.js",
      "services/seat-service/scripts/seed.js"
    ];

for (const script of services) {
  const result = spawnSync(process.execPath, [script], { stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
