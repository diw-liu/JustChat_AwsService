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
  let id = event && event.arguments && event.arguments.id;
  if(!id) id = event && event.source && event.source.FriendId
  console.log(event)
  if (undefined === id || null === id) throw new Error("Missing argument 'id'");
  try {
    console.log(id)
    const result = await redisClient.zScore("presence", id);
    console.log(result)
    return { id, status: result ? "online" : "offline" };
  } catch (error) {
    return error;
  }
}