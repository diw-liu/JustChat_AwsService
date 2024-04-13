import { Construct } from 'constructs';
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as eventsources from 'aws-cdk-lib/aws-lambda-event-sources';

export class MessageServiceStack extends Construct {
  constructor(scope: Construct, id: string, props?: any) {
    super(scope, id);

    const messageDLQ = new sqs.Queue(this, 'MessageDLQ')
    const messageSQS = new sqs.Queue(this, 'MessageQueue', {
      deadLetterQueue: {
        maxReceiveCount: 1,
        queue: messageDLQ
      }
    })

    const appsyncLayer = new lambda.LayerVersion(this, 'AppSyncLayer', {
      code: lambda.Code.fromAsset('resource/utils/layer-package.zip'),
    });

    const sendMessage = new lambda.Function(this, 'SendMessageLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset("resource/messageLambda"),
      handler: "requestMessage.handler",
      environment: {
        MESSAGE_TABLE_NAME: props.messagesTable.tableName
      },
      layers: [appsyncLayer]
    })
    sendMessage.addEventSource(new eventsources.SqsEventSource(messageSQS));
    props.messagesTable.grantReadWriteData(sendMessage);

    const datasource = props.api.addHttpDataSource(
      'messageSQSDataSource',
      `https://sqs.${props.region}.amazonaws.com`,
			{
				authorizationConfig: {
					signingRegion: props.region,
					signingServiceName: 'sqs',
				},
			}
		)
    datasource.node.addDependency(messageSQS)
    messageSQS.grantSendMessages(datasource.grantPrincipal)

    const messageSQSFunction = new appsync.AppsyncFunction(this, 'messageSQSFunction', {
      name: 'messageSQSFunction',
      api: props.api,
      dataSource: datasource,
      code: appsync.Code.fromAsset("resource/resolvers/messageSQS.js"),
      runtime: appsync.FunctionRuntime.JS_1_0_0
    })

    const pipelineVars = JSON.stringify({
			accountId: props.account,
			queueUrl: messageSQS.queueUrl,
			queueName: messageSQS.queueName,
		})

    new appsync.Resolver(this, 'messagePipelineResolver', {
			api: props.api,
			typeName: 'Mutation',
			fieldName: 'sendMessage',
			code: appsync.Code.fromInline(`
            export function request(...args) {
              console.log(args);
              return ${pipelineVars}
            }
            export function response(ctx) {
              return ctx.prev.result
            }
          `),
			runtime: appsync.FunctionRuntime.JS_1_0_0,
      pipelineConfig: [messageSQSFunction]
		})

    const messageEvent = new lambda.Function(this, 'MessageEventLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset("resource/messageLambda"),
      handler: "messageEvent.handler",
      environment: {
        MESSAGE_TABLE_NAME: props.messagesTable.tableName,
        APPSYNC_URL: props.api.graphqlUrl        
      },
      layers: [appsyncLayer]
    })
    props.api.grant(messageEvent, appsync.IamResource.ofType('Mutation', 'publishMessage'), 'appsync:GraphQL');
  
    const streamEventSourceProps: eventsources.StreamEventSourceProps = {
      startingPosition: lambda.StartingPosition.LATEST,
      batchSize: 5,
      retryAttempts: 1,
      reportBatchItemFailures: true,
    };

    messageEvent.addEventSource(
      new eventsources.DynamoEventSource(props.messagesTable, {
        filters: [
          lambda.FilterCriteria.filter({
            eventName: lambda.FilterRule.isEqual('INSERT')
          })
        ],
        ...streamEventSourceProps
      })
    );

    const messageDS = props.api.addDynamoDbDataSource("messageDataSource", props.messagesTable);

    new appsync.Resolver(this, 'resolver-friend-messages', {
      api: props.api,
      dataSource: messageDS,
      typeName: 'Friend',
      fieldName: 'Messages',
      code: appsync.Code.fromAsset("resource/resolvers/Friend.Messages.js"),
      runtime: appsync.FunctionRuntime.JS_1_0_0
    })

    new appsync.Resolver(this, 'resolver-query-getMessage', {
      api: props.api,
      dataSource: messageDS,
      typeName: 'Query',
      fieldName: 'getMessage',
      code: appsync.Code.fromAsset("resource/resolvers/Friend.Messages.js"),
      runtime: appsync.FunctionRuntime.JS_1_0_0
    }) 

    const noneDS = props.api.addNoneDataSource("messageNoneDataSource")
  
    new appsync.Resolver(this, 'resolver-mutation-publishMessage', {
      api: props.api,
      dataSource: noneDS,
      typeName: 'Mutation',
      fieldName: 'publishMessage',
      code: appsync.Code.fromAsset("resource/resolvers/Mutation.publishMessage.js"),
      runtime: appsync.FunctionRuntime.JS_1_0_0
    });

    new appsync.Resolver(this, 'resolver-subscription-onPublishMessage', {
      api: props.api,
      dataSource: noneDS,
      typeName: 'Subscription',
      fieldName: 'onPublishMessage',
      code: appsync.Code.fromAsset("resource/resolvers/Subscription.onPublishMessage.js"),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
    });
  }
}