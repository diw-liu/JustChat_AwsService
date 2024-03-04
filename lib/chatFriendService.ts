import { Construct } from 'constructs';
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as eventsources from 'aws-cdk-lib/aws-lambda-event-sources';

export class FriendServiceStack extends Construct {
  constructor(scope: Construct, id: string, props?: any) {
    super(scope, id);

    //appsync >> sqs >> firend lambda function
    const friendDLQ = new sqs.Queue(this, 'FriendsDLQ')
    const friendSQS = new sqs.Queue(this, 'FriendsQueue', {
      deadLetterQueue: {
        maxReceiveCount: 1,
        queue: friendDLQ
      }
    })
    
    const addFriend = new lambda.Function(this, 'AddFriendLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset("resource/friendsLambda"),
      handler: "addFriend.handler",
      environment: {
        FRIEND_TABLE_NAME: props.friendsTable.tableName
      }
    })
    addFriend.addEventSource(new eventsources.SqsEventSource(friendSQS));
    props.friendsTable.grantReadWriteData(addFriend);

    const datasource = props.api.addHttpDataSource(
			'sqs',
			`https://sqs.${props.region}.amazonaws.com`,
			{
				authorizationConfig: {
					signingRegion: props.region,
					signingServiceName: 'sqs',
				},
			}
		)
		datasource.node.addDependency(friendSQS)
		friendSQS.grantSendMessages(datasource.grantPrincipal)

    const myJsFunction = new appsync.AppsyncFunction(this, 'function', {
			name: 'my_js_function',
      api: props.api,
			dataSource: datasource,
			code: appsync.Code.fromAsset("resource/resolvers/sendFriendSQS.js"),
			runtime: appsync.FunctionRuntime.JS_1_0_0,
		})

		const pipelineVars = JSON.stringify({
			accountId: props.account,
			queueUrl: friendSQS.queueUrl,
			queueName: friendSQS.queueName,
		})

		new appsync.Resolver(this, 'PipelineResolver', {
			api: props.api,
			typeName: 'Mutation',
			fieldName: 'addFriend',
			code: appsync.Code.fromInline(`
            // The before step
            export function request(...args) {
              console.log(args);
              return ${pipelineVars}
            }
        
            // The after step
            export function response(ctx) {
              return ctx.prev.result
            }
          `),
			runtime: appsync.FunctionRuntime.JS_1_0_0,
			pipelineConfig: [myJsFunction],
		})


    // Event mapping when add/remove/update friend
    const appsyncLayer = new lambda.LayerVersion(this, 'AppSyncLayer', {
      code: lambda.Code.fromAsset('resource/utils/layer-package.zip'),
    });

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
    props.usersTable.grantReadWriteData(friendsEvent);
    props.api.grant(friendsEvent, appsync.IamResource.ofType('Mutation', 'publishFriend'), 'appsync:GraphQL');

    const streamEventSourceProps: eventsources.StreamEventSourceProps = {
      startingPosition: lambda.StartingPosition.LATEST,
      batchSize: 5,
      retryAttempts: 1,
      reportBatchItemFailures: true,
    };

    friendsEvent.addEventSource(
      new eventsources.DynamoEventSource(props.friendsTable, {
        // define filters here
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

    const usersDS = props.api.addDynamoDbDataSource("usersDataSource", props.usersTable)

    const publishFriendFunc = new appsync.AppsyncFunction(this, 'FuncPublishFriend', {
      name: 'publishFriendFunc',
      api:props.api,
      dataSource: usersDS,
      code: appsync.Code.fromAsset("resource/resolvers/Mutation.publishFriend.js"),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
    });
    
    new appsync.Resolver(this, 'pipeline-resolver-mutation-publishFriend', {
      api: props.api,
      typeName: 'Mutation',
      fieldName: 'publishFriend',
          code: appsync.Code.fromInline(`
              export function request(ctx) {
                console.log(ctx);
                return {};
              }
    
              export function response(ctx) {
                return ctx.prev.result;
              }
          `),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
      pipelineConfig: [publishFriendFunc],
    });

    const noneDS = props.api.addNoneDataSource("NoneDataSource")

    const onPublishFriendFunc = new appsync.AppsyncFunction(this, 'FuncOnPublishFriend', {
      name: 'onPublishFriendFunc',
      api:props.api,
      dataSource: noneDS,
      code: appsync.Code.fromAsset("resource/resolvers/Subscription.onPublishFriend.js"),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
    });
    
    new appsync.Resolver(this, 'pipeline-resolver-subscription-onPublishFriend', {
      api: props.api,
      typeName: 'Subscription',
      fieldName: 'onPublishFriend',
          code: appsync.Code.fromInline(`
              export function request(ctx) {
                console.log(ctx);
                return {};
              }
    
              export function response(ctx) {
                return ctx.prev.result;
              }
          `),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
      pipelineConfig: [onPublishFriendFunc],
    });
    // noneDS.createResolver('SubscriptionOnFriendResolver', {
    //   typeName: 'Subscription',
    //   fieldName: 'onPublishFriend',
    //   code: appsync.Code.fromAsset('resource/resolvers/Subscription.onPublishFriend.js'),
    // })
  }
}