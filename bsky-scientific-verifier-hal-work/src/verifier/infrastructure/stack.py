from aws_cdk import (
    Stack,
    aws_lambda as _lambda,
    aws_apigateway as apigw,
    aws_dynamodb as dynamodb,
    aws_ssm as ssm,
    RemovalPolicy,
    Duration,
    CfnOutput,
)
from constructs import Construct

class VerificationServiceStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Create DynamoDB tables
        verification_table = dynamodb.Table(
            self, "VerificationTable",
            partition_key=dynamodb.Attribute(
                name="PK",
                type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="SK",
                type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
            time_to_live_attribute="ttl"
        )

        # Add GSI for ORCID lookup
        verification_table.add_global_secondary_index(
            index_name="ByOrcidId",
            partition_key=dynamodb.Attribute(
                name="GSI1PK",
                type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="GSI1SK",
                type=dynamodb.AttributeType.STRING
            )
        )

        # Add GSI for Bluesky DID lookup
        verification_table.add_global_secondary_index(
            index_name="ByBlueskyDid",
            partition_key=dynamodb.Attribute(
                name="GSI2PK",
                type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="GSI2SK",
                type=dynamodb.AttributeType.STRING
            )
        )

        # Create Lambda function
        handler = _lambda.Function(
            self, "VerificationHandler",
            runtime=_lambda.Runtime.PYTHON_3_11,
            code=_lambda.Code.from_asset(
                "../api",
                bundling={
                    "image": _lambda.Runtime.PYTHON_3_11.bundling_image,
                    "command": [
                        "bash", "-c", """
                        pip install -r requirements.txt -t /asset-output &&
                        cp -r . /asset-output
                        """
                    ]
                }
            ),
            handler="app.app",
            timeout=Duration.seconds(30),
            environment={
                "VERIFICATION_TABLE": verification_table.table_name,
            }
        )

        # Grant Lambda permissions to DynamoDB
        verification_table.grant_read_write_data(handler)

        # Grant Lambda permissions to read SSM parameters
        ssm_client_id = ssm.StringParameter.from_secure_string_parameter_attributes(
            self, "OrcidClientId",
            parameter_name="/verifier/orcid/client-id"
        )
        ssm_client_secret = ssm.StringParameter.from_secure_string_parameter_attributes(
            self, "OrcidClientSecret",
            parameter_name="/verifier/orcid/client-secret"
        )
        
        # Grant read permissions
        ssm_client_id.grant_read(handler)
        ssm_client_secret.grant_read(handler)

        # Create API Gateway
        api = apigw.LambdaRestApi(
            self, "VerificationAPI",
            handler=handler,
            proxy=False,
            deploy_options=apigw.StageOptions(
                stage_name="v1",
                logging_level=apigw.MethodLoggingLevel.OFF,
                data_trace_enabled=False
            )
        )

        # Output the API Gateway URL
        CfnOutput(
            self, "ApiGatewayUrl",
            value=api.url,
            description="The URL of the API Gateway"
        )

        # Define API routes
        initiate = api.root.add_resource("initiate")
        initiate.add_method("GET")

        callback = api.root.add_resource("callback")
        callback.add_method("GET")

        verify = api.root.add_resource("verify")
        verify.add_method("POST")

        status = api.root.add_resource("status")
        status.add_method("GET") 