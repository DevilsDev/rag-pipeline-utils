---
sidebar_position: 19
---

# AWS Deployment Guide

Deploy RAG Pipeline Utils on AWS using ECS, EKS, or Lambda with production-grade configurations, auto-scaling, and AWS service integrations.

## Overview

This guide covers:

- Amazon ECS (Elastic Container Service) deployment
- Amazon EKS (Elastic Kubernetes Service) deployment
- AWS Lambda serverless deployment
- VPC and networking configuration
- IAM roles and security
- Auto-scaling with Application Load Balancer
- Monitoring with CloudWatch and X-Ray

## Prerequisites

- AWS CLI configured
- AWS account with appropriate permissions
- Docker image pushed to ECR
- Basic AWS knowledge

## Amazon ECS Deployment

### Push Image to ECR

```bash
# Create ECR repository
aws ecr create-repository \
  --repository-name rag-pipeline-utils \
  --region us-east-1

# Authenticate Docker to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  123456789012.dkr.ecr.us-east-1.amazonaws.com

# Tag and push image
docker tag rag-pipeline-utils:2.3.1 \
  123456789012.dkr.ecr.us-east-1.amazonaws.com/rag-pipeline-utils:2.3.1

docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/rag-pipeline-utils:2.3.1
```

### ECS Task Definition

```json
{
  "family": "rag-pipeline",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "2048",
  "memory": "4096",
  "executionRoleArn": "arn:aws:iam::123456789012:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::123456789012:role/ragPipelineTaskRole",
  "containerDefinitions": [
    {
      "name": "rag-app",
      "image": "123456789012.dkr.ecr.us-east-1.amazonaws.com/rag-pipeline-utils:2.3.1",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "LOG_LEVEL",
          "value": "info"
        }
      ],
      "secrets": [
        {
          "name": "OPENAI_API_KEY",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789012:secret:rag/openai-api-key"
        },
        {
          "name": "JWT_SECRET",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789012:secret:rag/jwt-secret"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/rag-pipeline",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": [
          "CMD-SHELL",
          "node -e \"require('http').get('http://localhost:3000/health')\""
        ],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      },
      "resourceRequirements": [
        {
          "type": "InferenceAccelerator",
          "value": "device_1"
        }
      ]
    }
  ]
}
```

### ECS Service with Auto-Scaling

```bash
# Create ECS cluster
aws ecs create-cluster \
  --cluster-name rag-pipeline-cluster \
  --capacity-providers FARGATE FARGATE_SPOT \
  --default-capacity-provider-strategy \
    capacityProvider=FARGATE,weight=1 \
    capacityProvider=FARGATE_SPOT,weight=4

# Create service
aws ecs create-service \
  --cluster rag-pipeline-cluster \
  --service-name rag-pipeline-service \
  --task-definition rag-pipeline:1 \
  --desired-count 3 \
  --launch-type FARGATE \
  --platform-version LATEST \
  --network-configuration \
    "awsvpcConfiguration={
      subnets=[subnet-12345,subnet-67890],
      securityGroups=[sg-12345],
      assignPublicIp=ENABLED
    }" \
  --load-balancers \
    "targetGroupArn=arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/rag-pipeline,
     containerName=rag-app,
     containerPort=3000"

# Configure auto-scaling
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/rag-pipeline-cluster/rag-pipeline-service \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 3 \
  --max-capacity 10

# Add scaling policy
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/rag-pipeline-cluster/rag-pipeline-service \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name cpu-scaling \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration \
    "TargetValue=70.0,
     PredefinedMetricSpecification={
       PredefinedMetricType=ECSServiceAverageCPUUtilization
     }"
```

### CloudFormation Template for ECS

