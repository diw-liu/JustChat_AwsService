import { DynamoDBClient, PutItemCommand, DeleteItemCommand, UpdateItemCommand} from "@aws-sdk/client-dynamodb"; 
import * as appsyncRequest from "./appsyncRequest.mjs";

const client = new DynamoDBClient();

export const handler = async (event) => {
  console.log(event)
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
        const res = await putFriendsItem(item);
        if(res['$metadata']['httpStatusCode'] != 200) throw new Error('Fail PutFriendItem')
        const variables = {
          input: {
            UserId: item['FriendId']['S'],
            FriendId: item['UserId']['S'],
            Status: "PENDING",
          }
        };
        return await appsyncRequest.handler(variables)
      }
      break;
      
    case 'REMOVE':
      const res = await deleteFriendItem(item)
      if(res['$metadata']['httpStatusCode'] != 200) throw new Error('Fail DeleteFriendItem')
      const variables = {
        input: {
          UserId: item['FriendId']['S'],
          FriendId: item['UserId']['S']
        }
      };
      console.log(variables);
      return await appsyncRequest.handler(variables);
      
    case 'MODIFY':
      if(item['Status']['S'] == 'FRIENDS' && message['dynamodb']['OldImage']['Status']['S'] == 'PENDING') {
        const res = await updateFriendItem(item)
        if(res['$metadata']['httpStatusCode'] != 200) throw new Error('Fail UpdateFriendItem')
        const variables = {
          input: {
            UserId: item['FriendId']['S'],
            FriendId: item['UserId']['S'],
            Status: "FRIENDS",
          }
        };
        console.log(variables);
        return await appsyncRequest.handler(variables);
      }
      break;
    default:
      throw new Error("Invalid input. Odd eventName")
  }
}

async function deleteFriendItem(item) {
  const input = {
    "Key": {
      "UserId": {
        "S": item['FriendId']['S'],
      },
      "FriendId": {
        "S": item['UserId']['S'],
      },
    },
    "TableName": process.env.FRIEND_TABLE_NAME
  };
  const command = new DeleteItemCommand(input);
  return await client.send(command);
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

async function updateFriendItem(item) {
  const date = new Date();
  const input = {
    "ExpressionAttributeNames": {
      "#Status": "Status",
      "#RoomId": "RoomId",
      "#UpdatedTime": "UpdatedTime"
    },
    "ExpressionAttributeValues": {
      ":Status": {
        "S": "FRIENDS"
      },
      ":RoomId": {
        "S": item['RoomId']['S']
      },
      ":UpdatedTime": {
        "S": date
      },
      ":requested": {
        "S": "REQUESTED"
      }
    },
    "Key": {
      "UserId": {
        "S": item['FriendId']['S'],
      },
      "FriendId": {
        "S": item['UserId']['S'],
      },
    },
    "ReturnValues": "ALL_NEW",
    "TableName": process.env.FRIEND_TABLE_NAME,
    "UpdateExpression": "SET #Status = :Status, #RoomId = :RoomId, #UpdatedTime = :UpdatedTime",
    "ConditionExpression": "#Status = :requested"
  };
  const command = new UpdateItemCommand(input);
  return await client.send(command);
}