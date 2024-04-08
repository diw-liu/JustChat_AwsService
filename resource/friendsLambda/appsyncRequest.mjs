import crypto from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { SignatureV4 } from '@aws-sdk/signature-v4';
import { HttpRequest } from '@aws-sdk/protocol-http';
import { default as fetch, Request } from 'node-fetch';

const { Sha256 } = crypto;
const GRAPHQL_ENDPOINT = process.env.APPSYNC_URL;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

const publishFriend = `
  mutation publishFriend($input: FriendInput!) {
    publishFriend(input: $input) {
      UserId
    	FriendId
    	Status
    	FriendInfo {
        Email
        UserId
        UserName
      }
    }
  }
`;

const sendMessage = `
  mutation sendMessage($RoomId: String!, $Message: String!) {
    sendMessage(RoomId: $RoomId, Message: $Message) 
  }
`

export const middleware = async (variables, roomId = '') => {
  const res1 = await handler(variables)
  if(roomId){
    const input = {
      RoomId: roomId,
      Message: "First message to start your friendship"
    }
    const res2 = await handler(input)
  }
  return res1;
}

/**
 * @type {import('@types/aws-lambda').APIGatewayProxyHandler}
 */
const handler = async (variables) => {
  console.log(`EVENT: ${JSON.stringify(variables)}`);
  console.log(GRAPHQL_ENDPOINT);
  const endpoint = new URL(GRAPHQL_ENDPOINT);
  const query = variables['RoomId'] ? sendMessage : publishFriend;
  
  const signer = new SignatureV4({
    credentials: defaultProvider(),
    region: AWS_REGION,
    service: 'appsync',
    sha256: Sha256
  });

  const requestToBeSigned = new HttpRequest({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      host: endpoint.host
    },
    hostname: endpoint.host,
    body: JSON.stringify({ query, variables }),
    path: endpoint.pathname
  });

  const signed = await signer.sign(requestToBeSigned);
  const request = new Request(GRAPHQL_ENDPOINT, signed);

  let statusCode = 200;
  let body;
  let response;

  try {
    response = await fetch(request);
    body = await response.json();
    if (body.errors) statusCode = 400;
  } catch (error) {
    statusCode = 500;
    body = {
      errors: [
        {
          message: error.message
        }
      ]
    };
  }
  return {
    statusCode,
    body: JSON.stringify(body)
  };
};