```yaml
# cloudformation/ecs-stack.yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: RAG Pipeline Utils ECS Deployment

Parameters:
  ImageUri:
    Type: String
    Description: ECR image URI

  VpcId:
    Type: AWS::EC2::VPC::Id
    Description: VPC ID

  SubnetIds:
    Type: List<AWS::EC2::Subnet::Id>
    Description: Subnet IDs

Resources:
  ECSCluster:
    Type: AWS::ECS::Cluster
    Properties:
      ClusterName: rag-pipeline-cluster
      CapacityProviders:
        - FARGATE
        - FARGATE_SPOT
      DefaultCapacityProviderStrategy:
        - CapacityProvider: FARGATE
          Weight: 1
        - CapacityProvider: FARGATE_SPOT
          Weight: 4

  TaskDefinition:
    Type: AWS::ECS::TaskDefinition
    Properties:
      Family: rag-pipeline
      NetworkMode: awsvpc
      RequiresCompatibilities:
        - FARGATE
      Cpu: 2048
      Memory: 4096
      ExecutionRoleArn: !GetAtt ExecutionRole.Arn
      TaskRoleArn: !GetAtt TaskRole.Arn
      ContainerDefinitions:
        - Name: rag-app
          Image: !Ref ImageUri
          Essential: true
          PortMappings:
            - ContainerPort: 3000
          Environment:
            - Name: NODE_ENV
              Value: production
          Secrets:
            - Name: OPENAI_API_KEY
              ValueFrom: !Sub "arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:rag/openai-api-key"
          LogConfiguration:
            LogDriver: awslogs
            Options:
              awslogs-group: !Ref LogGroup
              awslogs-region: !Ref AWS::Region
              awslogs-stream-prefix: ecs

  Service:
    Type: AWS::ECS::Service
    Properties:
      ServiceName: rag-pipeline-service
      Cluster: !Ref ECSCluster
      TaskDefinition: !Ref TaskDefinition
      DesiredCount: 3
      LaunchType: FARGATE
      NetworkConfiguration:
        AwsvpcConfiguration:
          AssignPublicIp: ENABLED
          Subnets: !Ref SubnetIds
          SecurityGroups:
            - !Ref SecurityGroup
      LoadBalancers:
        - ContainerName: rag-app
          ContainerPort: 3000
          TargetGroupArn: !Ref TargetGroup

  LoadBalancer:
    Type: AWS::ElasticLoadBalancingV2::LoadBalancer
    Properties:
      Name: rag-pipeline-alb
      Subnets: !Ref SubnetIds
      SecurityGroups:
        - !Ref ALBSecurityGroup
      Type: application

  TargetGroup:
    Type: AWS::ElasticLoadBalancingV2::TargetGroup
    Properties:
      Name: rag-pipeline-tg
      Port: 3000
      Protocol: HTTP
      VpcId: !Ref VpcId
      TargetType: ip
      HealthCheckPath: /health
      HealthCheckIntervalSeconds: 30
      HealthCheckTimeoutSeconds: 5
      HealthyThresholdCount: 2

  ExecutionRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal:
              Service: ecs-tasks.amazonaws.com
            Action: sts:AssumeRole
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
      Policies:
        - PolicyName: SecretsManagerAccess
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - Effect: Allow
                Action:
                  - secretsmanager:GetSecretValue
                Resource: !Sub "arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:rag/*"

Outputs:
  LoadBalancerDNS:
    Description: Load Balancer DNS Name
    Value: !GetAtt LoadBalancer.DNSName
```

## Amazon EKS Deployment

### Create EKS Cluster

```bash
# Install eksctl
curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp
sudo mv /tmp/eksctl /usr/local/bin

# Create cluster
eksctl create cluster \
  --name rag-pipeline-cluster \
  --region us-east-1 \
  --nodegroup-name standard-workers \
  --node-type t3.xlarge \
  --nodes 3 \
  --nodes-min 3 \
  --nodes-max 10 \
  --managed \
  --asg-access \
  --external-dns-access \
  --full-ecr-access \
  --alb-ingress-access

# Configure kubectl
aws eks update-kubeconfig --name rag-pipeline-cluster --region us-east-1
```

### eksctl Cluster Configuration

```yaml
# eks-cluster.yaml
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig

metadata:
  name: rag-pipeline-cluster
  region: us-east-1
  version: "1.28"

iam:
  withOIDC: true

managedNodeGroups:
  - name: standard-workers
    instanceType: t3.xlarge
    minSize: 3
    maxSize: 10
    desiredCapacity: 3
    volumeSize: 100
    ssh:
      allow: false
    labels:
      role: worker
    tags:
      Environment: production
    iam:
      withAddonPolicies:
        autoScaler: true
        albIngress: true
        externalDNS: true
        certManager: true

addons:
  - name: vpc-cni
  - name: coredns
  - name: kube-proxy
  - name: aws-ebs-csi-driver

cloudWatch:
  clusterLogging:
    enableTypes: ["all"]
```

**Create cluster:**

```bash
eksctl create cluster -f eks-cluster.yaml
```

### Deploy to EKS

Use the Kubernetes manifests from the [Kubernetes Deployment Guide](/docs/Deployment-Kubernetes), with AWS-specific configurations:

```yaml
# AWS Load Balancer Controller ingress
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: rag-pipeline
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:us-east-1:123456789012:certificate/xxx
    alb.ingress.kubernetes.io/ssl-policy: ELBSecurityPolicy-TLS-1-2-2017-01
spec:
  rules:
    - host: rag.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: rag-pipeline
                port:
                  number: 80
```

## AWS Lambda Deployment

### Lambda Function Code

```javascript
// lambda/index.js
const { createRagPipeline } = require("@devilsdev/rag-pipeline-utils");

let pipeline;

// Initialize pipeline (cold start optimization)
const initPipeline = async () => {
  if (!pipeline) {
    pipeline = createRagPipeline({
      embedder: {
        type: "openai",
        apiKey: process.env.OPENAI_API_KEY,
      },
      retriever: {
        type: "pinecone",
        apiKey: process.env.PINECONE_API_KEY,
      },
      llm: {
        type: "openai",
        model: "gpt-4",
      },
    });
  }
  return pipeline;
};

exports.handler = async (event) => {
  try {
    const pipeline = await initPipeline();

    const { query } = JSON.parse(event.body);

    const result = await pipeline.query(query, {
      topK: 5,
      timeout: 25000, // Lambda 30s limit
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
```

