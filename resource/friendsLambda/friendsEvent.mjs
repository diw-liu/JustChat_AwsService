// don't care about the selection list, try just return
// Must change since mutation and name not included... cause issue.
import { DynamoDBClient, PutItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb"; 
import * as appsyncRequest from "./appsyncRequest.mjs";

const client = new DynamoDBClient();

const mutation =  `
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

export const handler = async (event) => {
  for (const message of event.Records) {
    await processMessageAsync(message);
  }
  console.info("done");
};

async function processMessageAsync(message) {
  console.log(message);
  console.log(message['dynamodb'])
  const eventName = message['eventName'];
  const item = eventName != "REMOVE" ? message['dynamodb']['NewImage'] : message['dynamodb']['OldImage'];
  
  switch (eventName) {
    case 'INSERT':
      if(item['Status']['S'] == 'REQUESTED') {
        const res1 = await putFriendsItem(item);
        if(res1['$metadata']['httpStatusCode'] != 200) throw new Error('Fail PutFriendItem')
          
        //const res2 = await getUserItem(item['UserId']['S'])
        //if(res2['$metadata']['httpStatusCode'] != 200) throw new Error('Fail getUserItem')
        const variables = {
          input: {
            UserId: item['FriendId']['S'],
            FriendId: item['UserId']['S'],
            Status: "PENDING",
          }
        };
        return await appsyncRequest.handler(variables)
        //console.log('adsasa'+JSON.stringify(res2));
      }
      break;
      
    case 'REMOVE':
      break;
      
    case 'MODIFY':
      break;
      
    default:
      throw new Error("Invalid input. Odd eventName")
  }
}

async function putFriendsItem(item) {
  const date = new Date();
  let params = {
    "Item": {
        "UserId": {
          "S": item['FriendId']['S'],
        },
        "FriendId": {
          "S": item['UserId']['S'],
        },
        "Status": {
          "S": "PENDING"
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
  }
  const command = new PutItemCommand(params);
  return await client.send(command);
}

async function getUserItem(Id) {
  const input = {
    "Key": {
      "UserId": {
        "S":  Id,
      }
    },
    "TableName": process.env.USER_TABLE_NAME
  };
  const command = new GetItemCommand(input);
  return await client.send(command);
}