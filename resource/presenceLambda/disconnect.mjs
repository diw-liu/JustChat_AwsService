import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { createClient } from 'redis';

const eventBus = process.env.EVENT_BUS;
const redisEndpoint = process.env.redis_endpoint;
const redisPort = process.env.redis_port;

const eventBridge = new EventBridgeClient();
const redisClient = createClient({
    socket: {
        host: redisEndpoint,
        port: redisPort
    }});
await redisClient.connect();

export const handler = async (event) => {
  const id = event['identity']['sub']
  console.log(event)
  console.log(id)
  if (undefined === id || null === id) throw new Error("Missing argument 'id'");
  try {
    const removals = await redisClient.ZREM("presence", id);
    console.log(removals)
    //if (removals != 1) return {id, status: "offline"};
    const input = {
      Entries: [
        {
          Detail: JSON.stringify({id}),
          DetailType: "presence.disconnected",
          Source: "api.presence",
          EventBusName: eventBus
        }
      ]
    };
    console.log(input)
    const command = new PutEventsCommand(input);
    eventBridge.send(command)
        .then((response) => {
          console.log("Event successfully put:", response);
        })
        .catch((error) => {
          console.error("Error putting event:", error);
        });
    return {id, status: "offline"};
  } catch (error) {
    return error;
  }
}