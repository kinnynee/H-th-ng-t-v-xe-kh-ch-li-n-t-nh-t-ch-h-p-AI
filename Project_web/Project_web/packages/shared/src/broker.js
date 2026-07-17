import { randomUUID } from "node:crypto";

const rabbitState = { connection: null, channel: null };
const kafkaState = { kafka: null, producer: null };

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
  rabbitState.channel = await rabbitState.connection.createChannel();
  await rabbitState.channel.assertExchange("bus.events", "topic", { durable: true });
  return rabbitState.channel;
}

export async function publishRabbit(eventType, payload, routingKey = eventType) {
  const envelope = eventEnvelope(eventType, payload);
  try {
    const channel = await getRabbitChannel();
    if (!channel) {
      console.log(`[rabbit:fallback] ${routingKey}`, JSON.stringify(envelope));
      return envelope;
    }
    channel.publish("bus.events", routingKey, Buffer.from(JSON.stringify(envelope)), {
      contentType: "application/json",
      persistent: true
    });
    return envelope;
  } catch (error) {
    console.warn(`[rabbit:fallback] ${routingKey}: ${error.message}`);
    return envelope;
  }
}

export async function subscribeRabbit(queueName, bindingKeys, handler) {
  try {
    const channel = await getRabbitChannel();
    if (!channel) {
      console.log(`[rabbit:fallback] subscriber ${queueName} waiting for real RabbitMQ`);
      return;
    }
    const queue = await channel.assertQueue(queueName, { durable: true });
    for (const key of bindingKeys) {
      await channel.bindQueue(queue.queue, "bus.events", key);
    }
    await channel.consume(queue.queue, async (message) => {
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
    console.log(`[rabbit] ${queueName} subscribed to ${bindingKeys.join(", ")}`);
  } catch (error) {
    console.warn(`[rabbit:fallback] subscriber ${queueName}: ${error.message}`);
  }
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

export async function publishKafka(topic, eventType, payload) {
  const envelope = eventEnvelope(eventType, payload);
  try {
    const producer = await getKafkaProducer();
    if (!producer) {
      console.log(`[kafka:fallback] ${topic}`, JSON.stringify(envelope));
      return envelope;
    }
    await producer.send({
      topic,
      messages: [
        {
          key: payload?.bookingCode ?? payload?.routeId ?? payload?.tripId ?? eventType,
          value: JSON.stringify(envelope)
        }
      ]
    });
    return envelope;
  } catch (error) {
    console.warn(`[kafka:fallback] ${topic}: ${error.message}`);
    return envelope;
  }
}

export async function subscribeKafka(groupId, topics, handler) {
  if (!process.env.KAFKA_BROKERS) {
    console.log(`[kafka:fallback] subscriber ${groupId} waiting for real Kafka`);
    return;
  }
  try {
    const { Kafka } = await import("kafkajs");
    const kafka = new Kafka({
      clientId: `${groupId}-client`,
      brokers: process.env.KAFKA_BROKERS.split(",")
    });
    const consumer = kafka.consumer({ groupId });
    await consumer.connect();
    for (const topic of topics) {
      await consumer.subscribe({ topic, fromBeginning: false });
    }
    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        const event = JSON.parse(message.value.toString("utf8"));
        await handler(event, topic);
      }
    });
    console.log(`[kafka] ${groupId} subscribed to ${topics.join(", ")}`);
  } catch (error) {
    console.warn(`[kafka:fallback] subscriber ${groupId}: ${error.message}`);
  }
}
