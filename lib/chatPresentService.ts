import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as redis from 'aws-cdk-lib/aws-elasticache';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as events from 'aws-cdk-lib/aws-events';
import * as events_targets from 'aws-cdk-lib/aws-events-targets';

export class PresentServiceStack extends Construct {
  constructor(scope: Construct, id: string, props?: any) {
    super(scope, id);

    const vpc = new ec2.Vpc(this, "Vpc", {
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Redis',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        {
          cidrMask: 24,
          name: 'Lambda',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ]
    });

    const flowLog = new ec2.FlowLog(this, 'VpcFlowLog', {
      resourceType: ec2.FlowLogResourceType.fromVpc(vpc)
    })

    const lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSG', {
      vpc: vpc,
      description: 'SecurityGroup into which Lambdas will be deployed'
    });

    const ecSecurityGroup = new ec2.SecurityGroup(this, 'ElastiCacheSG', {
      vpc: vpc,
      description: 'SecurityGroup associated with the ElastiCache Redis Cluster'
    });

    ecSecurityGroup.connections.allowFrom(lambdaSecurityGroup, ec2.Port.tcp(6379), 'Redis ingress 6379');
    ecSecurityGroup.connections.allowTo(lambdaSecurityGroup, ec2.Port.tcp(6379), 'Redis egress 6379');

    // const producerRole = new iam.Role(this, 'ProducerRole', {
    //   assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    //   description: 'Role to be assumed by producer lambda',
    // });

    // producerRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"));
    // producerRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaVPCAccessExecutionRole"));

    // let isolatedSubnets: string[] = []

    // vpc.isolatedSubnets.forEach(function(value){
    //   isolatedSubnets.push(value.subnetId)
    // });

    const ecSubnetGroup = new redis.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      subnetIds: vpc.selectSubnets({ subnetGroupName: "Redis"}).subnetIds,
      description: "Subnet group for redis"
    });

    const ecCacheCluster = new redis.CfnReplicationGroup(this, 'RedisElasticCache', {
      replicationGroupDescription: "PresenceReplicationGroup",
      cacheNodeType: "cache.t3.small",
      engine: 'redis',
      numCacheClusters: 3,
      autoMinorVersionUpgrade: true,
      multiAzEnabled: true,
      cacheSubnetGroupName: ecSubnetGroup.ref,
      securityGroupIds: [ecSecurityGroup.securityGroupId],
      port: 6379
    })
    
    // Lambda Functions
    const appsyncLayer = new lambda.LayerVersion(this, 'AppSyncLayer', {
      code: lambda.Code.fromAsset('resource/utils/redis-package.zip'),
    });

    const status = new lambda.Function(this, 'StatusLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: "status.handler",
      code : lambda.Code.fromAsset("resource/presenceLambda"),
      layers: [appsyncLayer],
      vpc: vpc,
      vpcSubnets: vpc.selectSubnets({subnetGroupName: "Lambda"}),
      securityGroups: [lambdaSecurityGroup],
      environment: {
        redis_endpoint: ecCacheCluster.attrPrimaryEndPointAddress,
        redis_port: ecCacheCluster.attrPrimaryEndPointPort
      }
    })

    const statusLambdaDS = props.api.addLambdaDataSource('statusLambdaDataSource', status)

    statusLambdaDS.createResolver('resolver-query-status', {
      typeName: 'Query',
      fieldName: 'status',
    })

    const heartbeat = new lambda.Function(this, 'HeartbeatLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: "heartbeat.handler",
      code : lambda.Code.fromAsset("resource/presenceLambda"),
      layers: [appsyncLayer],
      vpc: vpc,
      vpcSubnets: vpc.selectSubnets({subnetGroupName: "Lambda"}),
      securityGroups: [lambdaSecurityGroup],
      environment: {
        redis_endpoint: ecCacheCluster.attrPrimaryEndPointAddress,
        redis_port: ecCacheCluster.attrPrimaryEndPointPort
      }
    })

    const heartbeatLambdaDS = props.api.addLambdaDataSource('heartbeatLambdaDataSource', heartbeat)

    heartbeatLambdaDS.createResolver('resolver-query-heartbeat', {
      typeName: 'Query',
      fieldName: 'heartbeat',
    })

    heartbeatLambdaDS.createResolver('resolver-mutation-connect', {
      typeName: 'Mutation',
      fieldName: 'connect',
    })

    const disconnect = new lambda.Function(this, 'DisconnectLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: "disconnect.handler",
      code : lambda.Code.fromAsset("resource/presenceLambda"),
      layers: [appsyncLayer],
      vpc: vpc,
      vpcSubnets: vpc.selectSubnets({subnetGroupName: "Lambda"}),
      securityGroups: [lambdaSecurityGroup],
      environment: {
        redis_endpoint: ecCacheCluster.attrPrimaryEndPointAddress,
        redis_port: ecCacheCluster.attrPrimaryEndPointPort
      }
    })

    const disconnectLambdaDS = props.api.addLambdaDataSource('disconnectLambdaDataSource', disconnect)

    disconnectLambdaDS.createResolver('resolver-mutation-disconnect', {
      typeName: 'Mutation',
      fieldName: 'disconnect',
    })

    const noneDS = props.api.addNoneDataSource("disconnectedDS");
    const requestMappingTemplate = appsync.MappingTemplate.fromString(`
      {
        "version": "2017-02-28",
        "payload": {
          "id": "$context.arguments.id",
          "status": "offline"
        }        
      }
    `);
    const responseMappingTemplate = appsync.MappingTemplate.fromString(`
      $util.toJson($context.result)
    `);

    new appsync.Resolver(this, 'resolver-mutation-disconnected', {
      api: props.api,
      dataSource: noneDS,
      typeName: 'Mutation',
      fieldName: 'disconnected',
      requestMappingTemplate,
      responseMappingTemplate
    });

    const timeout = new lambda.Function(this, 'TimeoutLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: "timeout.handler",
      code : lambda.Code.fromAsset("resource/presenceLambda"),
      layers: [appsyncLayer],
      vpc: vpc,
      vpcSubnets: vpc.selectSubnets({subnetGroupName: "Lambda"}),
      securityGroups: [lambdaSecurityGroup],
      environment: {
        redis_endpoint: ecCacheCluster.attrPrimaryEndPointAddress,
        redis_port: ecCacheCluster.attrPrimaryEndPointPort
      }
    })

    const on_disconnect = new lambda.Function(this, 'On_disconnectLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: "on_disconnect.handler",
      code : lambda.Code.fromAsset("resource/presenceLambda"),
      layers: [appsyncLayer],
      vpc: vpc,
      vpcSubnets: vpc.selectSubnets({subnetGroupName: "Lambda"}),
      securityGroups: [lambdaSecurityGroup],
      environment: {
        redis_endpoint: ecCacheCluster.attrPrimaryEndPointAddress,
        redis_port: ecCacheCluster.attrPrimaryEndPointPort,
        APPSYNC_URL: props.api.graphqlUrl
      }
    })
    // EventBus
    const presenceBus = new events.EventBus(this, 'PresentEventBus', {
      eventBusName: 'present-event-bus'
    });


    // new events.Rule(this, "PresenceTimeoutRule", {
    //   schedule: events.Schedule.cron({day:"*"}),
    //   targets: [new events_targets.LambdaFunction(timeout)],
    //   enabled: true
    // });

    new events.Rule(this, "PresenceDisconnectRule", {
      eventBus: presenceBus,
      description: "Rule for presence disconnection",
      eventPattern: {
        detailType: ["presence.disconnected"],
        source: ["api.presence"]
      },
      targets: [new events_targets.LambdaFunction(on_disconnect)],
      enabled: true
    });

    // const eventsEndPointSG = new ec2.SecurityGroup(this, "eventsEndPointSG", {
    //   vpc: vpc,
    //   description: "EventBrige interface endpoint SG"
    // });

    // const eventEndpoint = vpc.addInterfaceEndpoint("eventsEndPoint", {
    //   service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_EVENTS,
    //   subnets: vpc.selectSubnets({subnetGroupName: "Lambda"}),
    //   securityGroups: [eventsEndPointSG]
    // });

    // eventEndpoint.connections.allowDefaultPortFromAnyIpv4();

    presenceBus.grantPutEventsTo(timeout);

    timeout.addEnvironment("TIMEOUT", "10000")
      .addEnvironment("EVENT_BUS", presenceBus.eventBusArn)

    disconnect.addEnvironment("EVENT_BUS", presenceBus.eventBusArn)
    
    const allowAppsync = new iam.PolicyStatement({ effect: iam.Effect.ALLOW });
    allowAppsync.addActions("appsync:GraphQL");
    allowAppsync.addResources(props.api.arn + "/*");
    on_disconnect
      .addEnvironment("GRAPHQL_ENDPOINT", props.api.graphqlUrl)
      .addToRolePolicy(allowAppsync);









      

    //expireRule.addTarget(new events_targets.LambdaFunction())
    // const noneDS = props.api.addNoneDataSource("PresentNoneDataSource")

    // new appsync.Resolver(this, 'resolver-mutation-publishStatus', {
    //   api: props.api,
    //   dataSource: noneDS,
    //   typeName: 'Mutation',
    //   fieldName: 'publishStatus',
    //   code: appsync.Code.fromAsset("resource/resolvers/Mutation.publishStatus.js"),
    //   runtime: appsync.FunctionRuntime.JS_1_0_0,
    // });

    // new appsync.Resolver(this, 'resolver-subscription-onPublishStatus', {
    //   api: props.api,
    //   dataSource: noneDS,
    //   typeName: 'Subscription',
    //   fieldName: 'onPublishStatus',
    //   code: appsync.Code.fromAsset("resource/resolvers/Subscription.onPublishStatus.js"),
    //   runtime: appsync.FunctionRuntime.JS_1_0_0,
    // });
  }
}
