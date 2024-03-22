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
  const id = event['identity']['sub']
  if (undefined === id || null === id) throw new Error("Missing argument 'id'");
  const timestamp = Date.now();
  try {
    const result = await redisClient.zAdd("presence", {
      score: timestamp,
      value: id
    });
  } catch (error) {
    return error;
  }
  return { id: id, status: "online" };
}