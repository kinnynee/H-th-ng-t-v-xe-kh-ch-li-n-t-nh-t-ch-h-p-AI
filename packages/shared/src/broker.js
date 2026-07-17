import { randomUUID } from "node:crypto";

const rabbitState = { connection: null, channel: null };
const kafkaState = { kafka: null, producer: null };

/** Produces a topic-safe, exact-match routing key for one trip's live seat updates. */
export function seatChangedRoutingKey(tripId) {
  const encodedTripId = Buffer.from(String(tripId ?? ""), "utf8").toString("base64url");
  return `seat.changed.${encodedTripId}`;
}

export function eventEnvelope(eventType, payload, correlationId) {
  return {
    eventId: randomUUID(),
    eventType,
    occurredAt: new Date().toISOString(),
    version: 1,
    correlationId: correlationId ?? payload?.bookingCode ?? payload?.tripId ?? randomUUID(),
    payload
  };
}

async function getRabbitChannel() {
  if (!process.env.RABBITMQ_URL) return null;
  if (rabbitState.channel) return rabbitState.channel;
  const amqp = await import("amqplib");
  rabbitState.connection = await amqp.connect(process.env.RABBITMQ_URL);
  rabbitState.channel = await rabbitState.connection.createConfirmChannel();
  await rabbitState.channel.assertExchange("bus.events", "topic", { durable: true });
  return rabbitState.channel;
}

export async function publishRabbitEnvelope(envelope, routingKey = envelope.eventType) {
  try {
    const channel = await getRabbitChannel();
    if (!channel) {
      console.log(`[rabbit:fallback] ${routingKey}`, JSON.stringify(envelope));
      return { ...envelope, published: false };
    }
    channel.publish("bus.events", routingKey, Buffer.from(JSON.stringify(envelope)), {
      contentType: "application/json",
      persistent: true
    });
    await channel.waitForConfirms();
    return { ...envelope, published: true };
  } catch (error) {
    console.warn(`[rabbit:fallback] ${routingKey}: ${error.message}`);
    return { ...envelope, published: false };
  }
}

export async function publishRabbit(eventType, payload, routingKey = eventType) {
  return publishRabbitEnvelope(eventEnvelope(eventType, payload), routingKey);
}

export async function subscribeRabbit(queueName, bindingKeys, handler, queueOptions = {}) {
  const attempts = process.env.RABBITMQ_URL ? 15 : 1;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const channel = await getRabbitChannel();
      if (!channel) {
        console.log(`[rabbit:fallback] subscriber ${queueName} waiting for real RabbitMQ`);
        return null;
      }
      const queue = await channel.assertQueue(queueName, {
        durable: queueOptions.durable ?? true,
        exclusive: queueOptions.exclusive ?? false,
        autoDelete: queueOptions.autoDelete ?? false
      });
      for (const key of bindingKeys) {
        await channel.bindQueue(queue.queue, "bus.events", key);
      }
      const consumer = await channel.consume(queue.queue, async (message) => {
        if (!message) return;
        try {
          const event = JSON.parse(message.content.toString("utf8"));
          await handler(event);
          channel.ack(message);
        } catch (error) {
          console.error(`[rabbit] handler failed for ${queueName}:`, error);
          channel.nack(message, false, false);
        }
      });
      console.log(`[rabbit] ${queue.queue} subscribed to ${bindingKeys.join(", ")}`);
      return {
        queueName: queue.queue,
        cancel: () => channel.cancel(consumer.consumerTag)
      };
    } catch (error) {
      if (attempt === attempts) {
        console.warn(`[rabbit:fallback] subscriber ${queueName}: ${error.message}`);
        return null;
      }
      console.warn(`[rabbit] subscriber ${queueName} waiting for broker (${attempt}/${attempts})`);
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  return null;
}

/**
 * Creates a short-lived queue backed by RabbitMQ for one live client.
 * Live updates are intentionally not replayed; callers should fetch the latest
 * seat map when a client connects or reconnects.
 */
