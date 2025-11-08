---
sidebar_position: 20
---

# Azure Deployment Guide

Deploy RAG Pipeline Utils on Microsoft Azure using Container Instances, AKS, or Azure Functions with enterprise-grade security and monitoring.

## Overview

Deployment options:

- Azure Container Instances (ACI) for simple deployments
- Azure Kubernetes Service (AKS) for production workloads
- Azure Functions for serverless architecture
- Azure Container Apps for managed containers

## Prerequisites

- Azure CLI installed and configured
- Azure subscription with appropriate permissions
- Docker image in Azure Container Registry (ACR)

## Azure Container Registry

```bash
# Create resource group
az group create --name rag-pipeline-rg --location eastus

# Create container registry
az acr create \
  --resource-group rag-pipeline-rg \
  --name ragpipelineacr \
  --sku Premium \
  --admin-enabled true

# Login to ACR
az acr login --name ragpipelineacr

# Tag and push image
docker tag rag-pipeline-utils:2.3.1 ragpipelineacr.azurecr.io/rag-pipeline:2.3.1
docker push ragpipelineacr.azurecr.io/rag-pipeline:2.3.1
```

## Azure Container Instances

### Quick Deployment

```bash
# Create container instance
az container create \
  --resource-group rag-pipeline-rg \
  --name rag-pipeline-aci \
  --image ragpipelineacr.azurecr.io/rag-pipeline:2.3.1 \
  --cpu 2 \
  --memory 4 \
  --registry-login-server ragpipelineacr.azurecr.io \
  --registry-username $(az acr credential show --name ragpipelineacr --query username -o tsv) \
  --registry-password $(az acr credential show --name ragpipelineacr --query passwords[0].value -o tsv) \
  --dns-name-label rag-pipeline \
  --ports 3000 \
  --environment-variables NODE_ENV=production LOG_LEVEL=info \
  --secure-environment-variables \
    OPENAI_API_KEY=$OPENAI_API_KEY \
    JWT_SECRET=$JWT_SECRET
```

### ARM Template

```json
{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "containerName": {
      "type": "string",
      "defaultValue": "rag-pipeline-aci"
    },
    "location": {
      "type": "string",
      "defaultValue": "[resourceGroup().location]"
    },
    "imageName": {
      "type": "string",
      "defaultValue": "ragpipelineacr.azurecr.io/rag-pipeline:2.3.1"
    }
  },
  "resources": [
    {
      "type": "Microsoft.ContainerInstance/containerGroups",
      "apiVersion": "2021-09-01",
      "name": "[parameters('containerName')]",
      "location": "[parameters('location')]",
      "properties": {
        "containers": [
          {
            "name": "rag-app",
            "properties": {
              "image": "[parameters('imageName')]",
              "resources": {
                "requests": {
                  "cpu": 2,
                  "memoryInGb": 4
                }
              },
              "ports": [
                {
                  "port": 3000,
                  "protocol": "TCP"
                }
              ],
              "environmentVariables": [
                {
                  "name": "NODE_ENV",
                  "value": "production"
                }
              ]
            }
          }
        ],
        "osType": "Linux",
        "ipAddress": {
          "type": "Public",
          "ports": [
            {
              "port": 3000,
              "protocol": "TCP"
            }
          ],
          "dnsNameLabel": "rag-pipeline"
        },
        "imageRegistryCredentials": [
          {
            "server": "ragpipelineacr.azurecr.io",
            "username": "[reference(resourceId('Microsoft.ContainerRegistry/registries', 'ragpipelineacr')).adminUsername]",
            "password": "[listCredentials(resourceId('Microsoft.ContainerRegistry/registries', 'ragpipelineacr'), '2021-09-01').passwords[0].value]"
          }
        ]
      }
    }
  ]
}
```

## Azure Kubernetes Service (AKS)

### Create AKS Cluster

```bash
# Create AKS cluster
az aks create \
  --resource-group rag-pipeline-rg \
  --name rag-pipeline-aks \
  --node-count 3 \
  --node-vm-size Standard_D4s_v3 \
  --enable-addons monitoring \
  --enable-managed-identity \
  --attach-acr ragpipelineacr \
  --network-plugin azure \
  --enable-cluster-autoscaler \
  --min-count 3 \
  --max-count 10 \
  --kubernetes-version 1.28

# Get credentials
az aks get-credentials \
  --resource-group rag-pipeline-rg \
  --name rag-pipeline-aks
```

