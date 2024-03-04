import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb"; 
const client = new DynamoDBClient();

export const handler = async (event) => {
  const email = event['request']['userAttributes']['email'];
  console.log(email)
  const input = {
    "ExpressionAttributeValues": {
      ":Email": {
        "S": email
      }
    },
    "KeyConditionExpression": "Email = :Email",
    "TableName": process.env.USERS_TABLE_NAME,
    "IndexName": "emailIndex"
  };
  const command = new QueryCommand(input);
  const response = await client.send(command);
  if(response['Item']) throw new Error('Existing user with following email');
  return event;
};