export async function subscribeRabbitEphemeral(bindingKeys, { maxBufferSize = 100 } = {}) {
  const buffered = [];
  const waiters = [];
  let closed = false;

  const finish = () => {
    if (closed) return;
    closed = true;
    buffered.length = 0;
    while (waiters.length) waiters.shift()({ value: undefined, done: true });
  };
  const push = (event) => {
    if (closed) return;
    if (waiters.length) {
      waiters.shift()({ value: event, done: false });
      return;
    }
    if (buffered.length >= maxBufferSize) buffered.shift();
    buffered.push(event);
  };

  const consumer = await subscribeRabbit("", bindingKeys, push, {
    durable: false,
    exclusive: true,
    autoDelete: true
  });
  if (!consumer) return null;

  return {
    [Symbol.asyncIterator]() {
      return this;
    },
    next() {
      if (buffered.length) return Promise.resolve({ value: buffered.shift(), done: false });
      if (closed) return Promise.resolve({ value: undefined, done: true });
      return new Promise((resolve) => waiters.push(resolve));
    },
    async return() {
      finish();
      await consumer.cancel().catch(() => {});
      return { value: undefined, done: true };
    }
  };
}

async function getKafkaProducer() {
  if (!process.env.KAFKA_BROKERS) return null;
  if (kafkaState.producer) return kafkaState.producer;
  const { Kafka } = await import("kafkajs");
  kafkaState.kafka = new Kafka({
    clientId: "bus-ai-ticketing",
    brokers: process.env.KAFKA_BROKERS.split(",")
  });
  kafkaState.producer = kafkaState.kafka.producer();
  await kafkaState.producer.connect();
  return kafkaState.producer;
}

export async function publishKafkaEnvelope(topic, envelope) {
  try {
    const producer = await getKafkaProducer();
    if (!producer) {
      console.log(`[kafka:fallback] ${topic}`, JSON.stringify(envelope));
      return { ...envelope, published: false };
    }
    await producer.send({
      topic,
      messages: [
        {
          key: envelope.payload?.bookingCode ?? envelope.payload?.routeId ?? envelope.payload?.tripId ?? envelope.eventType,
          value: JSON.stringify(envelope)
        }
      ]
    });
    return { ...envelope, published: true };
  } catch (error) {
    console.warn(`[kafka:fallback] ${topic}: ${error.message}`);
    return { ...envelope, published: false };
  }
}

export async function publishKafka(topic, eventType, payload) {
  return publishKafkaEnvelope(topic, eventEnvelope(eventType, payload));
}

export async function subscribeKafka(groupId, topics, handler) {
  if (!process.env.KAFKA_BROKERS) {
    console.log(`[kafka:fallback] subscriber ${groupId} waiting for real Kafka`);
    return false;
  }
  const { Kafka } = await import("kafkajs");
  const kafka = new Kafka({
    clientId: `${groupId}-client`,
    brokers: process.env.KAFKA_BROKERS.split(",")
  });

  const ensureTopics = async () => {
    const admin = kafka.admin();
    await admin.connect();
    try {
      const existingTopics = new Set(await admin.listTopics());
      const missingTopics = topics.filter((topic) => !existingTopics.has(topic));
      if (missingTopics.length) {
        await admin.createTopics({
          topics: missingTopics.map((topic) => ({ topic, numPartitions: 1, replicationFactor: 1 })),
          waitForLeaders: true
        });
      }
    } finally {
      await admin.disconnect();
    }
  };
  let restarting = false;

  const scheduleRestart = (error) => {
    if (restarting) return;
    restarting = true;
    console.warn(`[kafka] subscriber ${groupId} disconnected: ${error?.message ?? "unknown error"}; retrying in 5 seconds`);
    const timer = setTimeout(() => {
      restarting = false;
      void start();
    }, 5_000);
    timer.unref?.();
  };

  const start = async () => {
    let consumer;
    try {
      await ensureTopics();
      consumer = kafka.consumer({ groupId });
      await consumer.connect();
      for (const topic of topics) await consumer.subscribe({ topic, fromBeginning: false });
      consumer.on(consumer.events.CRASH, async ({ payload }) => {
        await consumer.disconnect().catch(() => null);
        scheduleRestart(payload.error);
      });
      await consumer.run({
        eachMessage: async ({ topic, message }) => {
          const event = JSON.parse(message.value.toString("utf8"));
          await handler(event, topic);
        }
      });
      console.log(`[kafka] ${groupId} subscribed to ${topics.join(", ")}`);
    } catch (error) {
      await consumer?.disconnect().catch(() => null);
      scheduleRestart(error);
    }
  };

  await start();
  return true;
}