### Deploy Application

Use Kubernetes manifests from the [Kubernetes Guide](/docs/Deployment-Kubernetes), with Azure-specific configurations:

```yaml
# azure-ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: rag-pipeline
  annotations:
    kubernetes.io/ingress.class: azure/application-gateway
    appgw.ingress.kubernetes.io/ssl-redirect: "true"
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
    - hosts:
        - rag.example.com
      secretName: rag-tls
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

## Azure Functions

### Function Code

```javascript
// function-app/index.js
const { createRagPipeline } = require("@devilsdev/rag-pipeline-utils");

let pipeline;

module.exports = async function (context, req) {
  try {
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
      });
    }

    const { query } = req.body;

    const result = await pipeline.query(query, {
      topK: 5,
      timeout: 25000,
    });

    context.res = {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: result,
    };
  } catch (error) {
    context.log.error("Error:", error);
    context.res = {
      status: 500,
      body: { error: error.message },
    };
  }
};
```

### function.json

```json
{
  "bindings": [
    {
      "authLevel": "function",
      "type": "httpTrigger",
      "direction": "in",
      "name": "req",
      "methods": ["post"],
      "route": "query"
    },
    {
      "type": "http",
      "direction": "out",
      "name": "res"
    }
  ]
}
```

### Deploy Function

```bash
# Create Function App
az functionapp create \
  --resource-group rag-pipeline-rg \
  --consumption-plan-location eastus \
  --runtime node \
  --runtime-version 20 \
  --functions-version 4 \
  --name rag-pipeline-func \
  --storage-account ragpipelinestorage

# Configure app settings
az functionapp config appsettings set \
  --name rag-pipeline-func \
  --resource-group rag-pipeline-rg \
  --settings \
    OPENAI_API_KEY=$OPENAI_API_KEY \
    PINECONE_API_KEY=$PINECONE_API_KEY

# Deploy
func azure functionapp publish rag-pipeline-func
```

## Azure Container Apps

```bash
# Create Container Apps environment
az containerapp env create \
  --name rag-pipeline-env \
  --resource-group rag-pipeline-rg \
  --location eastus

# Create container app
az containerapp create \
  --name rag-pipeline-app \
  --resource-group rag-pipeline-rg \
  --environment rag-pipeline-env \
  --image ragpipelineacr.azurecr.io/rag-pipeline:2.3.1 \
  --target-port 3000 \
  --ingress external \
  --registry-server ragpipelineacr.azurecr.io \
  --cpu 2 --memory 4Gi \
  --min-replicas 3 \
  --max-replicas 10 \
  --secrets \
    openai-key=$OPENAI_API_KEY \
    jwt-secret=$JWT_SECRET \
  --env-vars \
    NODE_ENV=production \
    OPENAI_API_KEY=secretref:openai-key \
    JWT_SECRET=secretref:jwt-secret
```

## Monitoring with Azure Monitor

```bash
# Enable Application Insights
az monitor app-insights component create \
  --app rag-pipeline-insights \
  --location eastus \
  --resource-group rag-pipeline-rg

# Get instrumentation key
INSTRUMENTATION_KEY=$(az monitor app-insights component show \
  --app rag-pipeline-insights \
  --resource-group rag-pipeline-rg \
  --query instrumentationKey -o tsv)

# Configure app
az containerapp update \
  --name rag-pipeline-app \
  --resource-group rag-pipeline-rg \
  --set-env-vars \
    APPLICATIONINSIGHTS_CONNECTION_STRING="InstrumentationKey=$INSTRUMENTATION_KEY"
```

## Security Best Practices

### Azure Key Vault

```bash
# Create Key Vault
az keyvault create \
  --name rag-pipeline-kv \
  --resource-group rag-pipeline-rg \
  --location eastus

# Store secrets
az keyvault secret set \
  --vault-name rag-pipeline-kv \
  --name openai-api-key \
  --value $OPENAI_API_KEY

# Grant access to managed identity
az keyvault set-policy \
  --name rag-pipeline-kv \
  --object-id $(az containerapp show -n rag-pipeline-app -g rag-pipeline-rg --query identity.principalId -o tsv) \
  --secret-permissions get list
```

## Next Steps

- [GCP Deployment](/docs/Deployment-GCP) - Deploy on Google Cloud Platform
- [Monitoring Guide](/docs/Observability) - Set up comprehensive monitoring
- [Security Best Practices](/docs/Security) - Harden your deployment
