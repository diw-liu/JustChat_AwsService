import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb"; 
import { v4 as uuidv4 } from 'uuid';

const client = new DynamoDBClient();

export const handler = async (event) => {
  for (const message of event.Records) {
    await processMessageAsync(message);
  }
  console.info("done");
};

export const processMessageAsync = async (message) => {
  console.log(message)
  const info = JSON.parse(message.body);
  console.log(info)
  const date = new Date();
  const input = {
    "Item": {
      "RoomId": {
        "S": info['input']['RoomId']
      },
      "MessageId": {
        "S": uuidv4()
      },
      "AuthorId": {
        "S": info['id']
      },
      "Content": {
        "S": info['input']['Message']
      },
      "CreatedTime": {
        "S": date
      }
    },
    "ReturnConsumedCapacity": "TOTAL",
    "TableName": process.env.MESSAGE_TABLE_NAME
  }
  const command = new PutItemCommand(input);
  const response = await client.send(command);
  return response['$metadata']['httpStatusCode']
}
