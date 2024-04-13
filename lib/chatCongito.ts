import { Construct } from "constructs";
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from "aws-cdk-lib/aws-lambda";

export class CongitoStack extends Construct {
  public readonly userpool: cognito.UserPool;
  public readonly client: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: any){
    super(scope, id)
    
    const usersTable = props.usersTable;

    const preSignTrigger = new lambda.Function(this, "PreSignTrigger", {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset("resource/triggers"),
      handler: "preSignTrigger.handler",
      environment: {
        USERS_TABLE_NAME: usersTable.tableName
      }
    })

    const postSignTrigger = new lambda.Function(this, "PostSignTrigger", {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset("resource/triggers"),
      handler: "postSignTrigger.handler",
      environment: {
        USERS_TABLE_NAME: usersTable.tableName
      }
    })

    usersTable.grantReadWriteData(postSignTrigger);
    usersTable.grantReadWriteData(preSignTrigger);

    this.userpool = new cognito.UserPool(this, 'BudgetUserpool', {
      userPoolName: 'chatUserpool',
      signInCaseSensitive: false,
      selfSignUpEnabled: true,
      userVerification: {
        emailSubject: 'Verify your email for Just Chat!',
        emailBody: 'Thanks for signing up to Just Chat!! Your verification code is {####}',
        emailStyle: cognito.VerificationEmailStyle.CODE,
        smsMessage: 'Thanks for signing up to Just Chat!! Your verification code is {####}',
      },
      signInAliases: {
        username: true,
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: false
        }
      },
      lambdaTriggers: {
        preSignUp: preSignTrigger,
        postConfirmation: postSignTrigger
      }
    })

    this.client = this.userpool.addClient('JustChatApp', {
      authFlows: {
        userPassword: true,
        userSrp: true
      }
    });
  }
}