### SAM Template

```yaml
# template.yaml
AWSTemplateFormatVersion: "2010-09-09"
Transform: AWS::Serverless-2016-10-31
Description: RAG Pipeline Utils Lambda Deployment

Globals:
  Function:
    Timeout: 30
    MemorySize: 3008
    Runtime: nodejs20.x
    Architectures:
      - arm64
    Environment:
      Variables:
        NODE_ENV: production
        LOG_LEVEL: info

Resources:
  RagPipelineFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: rag-pipeline-query
      CodeUri: lambda/
      Handler: index.handler
      Description: RAG Pipeline Query Handler
      Environment:
        Variables:
          OPENAI_API_KEY: !Sub "{{resolve:secretsmanager:rag/openai-api-key}}"
          PINECONE_API_KEY: !Sub "{{resolve:secretsmanager:rag/pinecone-api-key}}"
      Policies:
        - AWSSecretsManagerGetSecretValuePolicy:
            SecretArn: !Sub "arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:rag/*"
      Events:
        ApiEvent:
          Type: Api
          Properties:
            Path: /query
            Method: post
            RestApiId: !Ref RagApi
      ReservedConcurrentExecutions: 100
      EphemeralStorage:
        Size: 1024
      Layers:
        - !Ref DependenciesLayer

  DependenciesLayer:
    Type: AWS::Serverless::LayerVersion
    Properties:
      LayerName: rag-pipeline-dependencies
      Description: Node modules for RAG Pipeline
      ContentUri: layer/
      CompatibleRuntimes:
        - nodejs20.x

  RagApi:
    Type: AWS::Serverless::Api
    Properties:
      Name: rag-pipeline-api
      StageName: prod
      Cors:
        AllowMethods: "'POST, GET, OPTIONS'"
        AllowHeaders: "'Content-Type,Authorization'"
        AllowOrigin: "'*'"
      Auth:
        ApiKeyRequired: true

Outputs:
  ApiUrl:
    Description: API Gateway URL
    Value: !Sub "https://${RagApi}.execute-api.${AWS::Region}.amazonaws.com/prod"
```

**Deploy:**

```bash
# Build
sam build

# Deploy
sam deploy --guided \
  --stack-name rag-pipeline-lambda \
  --capabilities CAPABILITY_IAM \
  --region us-east-1
```

## IAM Roles and Policies

### ECS Task Role

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::rag-pipeline-data/*"
    },
    {
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue"],
      "Resource": "arn:aws:secretsmanager:*:*:secret:rag/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    }
  ]
}
```

## Monitoring and Logging

### CloudWatch Logs

```bash
# Create log group
aws logs create-log-group \
  --log-group-name /ecs/rag-pipeline

# Set retention
aws logs put-retention-policy \
  --log-group-name /ecs/rag-pipeline \
  --retention-in-days 30

# Query logs
aws logs filter-log-events \
  --log-group-name /ecs/rag-pipeline \
  --filter-pattern "ERROR" \
  --start-time $(date -d '1 hour ago' +%s)000
```

### X-Ray Tracing

```javascript
// Enable X-Ray
const AWSXRay = require("aws-xray-sdk-core");
const AWS = AWSXRay.captureAWS(require("aws-sdk"));

// Instrument HTTP requests
AWSXRay.captureHTTPsGlobal(require("http"));
AWSXRay.captureHTTPsGlobal(require("https"));
```

## Cost Optimization

### ECS Fargate Spot

```json
{
  "capacityProviders": ["FARGATE", "FARGATE_SPOT"],
  "defaultCapacityProviderStrategy": [
    {
      "capacityProvider": "FARGATE_SPOT",
      "weight": 4,
      "base": 0
    },
    {
      "capacityProvider": "FARGATE",
      "weight": 1,
      "base": 2
    }
  ]
}
```

### Lambda Provisioned Concurrency

```bash
aws lambda put-provisioned-concurrency-config \
  --function-name rag-pipeline-query \
  --provisioned-concurrent-executions 10 \
  --qualifier LATEST
```

## Troubleshooting

### ECS Task Not Starting

```bash
# Check task status
aws ecs describe-tasks \
  --cluster rag-pipeline-cluster \
  --tasks task-id

# View logs
aws logs tail /ecs/rag-pipeline --follow
```

### Lambda Timeout Issues

```bash
# Increase timeout
aws lambda update-function-configuration \
  --function-name rag-pipeline-query \
  --timeout 60

# Increase memory
aws lambda update-function-configuration \
  --function-name rag-pipeline-query \
  --memory-size 3008
```

## Next Steps

- [Azure Deployment](/docs/Deployment-Azure) - Deploy on Azure
- [GCP Deployment](/docs/Deployment-GCP) - Deploy on Google Cloud
- [Monitoring Guide](/docs/Observability) - Comprehensive monitoring

## Additional Resources

- [AWS ECS Best Practices](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/)
- [AWS EKS Best Practices](https://aws.github.io/aws-eks-best-practices/)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)
