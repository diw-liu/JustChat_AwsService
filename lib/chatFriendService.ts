import { Construct } from 'constructs';
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as eventsources from 'aws-cdk-lib/aws-lambda-event-sources';

export class FriendServiceStack extends Construct {
  constructor(scope: Construct, id: string, props?: any) {
    super(scope, id);

    const appsyncLayer = new lambda.LayerVersion(this, 'AppSyncLayer', {
      code: lambda.Code.fromAsset('resource/utils/layer-package.zip'),
    });
    
    const requestFriend = new lambda.Function(this, 'RequestFriendLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset("resource/friendsLambda"),
      handler: "requestFriend.handler",
      environment: {
        FRIEND_TABLE_NAME: props.friendsTable.tableName
      },
      layers: [appsyncLayer]
    })
    props.friendsTable.grantReadWriteData(requestFriend);

    const lambdaDS = props.api.addLambdaDataSource('friendLambdaDataSource', requestFriend)

    lambdaDS.createResolver('resolver-mutation-requestFriend', {
      typeName: 'Mutation',
      fieldName: 'requestFriend',
    })

    const friendsEvent = new lambda.Function(this, 'FriendsEventLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset("resource/friendsLambda"),
      handler: "friendsEvent.handler",
      environment: {
        FRIEND_TABLE_NAME: props.friendsTable.tableName,
        USER_TABLE_NAME: props.usersTable.tableName,
        APPSYNC_URL: props.api.graphqlUrl        
      },
      layers: [appsyncLayer]
    })
    props.friendsTable.grantReadWriteData(friendsEvent);
    props.api.grant(friendsEvent, appsync.IamResource.ofType('Mutation', 'publishFriend'), 'appsync:GraphQL');

    const streamEventSourceProps: eventsources.StreamEventSourceProps = {
      startingPosition: lambda.StartingPosition.LATEST,
      batchSize: 5,
      retryAttempts: 1,
      reportBatchItemFailures: true,
    };

    friendsEvent.addEventSource(
      new eventsources.DynamoEventSource(props.friendsTable, {
        filters: [
          lambda.FilterCriteria.filter({
            eventName: lambda.FilterRule.isEqual('INSERT'),
            dynamodb: {
              NewImage: {
                Status: { S: ["REQUESTED"]},
              },
            },
          }),
          lambda.FilterCriteria.filter({
            eventName: lambda.FilterRule.isEqual('MODIFY'),
            dynamodb: {
              OldImage: {
                Status: { S: [{"anything-but": ["FRIENDS"]}]},
              },
            },
          }),
          lambda.FilterCriteria.filter({
            eventName: lambda.FilterRule.isEqual('REMOVE'),
          }),
        ],
        ...streamEventSourceProps
      })
    );

    const friendsDS = props.api.addDynamoDbDataSource("friendDataSource", props.friendsTable)

    new appsync.Resolver(this, 'resolver-query-getFriends', {
      api: props.api,
      dataSource: friendsDS,
      typeName: 'Query',
      fieldName: 'getFriends',
      code: appsync.Code.fromAsset("resource/resolvers/Query.getFriends.js"),
      runtime: appsync.FunctionRuntime.JS_1_0_0
    });

    const usersDS = props.api.addDynamoDbDataSource("usersDataSource", props.usersTable)

    new appsync.Resolver(this, 'resolver-mutation-publishFriend', {
      api: props.api,
      dataSource: usersDS,
      typeName: 'Mutation',
      fieldName: 'publishFriend',
      code: appsync.Code.fromAsset("resource/resolvers/Mutation.publishFriend.js"),
      runtime: appsync.FunctionRuntime.JS_1_0_0
    });

    new appsync.Resolver(this, 'resolver-friend-friendInfo', {
      api: props.api,
      dataSource: usersDS,
      typeName: 'Friend',
      fieldName: 'FriendInfo',
      code: appsync.Code.fromAsset("resource/resolvers/Friend.FriendInfo.js"),
      runtime: appsync.FunctionRuntime.JS_1_0_0
    });

    const noneDS = props.api.addNoneDataSource("NoneDataSource")

    new appsync.Resolver(this, 'resolver-subscription-onPublishFriend', {
      api: props.api,
      dataSource: noneDS,
      typeName: 'Subscription',
      fieldName: 'onPublishFriend',
      code: appsync.Code.fromAsset("resource/resolvers/Subscription.onPublishFriend.js"),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
    });
  }
}