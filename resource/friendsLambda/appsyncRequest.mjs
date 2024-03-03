import { default as fetch, Request } from 'node-fetch';

const GRAPHQL_ENDPOINT = process.env.APPSYNC_URL;

const query = `
  mutation publishFriend(input: FriendInput!) {
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

export const appsyncRequest = async (event) => {
  console.log(`EVENT: ${JSON.stringify(event)}`);

  const variables = {
    input: {
      name: 'Hello, Todo!'
    }
  };

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables, 'authMode': "AWS_IAM"})
  };

  const request = new Request(GRAPHQL_ENDPOINT, options);

  let statusCode = 200;
  let body;
  let response;

  try {
    response = await fetch(request);
    body = await response.json();
    if (body.errors) statusCode = 400;
  } catch (error) {
    statusCode = 400;
    body = {
      errors: [
        {
          status: response.status,
          message: error.message,
          stack: error.stack
        }
      ]
    };
  }

  return {
    statusCode,
    body: JSON.stringify(body)
  };
};