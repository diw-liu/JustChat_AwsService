import { Construct } from "constructs";
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as logs from 'aws-cdk-lib/aws-logs';

export class AppsyncStack extends Construct {
  public readonly api: appsync.GraphqlApi;
  constructor(scope: Construct, id: string, props?: any) {
    super(scope, id);

    const logConfig: appsync.LogConfig = {
      fieldLogLevel: appsync.FieldLogLevel.ALL,
      retention: logs.RetentionDays.ONE_WEEK,
    };

    this.api = new appsync.GraphqlApi(this, "JustChatAPI", {
      name: 'JustChat',
      definition: appsync.Definition.fromFile('graphql/schema.graphql'),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.USER_POOL,
          userPoolConfig: {
            userPool: props.userpool
          }
        },
        additionalAuthorizationModes: [
          {
            authorizationType: appsync.AuthorizationType.IAM,
          }
        ]
      },
      logConfig,
      xrayEnabled: true,
    })

  }
}