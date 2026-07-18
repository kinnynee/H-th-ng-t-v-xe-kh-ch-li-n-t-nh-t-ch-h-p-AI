export function createKeyedSerialExecutor() {
  const tails = new Map();
  return async function run(key, work) {
    const normalizedKey = String(key ?? "");
    const previous = tails.get(normalizedKey) ?? Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    tails.set(normalizedKey, current);
    await previous;
    try {
      return await work();
    } finally {
      release();
      if (tails.get(normalizedKey) === current) tails.delete(normalizedKey);
    }
  };
}
