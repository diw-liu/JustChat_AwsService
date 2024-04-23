import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AppsyncStack } from './chatAppSync'
import { CongitoStack } from './chatCongito'
import { DynamoStack } from './chatDynamo'
import { FriendServiceStack } from './chatFriendService';
import { MessageServiceStack } from './chatMessageService';
import { PresentServiceStack } from './chatPresentService';
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

    new FriendServiceStack(this, 'ChatFriendService', {
      api: chatAppSync.api,
      friendsTable: chatDynamo.friendsTable,
      usersTable: chatDynamo.usersTable,
      messagesTable: chatDynamo.messagesTable
    });

    new MessageServiceStack(this, 'ChatMessageService', {
      region: region,
      account: account,
      api: chatAppSync.api,
      messagesTable: chatDynamo.messagesTable
    });

    new PresentServiceStack(this, 'ChatPresentService', {
      api: chatAppSync.api,
    })

    new cdk.CfnOutput(this, 'ChatsUserpool', {
      value: chatUserpool.userpool.userPoolId
    });
    
    new cdk.CfnOutput(this, 'ChatsClient', {
      value: chatUserpool.client.userPoolClientId
    })

    new cdk.CfnOutput(this, "ChatsAppSync", {
      value: chatAppSync.api.graphqlUrl
    });

  }
}
