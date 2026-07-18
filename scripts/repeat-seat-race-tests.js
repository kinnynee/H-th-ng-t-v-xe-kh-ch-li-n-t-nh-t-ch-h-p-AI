import { spawnSync } from "node:child_process";

const configuredRounds = Number.parseInt(process.env.SEAT_RACE_REPEAT ?? "3", 10);
const rounds = Number.isInteger(configuredRounds) && configuredRounds > 0 ? configuredRounds : 3;
const testFiles = ["tests/seat-race.test.js", "tests/seat-race-stress.test.js"];

for (let round = 1; round <= rounds; round += 1) {
  console.log(`\nSeat-race test run ${round}/${rounds}`);
  const result = spawnSync(process.execPath, ["--test", ...testFiles], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`\nSeat-race tests passed ${rounds} consecutive runs.`);
