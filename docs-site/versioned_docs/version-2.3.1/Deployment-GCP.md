---
sidebar_position: 21
---

# GCP Deployment Guide

Deploy RAG Pipeline Utils on Google Cloud Platform using Cloud Run, GKE, or Cloud Functions with enterprise-grade scalability and monitoring.

## Overview

Deployment options:

- Google Cloud Run for serverless containers
- Google Kubernetes Engine (GKE) for production workloads
- Cloud Functions for event-driven architecture
- Compute Engine for VM-based deployments

## Prerequisites

- gcloud CLI installed and configured
- GCP project with billing enabled
- Docker image in Artifact Registry

## Artifact Registry Setup

```bash
# Enable APIs
gcloud services enable \
  artifactregistry.googleapis.com \
  run.googleapis.com \
  container.googleapis.com

# Create Artifact Registry repository
gcloud artifacts repositories create rag-pipeline \
  --repository-format=docker \
  --location=us-central1 \
  --description="RAG Pipeline Utils images"

# Configure Docker
gcloud auth configure-docker us-central1-docker.pkg.dev

# Tag and push image
docker tag rag-pipeline-utils:2.3.1 \
  us-central1-docker.pkg.dev/PROJECT_ID/rag-pipeline/app:2.3.1

docker push us-central1-docker.pkg.dev/PROJECT_ID/rag-pipeline/app:2.3.1
```

## Google Cloud Run

### Deploy Container

```bash
# Deploy to Cloud Run
gcloud run deploy rag-pipeline \
  --image us-central1-docker.pkg.dev/PROJECT_ID/rag-pipeline/app:2.3.1 \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --cpu 2 \
  --memory 4Gi \
  --min-instances 3 \
  --max-instances 10 \
  --concurrency 80 \
  --timeout 300 \
  --set-env-vars NODE_ENV=production,LOG_LEVEL=info \
  --set-secrets \
    OPENAI_API_KEY=openai-api-key:latest,\
    JWT_SECRET=jwt-secret:latest

# Get service URL
gcloud run services describe rag-pipeline \
  --region us-central1 \
  --format 'value(status.url)'
```

### YAML Configuration

```yaml
# cloud-run.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: rag-pipeline
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "3"
        autoscaling.knative.dev/maxScale: "10"
        run.googleapis.com/cpu-throttling: "false"
    spec:
      containerConcurrency: 80
      timeoutSeconds: 300
      containers:
        - image: us-central1-docker.pkg.dev/PROJECT_ID/rag-pipeline/app:2.3.1
          resources:
            limits:
              cpu: "2000m"
              memory: "4Gi"
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: production
            - name: OPENAI_API_KEY
              valueFrom:
                secretKeyRef:
                  name: openai-api-key
                  key: latest
```

**Deploy:**

```bash
gcloud run services replace cloud-run.yaml --region us-central1
```

## Google Kubernetes Engine (GKE)

### Create GKE Cluster

```bash
# Create GKE cluster with autopilot
gcloud container clusters create-auto rag-pipeline-cluster \
  --region us-central1 \
  --release-channel regular

# Or create standard cluster
gcloud container clusters create rag-pipeline-cluster \
  --zone us-central1-a \
  --num-nodes 3 \
  --machine-type n1-standard-4 \
  --enable-autoscaling \
  --min-nodes 3 \
  --max-nodes 10 \
  --enable-autorepair \
  --enable-autoupgrade \
  --enable-stackdriver-kubernetes

# Get credentials
gcloud container clusters get-credentials rag-pipeline-cluster \
  --zone us-central1-a
```

### Deploy with Workload Identity

```yaml
# gke-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rag-pipeline
spec:
  replicas: 3
  selector:
    matchLabels:
      app: rag-pipeline
  template:
    metadata:
      labels:
        app: rag-pipeline
    spec:
      serviceAccountName: rag-pipeline-sa
      containers:
        - name: rag-app
          image: us-central1-docker.pkg.dev/PROJECT_ID/rag-pipeline/app:2.3.1
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: production
            - name: GOOGLE_CLOUD_PROJECT
              value: PROJECT_ID
          resources:
            requests:
              memory: "2Gi"
              cpu: "1000m"
            limits:
              memory: "4Gi"
              cpu: "2000m"
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: rag-pipeline
spec:
  type: LoadBalancer
  selector:
    app: rag-pipeline
  ports:
    - port: 80
      targetPort: 3000
```

### Configure Workload Identity

