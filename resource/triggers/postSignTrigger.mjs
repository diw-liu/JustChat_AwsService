import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb"; 
const client = new DynamoDBClient();

export const handler = async (event) => {
  console.log(event);
  const attrib = event['request']['userAttributes'];
  const input = {
    "Item": {
      "Email": {
        "S": attrib['email']
      }, 
      "UserId": {
        "S": attrib['sub']
      },
      "UserName": {
        "S": event['userName']
      }
    },
    "TableName": process.env.USERS_TABLE_NAME
  };
  const command = new PutItemCommand(input);
  const response = await client.send(command);
  if(response['$metadata']['httpStatusCode'] != 200) throw new Error('Confirmation process failed. Please try again');
  return event;
};