import { Construct } from "constructs";
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'

export class DynamoStack extends Construct {
  public readonly usersTable: dynamodb.Table
  public readonly friendsTable: dynamodb.Table
  public readonly messagesTable: dynamodb.Table
  constructor(scope: Construct, id: string, props?: any){
    super(scope, id);

    this.usersTable = new dynamodb.Table(this, 'UsersTable', {
      partitionKey: {
        name: "UserId", 
        type: dynamodb.AttributeType.STRING
      }
    })

    const emailSecondIndexProps : dynamodb.GlobalSecondaryIndexProps = {
      indexName: "emailIndex",
      partitionKey: {
        name: "Email",
        type: dynamodb.AttributeType.STRING
      }
    }

    this.usersTable.addGlobalSecondaryIndex(emailSecondIndexProps);
    
    this.friendsTable = new dynamodb.Table(this, 'FriendsTable', {
      partitionKey: {
        name: "UserId",
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: "FriendId",
        type: dynamodb.AttributeType.STRING
      },
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    })

    this.messagesTable = new dynamodb.Table(this, 'MessageTable', {
      partitionKey: {
        name: "RoomId",
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: "MessageId",
        type: dynamodb.AttributeType.STRING
      },
      stream: dynamodb.StreamViewType.NEW_IMAGE
    })
  }
}