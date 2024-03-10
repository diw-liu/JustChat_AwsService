import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AppsyncStack } from './chatAppSync'
import { CongitoStack } from './chatCongito'
import { DynamoStack } from './chatDynamo'
import { FriendServiceStack } from './chatFriendService';
import { MessageServiceStack } from './chatMessageService';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const region = cdk.Stack.of(this).region;
    const account = cdk.Stack.of(this).account;

    const chatDynamo = new DynamoStack(this, 'ChatDynamo');

    const chatUserpool = new CongitoStack(this, 'ChatCongito', {
      usersTable: chatDynamo.usersTable,
    });

    const chatAppSync = new AppsyncStack(this, 'ChatAppSync', {
      userpool: chatUserpool.userpool
    });

    const chatFriendService = new FriendServiceStack(this, 'ChatFriendService', {
      region: region,
      account: account,
      api: chatAppSync.api,
      friendsTable: chatDynamo.friendsTable,
      usersTable: chatDynamo.usersTable,
    });

    const chatMessageService = new MessageServiceStack(this, 'ChatMessageService', {
      region: region,
      account: account,
      api: chatAppSync.api,
      messagesTable: chatDynamo.messagesTable
    });

    new cdk.CfnOutput(this, 'ChatAppSyncOutput', {
      value: chatAppSync.api.graphqlUrl
    })
    // The code that defines your stack goes here

    // example resource
    // const queue = new sqs.Queue(this, 'BackendQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });
  }
}
