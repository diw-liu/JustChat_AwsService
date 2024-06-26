// don't care about the selection list, try just return
// Must change since mutation and name not included... cause issue.
import { DynamoDBClient, PutItemCommand, DeleteItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb"; 
import { v4 as uuidv4 } from 'uuid';

const client = new DynamoDBClient();

export const handler = async (event) => {
  try {
    switch (event['arguments']["type"]) {
      case 'ADD':
        return insertItem(event)
      case 'REMOVE':
        return deleteItem(event)
      case 'DISAPPROVE':
        return deleteItem(event)
      case 'APPROVE':
        return updateItem(event)
      default:
        break;
    }
  } catch (err) {
    console.error("An error occurred"+ err);
    return {
      Status: '400'  
    }
  }
}

async function insertItem(event) {
  if (event["identity"]["sub"] == event["arguments"]["friendId"]) throw new Error('Cant add yoursefl as friend') 
  const date = new Date();
  const input = {
    "Item": {
      "UserId": {
        "S": event["identity"]["sub"]
      },
      "FriendId": {
        "S": event["arguments"]["friendId"]
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
    "TableName": process.env.FRIEND_TABLE_NAME,
    "ConditionExpression": "attribute_not_exists(UserId)"
  };
  const command = new PutItemCommand(input);
  const response = await client.send(command);
  return {
    Status: response['$metadata']['httpStatusCode']
  }
}

async function deleteItem(event) {
  const status = event['arguments']["type"] == 'DISAPPROVE' ? "PENDING" : "FRIENDS"
  const input = {
    "ExpressionAttributeNames": {
      "#Status": "Status"
    },
    "ExpressionAttributeValues": {
      ":Status": {
        "S": status
      }
    },
    "Key": {
      "UserId": {
        "S": event["identity"]["sub"]
      },
      "FriendId": {
        "S": event["arguments"]["friendId"]
      },
    },
    "ConditionExpression": "#Status = :Status",
    "TableName": process.env.FRIEND_TABLE_NAME
  };
  console.log(input)
  const command = new DeleteItemCommand(input);
  const response = await client.send(command);
  return {
    Status: response['$metadata']['httpStatusCode']
  }
}

async function updateItem(event) {
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
        "S": uuidv4()
      },
      ":UpdatedTime": {
        "S": date
      },
      ":pending": {
        "S": "PENDING"
      }
    },
    "Key": {
      "UserId": {
        "S": event["identity"]["sub"]
      },
      "FriendId": {
        "S": event["arguments"]["friendId"]
      },
    },
    "ReturnValues": "ALL_NEW",
    "TableName": process.env.FRIEND_TABLE_NAME,
    "UpdateExpression": "SET #Status = :Status, #RoomId = :RoomId, #UpdatedTime = :UpdatedTime",
    "ConditionExpression": "#Status = :pending"
  };
  const command = new UpdateItemCommand(input);
  const response = await client.send(command);
  console.log(response)
  return {
    Friend: {
      FriendId: response['Attributes']['FriendId']['S'],
      RoomId: response['Attributes']['RoomId']['S'],
      Status: response['Attributes']['Status']['S'],
    },
    Status: response['$metadata']['httpStatusCode']
  }
}