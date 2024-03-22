import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { createClient } from 'redis';

const eventBus = process.env.EVENT_BUS;
const redisEndpoint = process.env.redis_endpoint;
const redisPort = process.env.redis_port;

const eventClient = new EventBridgeClient();
const redisClient = createClient({
    socket: {
        host: redisEndpoint,
        port: redisPort
    }});
await redisClient.connect();

export const handler = async (event) => {
  const timestamp = Date.now() - process.env.TIMEOUT;
  const commands = redisClient.multi()
                              .ZRANGEBYSCORE("presence", "-inf", timestamp)
                              .ZREMRANGEBYSCORE("presence", "-inf", timestamp)
                              .exec();
  try {
    const [ids] = await commands();
    if (!ids.length) return { expired: 0 };
    const Entries = ids.map((id) => {
      return {
        Detail: JSON.stringify({id}),
        DetailType: "presence.disconnected",
        Source: "api.presence",
        EventBusName: eventBus
      }
    });
    const input = {
      Entries: Entries
    }
      // console.log(eventBus)
      // const input = {
      //   Entries: [
      //     {
      //       Detail: JSON.stringify({ greeting: "Hello there." }),
      //       DetailType: "presence.disconnected",
      //       Source: "api.presence",
      //       Resources: [],
      //       EventBusName: 'arn:aws:events:us-east-1:414210735905:event-bus/present-event-bus'
      //     },
      //   ],
      // }
    const command = new PutEventsCommand(input);
    const response = await eventClient.send(command)
    return response
  } catch (error) {
    return error;
  }
}