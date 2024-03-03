// don't care about the selection list, try just return
// Must change since mutation and name not included... cause issue.
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb"; 
const client = new DynamoDBClient();

export const handler = async (event) => {
  for (const message of event.Records) {
    await processMessageAsync(message);
  }
  console.info("done");
};

async function processMessageAsync(message) {
  try {
    console.log(`Processed message ${message.body}`);
    const info = JSON.parse(message.body);
    console.log("noooo" + info)
    const date = new Date();
    const input = {
      "Item": {
        "UserId": {
          "S": info["id"]
        },
        "FriendId": {
          "S": info["arguments"]["friendId"]
        },
        "Status": {
          "S": "REQUESTED"
        },
        "CreatedTime": {
          "S": date
        },
        "UpdatedTime": {
          "S": date
        }
      },
      "ReturnConsumedCapacity": "TOTAL",
      "TableName": process.env.FRIEND_TABLE_NAME
    };
    console.log(input);
    const command = new PutItemCommand(input);
    const response = await client.send(command);
  } catch (err) {
    console.error("An error occurred");
    throw err;
  }
}