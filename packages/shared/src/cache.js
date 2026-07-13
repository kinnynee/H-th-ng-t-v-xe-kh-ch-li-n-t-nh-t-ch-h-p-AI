export function createMemoryTTLStore() {
  const values = new Map();

  function cleanup(key) {
    const item = values.get(key);
    if (item && item.expiresAt <= Date.now()) {
      values.delete(key);
      return undefined;
    }
    return item;
  }

  return {
    async setNX(key, value, ttlSeconds) {
      if (cleanup(key)) return false;
      values.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
      return true;
    },
    async set(key, value, ttlSeconds) {
      values.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
      return true;
    },
    async get(key) {
      const item = cleanup(key);
      return item?.value ?? null;
    },
    async del(key) {
      values.delete(key);
    },
    async ttl(key) {
      const item = cleanup(key);
      if (!item) return -2;
      return Math.max(0, Math.ceil((item.expiresAt - Date.now()) / 1000));
    },
    async keys(prefix) {
      const found = [];
      for (const key of values.keys()) {
        if (cleanup(key) && key.startsWith(prefix)) found.push(key);
      }
      return found;
    }
  };
}

export async function connectRedis(url = process.env.REDIS_URL, label = "service") {
  if (!url) return null;
  try {
    const { createClient } = await import("redis");
    const client = createClient({ url });
    client.on("error", (error) => {
      console.warn(`[${label}] Redis warning: ${error.message}`);
    });
    await client.connect();
    console.log(`[${label}] Redis connected`);
    return client;
  } catch (error) {
    console.warn(`[${label}] Redis unavailable, using memory fallback: ${error.message}`);
    return null;
  }
}

export function createCacheAdapter(redisClient) {
  const memory = createMemoryTTLStore();
  if (!redisClient) return memory;

  return {
    async setNX(key, value, ttlSeconds) {
      const result = await redisClient.set(key, JSON.stringify(value), {
        NX: true,
        EX: ttlSeconds
      });
      return result === "OK";
    },
    async set(key, value, ttlSeconds) {
      await redisClient.set(key, JSON.stringify(value), { EX: ttlSeconds });
      return true;
    },
    async get(key) {
      const raw = await redisClient.get(key);
      return raw ? JSON.parse(raw) : null;
    },
    async del(key) {
      await redisClient.del(key);
    },
    async ttl(key) {
      return redisClient.ttl(key);
    },
    async keys(prefix) {
      return redisClient.keys(`${prefix}*`);
    }
  };
}