```bash
# Create service account
gcloud iam service-accounts create rag-pipeline-sa

# Bind to Kubernetes service account
kubectl create serviceaccount rag-pipeline-sa

gcloud iam service-accounts add-iam-policy-binding \
  rag-pipeline-sa@PROJECT_ID.iam.gserviceaccount.com \
  --role roles/iam.workloadIdentityUser \
  --member "serviceAccount:PROJECT_ID.svc.id.goog[default/rag-pipeline-sa]"

kubectl annotate serviceaccount rag-pipeline-sa \
  iam.gke.io/gcp-service-account=rag-pipeline-sa@PROJECT_ID.iam.gserviceaccount.com
```

## Cloud Functions (2nd Gen)

### Function Code

```javascript
// index.js
const functions = require("@google-cloud/functions-framework");
const { createRagPipeline } = require("@devilsdev/rag-pipeline-utils");

let pipeline;

functions.http("query", async (req, res) => {
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

    res.json(result);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: error.message });
  }
});
```

### Deploy Function

```bash
# Deploy Cloud Function (2nd gen)
gcloud functions deploy rag-pipeline-query \
  --gen2 \
  --runtime nodejs20 \
  --region us-central1 \
  --source . \
  --entry-point query \
  --trigger-http \
  --allow-unauthenticated \
  --memory 4Gi \
  --cpu 2 \
  --timeout 60s \
  --min-instances 3 \
  --max-instances 10 \
  --set-secrets \
    OPENAI_API_KEY=openai-api-key:latest,\
    PINECONE_API_KEY=pinecone-api-key:latest
```

## Secret Manager

```bash
# Create secrets
echo -n "$OPENAI_API_KEY" | \
  gcloud secrets create openai-api-key \
    --data-file=- \
    --replication-policy=automatic

echo -n "$JWT_SECRET" | \
  gcloud secrets create jwt-secret \
    --data-file=- \
    --replication-policy=automatic

# Grant access to service account
gcloud secrets add-iam-policy-binding openai-api-key \
  --member="serviceAccount:rag-pipeline-sa@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## Cloud Monitoring

### Setup Logging

```javascript
// Add to application
const { Logging } = require("@google-cloud/logging");
const logging = new Logging();
const log = logging.log("rag-pipeline");

// Log entries
const entry = log.entry(
  {
    severity: "INFO",
    resource: { type: "cloud_run_revision" },
  },
  {
    message: "Pipeline query executed",
    query: queryText,
    latency: duration,
  },
);

await log.write(entry);
```

### Setup Monitoring

```bash
# Create uptime check
gcloud monitoring uptime create rag-pipeline-health \
  --resource-type=uptime-url \
  --display-name="RAG Pipeline Health Check" \
  --http-check-path=/health \
  --hostname=YOUR_CLOUD_RUN_URL \
  --check-interval=60s

# Create alert policy
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="RAG Pipeline High Error Rate" \
  --condition-display-name="Error rate > 5%" \
  --condition-threshold-value=0.05 \
  --condition-threshold-duration=300s
```

## Load Balancing

```bash
# Create global load balancer for Cloud Run
gcloud compute backend-services create rag-pipeline-backend \
  --global \
  --load-balancing-scheme=EXTERNAL_MANAGED

# Add Cloud Run service as backend
gcloud compute backend-services add-backend rag-pipeline-backend \
  --global \
  --backend-service=rag-pipeline

# Create URL map
gcloud compute url-maps create rag-pipeline-lb \
  --default-service rag-pipeline-backend

# Create HTTPS proxy
gcloud compute target-https-proxies create rag-pipeline-proxy \
  --url-map=rag-pipeline-lb \
  --ssl-certificates=rag-pipeline-cert

# Create forwarding rule
gcloud compute forwarding-rules create rag-pipeline-rule \
  --global \
  --target-https-proxy=rag-pipeline-proxy \
  --ports=443
```

## Cost Optimization

### Cloud Run

```bash
# Use minimum instances strategically
gcloud run services update rag-pipeline \
  --min-instances 1 \
  --max-instances 10 \
  --cpu-throttling

# Use committed use discounts for predictable workloads
```

### GKE Spot VMs

```bash
# Create node pool with Spot VMs
gcloud container node-pools create spot-pool \
  --cluster rag-pipeline-cluster \
  --spot \
  --num-nodes 3 \
  --machine-type n1-standard-4
```

## Troubleshooting

```bash
# View Cloud Run logs
gcloud run services logs read rag-pipeline \
  --region us-central1 \
  --limit 100

# View GKE pod logs
kubectl logs -f deployment/rag-pipeline

# Describe Cloud Run service
gcloud run services describe rag-pipeline \
  --region us-central1
```

## Next Steps

- [Docker Deployment](/docs/Deployment-Docker) - Container fundamentals
- [Kubernetes Deployment](/docs/Deployment-Kubernetes) - Kubernetes patterns
- [Monitoring Guide](/docs/Observability) - Comprehensive monitoring
