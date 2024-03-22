import { createClient } from 'redis';

const redisEndpoint = process.env.redis_endpoint;
const redisPort = process.env.redis_port;
const redisClient = createClient({
    socket: {
        host: redisEndpoint,
        port: redisPort
    }});
await redisClient.connect();

export const handler = async (event) => {
  const id = event && event.arguments && event.arguments.id;
  if (undefined === id || null === id) throw new Error("Missing argument 'id'");
  try {
    const result = await redisClient.zscore("presence", id);
    return { id, status: result ? "online" : "offline" };
  } catch (error) {
    return error;
  }
}