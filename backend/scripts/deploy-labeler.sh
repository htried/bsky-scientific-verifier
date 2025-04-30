#!/bin/bash

# Exit on error
set -e

# Configuration
ENVIRONMENT=${1:-development}
AWS_PROFILE=${AWS_PROFILE:-bsky-scientific-verifier}
AWS_REGION=${AWS_REGION:-us-east-1}
ECR_REPOSITORY_NAME="bsky-labeler"
IMAGE_TAG="latest"
VPC_ID="vpc-096358123f40c829b"
SUBNET_IDS="subnet-0c9318f5dcb7b1519,subnet-04f117290c386ba2d,subnet-0d2b6184fe54b770c,subnet-03ccdedfeee088c12,subnet-0eddaf49eddc67ee2,subnet-0ed9c64dce9da0f2c"
LABELER_DID="did:plc:b7rzlpwqc2qkqfil63t5bd6u"
LABELER_DB_URL="libsql://bsky-labeler-htried.aws-us-east-1.turso.io"
BSKY_IDENTIFIER="ruff-specialist.bsky.social"

# Get AWS account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --profile ${AWS_PROFILE} --query Account --output text)
ECR_REPOSITORY_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY_NAME}"

# Build the Docker image
echo "Building Docker image..."
docker build -t ${ECR_REPOSITORY_NAME}:${IMAGE_TAG} -f Dockerfile.labeler .

# Login to ECR
echo "Logging in to ECR..."
aws ecr get-login-password --profile ${AWS_PROFILE} --region ${AWS_REGION} | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

# Create ECR repository if it doesn't exist
aws ecr describe-repositories --profile ${AWS_PROFILE} --repository-names ${ECR_REPOSITORY_NAME} || \
  aws ecr create-repository --profile ${AWS_PROFILE} --repository-name ${ECR_REPOSITORY_NAME}

# Tag and push the image
echo "Pushing Docker image to ECR..."
docker tag ${ECR_REPOSITORY_NAME}:${IMAGE_TAG} ${ECR_REPOSITORY_URI}:${IMAGE_TAG}
docker push ${ECR_REPOSITORY_URI}:${IMAGE_TAG}

# Deploy the CloudFormation stack
echo "Deploying CloudFormation stack..."
aws cloudformation deploy \
  --profile ${AWS_PROFILE} \
  --template-file cloudformation/labeler-service.yml \
  --stack-name bsky-labeler-${ENVIRONMENT} \
  --parameter-overrides \
    Environment=${ENVIRONMENT} \
    EcrRepositoryUri=${ECR_REPOSITORY_URI} \
    EcrImageTag=${IMAGE_TAG} \
    VpcId=${VPC_ID} \
    SubnetIds=${SUBNET_IDS} \
    LabelerDid=${LABELER_DID} \
    LabelerDbUrl=${LABELER_DB_URL} \
    BskyIdentifier=${BSKY_IDENTIFIER} \
  --capabilities CAPABILITY_IAM \
  --region ${AWS_REGION}

echo "Deployment complete!" 