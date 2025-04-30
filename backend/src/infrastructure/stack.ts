import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create DynamoDB tables
    const stateTable = new dynamodb.Table(this, 'OAuthStateTable', {
      partitionKey: { name: 'key', type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Add GSI for timestamp-based queries
    stateTable.addGlobalSecondaryIndex({
      indexName: 'TimestampIndex',
      partitionKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      sortKey: { name: 'key', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL
    });

    const sessionTable = new dynamodb.Table(this, 'OAuthSessionTable', {
      partitionKey: { name: 'key', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const verificationTable = new dynamodb.Table(this, 'VerificationTable', {
      partitionKey: { name: 'orcidId', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Add GSI for blueskyHandle
    verificationTable.addGlobalSecondaryIndex({
      indexName: 'BlueskyHandleIndex',
      partitionKey: { name: 'blueskyHandle', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL
    });

    // Create Lambda function
    const oauthHandler = new lambda.Function(this, 'OAuthHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda'), {
        bundling: {
          image: cdk.DockerImage.fromRegistry('node:18'),
          command: [
            'bash', '-c', [
              'cd /asset-input',
              'npm install',
              'npm run build',
              'cp -r dist/* /asset-output/',
              'cp -r node_modules /asset-output/',
              'ls -la /asset-output/'
            ].join(' && ')
          ],
          user: 'root',
          outputType: cdk.BundlingOutput.NOT_ARCHIVED,
          local: {
            tryBundle(outputDir: string) {
              try {
                const distPath = path.join(__dirname, '../lambda/dist');
                const nodeModulesPath = path.join(__dirname, '../lambda/node_modules');
                
                if (!fs.existsSync(distPath)) {
                  console.error('dist directory does not exist:', distPath);
                  return false;
                }

                console.log('Copying dist directory contents from:', distPath);
                console.log('To output directory:', outputDir);
                fs.cpSync(distPath, outputDir, { recursive: true });
                
                if (fs.existsSync(nodeModulesPath)) {
                  console.log('Copying node_modules from:', nodeModulesPath);
                  fs.cpSync(nodeModulesPath, path.join(outputDir, 'node_modules'), { recursive: true });
                } else {
                  console.error('node_modules directory does not exist:', nodeModulesPath);
                }

                console.log('Contents of output directory:', fs.readdirSync(outputDir));
                return true;
              } catch (err) {
                console.error('Local bundling failed:', err);
                return false;
              }
            }
          }
        }
      }),
      environment: {
        OAUTH_STATE_TABLE: stateTable.tableName,
        OAUTH_SESSION_TABLE: sessionTable.tableName,
        CLIENT_ID: process.env.CLIENT_ID || '',
        CLIENT_SECRET: process.env.CLIENT_SECRET || '',
        PUBLIC_URL: process.env.PUBLIC_URL || 'https://bsky-scientific-verifier.vercel.app',
        REDIRECT_URI: process.env.PUBLIC_URL ? `${process.env.PUBLIC_URL}/api/orcid/callback` : 'https://bsky-scientific-verifier.vercel.app/api/orcid/callback',
        OAUTH_AUTH_URL: process.env.OAUTH_AUTH_URL || 'https://orcid.org/oauth/authorize',
        OAUTH_TOKEN_URL: process.env.OAUTH_TOKEN_URL || 'https://orcid.org/oauth/token',
        OAUTH_USERINFO_URL: process.env.OAUTH_USERINFO_URL || 'https://orcid.org/oauth/userinfo',
        ATP_HANDLE_RESOLVER: process.env.ATP_HANDLE_RESOLVER || 'https://bsky.social',
        ATP_PROVIDER: 'atproto',
        ORCID_PROVIDER: 'orcid',
        VERIFICATION_TABLE: verificationTable.tableName
      }
    });

    // Grant permissions
    stateTable.grantReadWriteData(oauthHandler);
    sessionTable.grantReadWriteData(oauthHandler);
    verificationTable.grantReadWriteData(oauthHandler);

    // Create API Gateway
    const api = new apigateway.RestApi(this, 'OAuthApi', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['*'],
        allowCredentials: true
      },
      deployOptions: {
        stageName: 'prod',
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true
      }
    });

    // Add Lambda integration with proper request/response mapping
    const integration = new apigateway.LambdaIntegration(oauthHandler, {
      proxy: true,
      integrationResponses: [
        {
          statusCode: '200',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': "'*'",
            'method.response.header.Access-Control-Allow-Headers': "'*'",
            'method.response.header.Access-Control-Allow-Methods': "'*'",
            'method.response.header.Access-Control-Allow-Credentials': "'true'"
          }
        },
        {
          statusCode: '302',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': "'*'",
            'method.response.header.Access-Control-Allow-Headers': "'*'",
            'method.response.header.Access-Control-Allow-Methods': "'*'",
            'method.response.header.Access-Control-Allow-Credentials': "'true'",
            'method.response.header.Location': 'integration.response.header.Location'
          }
        },
        {
          statusCode: '400',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': "'*'",
            'method.response.header.Access-Control-Allow-Headers': "'*'",
            'method.response.header.Access-Control-Allow-Methods': "'*'",
            'method.response.header.Access-Control-Allow-Credentials': "'true'"
          }
        },
        {
          statusCode: '500',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': "'*'",
            'method.response.header.Access-Control-Allow-Headers': "'*'",
            'method.response.header.Access-Control-Allow-Methods': "'*'",
            'method.response.header.Access-Control-Allow-Credentials': "'true'"
          }
        }
      ]
    });
    
    // Add /oauth resource and methods with proper response models
    const oauth = api.root.addResource('oauth');
    const authorize = oauth.addResource('authorize');
    const callback = oauth.addResource('callback');
    
    const methodOptions: apigateway.MethodOptions = {
      methodResponses: [
        {
          statusCode: '200',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.Access-Control-Allow-Headers': true,
            'method.response.header.Access-Control-Allow-Methods': true,
            'method.response.header.Access-Control-Allow-Credentials': true
          }
        },
        {
          statusCode: '302',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.Access-Control-Allow-Headers': true,
            'method.response.header.Access-Control-Allow-Methods': true,
            'method.response.header.Access-Control-Allow-Credentials': true,
            'method.response.header.Location': true
          }
        },
        {
          statusCode: '400',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.Access-Control-Allow-Headers': true,
            'method.response.header.Access-Control-Allow-Methods': true,
            'method.response.header.Access-Control-Allow-Credentials': true
          }
        },
        {
          statusCode: '500',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.Access-Control-Allow-Headers': true,
            'method.response.header.Access-Control-Allow-Methods': true,
            'method.response.header.Access-Control-Allow-Credentials': true
          }
        }
      ],
      requestParameters: {
        'method.request.querystring.code': false,
        'method.request.querystring.state': false,
        'method.request.querystring.provider': false
      }
    };
    
    authorize.addMethod('GET', integration, methodOptions);
    authorize.addMethod('POST', integration, methodOptions);
    callback.addMethod('GET', integration, methodOptions);
    callback.addMethod('POST', integration, methodOptions);

    // Add /initiate endpoint
    const initiate = api.root.addResource('initiate');
    initiate.addMethod('GET', integration, methodOptions);
    initiate.addMethod('POST', integration, methodOptions);

    // Add /labels endpoint
    const labels = api.root.addResource('labels');
    labels.addMethod('POST', integration, {
      ...methodOptions,
      authorizationType: apigateway.AuthorizationType.NONE
    });

    // Create API key
    const apiKey = new apigateway.ApiKey(this, 'ApiKey', {
      description: 'API key for label operations'
    });

    // Create usage plan
    const usagePlan = new apigateway.UsagePlan(this, 'UsagePlan', {
      name: 'LabelOperationsUsagePlan',
      apiStages: [
        {
          api: api,
          stage: api.deploymentStage
        }
      ]
    });

    // Associate API key with usage plan
    usagePlan.addApiKey(apiKey);
  }
} 