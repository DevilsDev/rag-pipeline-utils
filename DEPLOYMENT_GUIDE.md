# Production Deployment Guide
**@DevilsDev/rag-pipeline-utils**  
**Enterprise-Grade RAG Pipeline Toolkit**

## 🚀 Overview

This guide provides comprehensive instructions for deploying the RAG Pipeline Utils to production environments using containerization, Kubernetes orchestration, and enterprise-grade monitoring.

## 📋 Prerequisites

### System Requirements
- **Kubernetes Cluster**: v1.24+ (EKS, GKE, AKS, or self-managed)
- **Helm**: v3.12+ for package management
- **Docker**: v20.10+ for containerization
- **kubectl**: v1.28+ for cluster management
- **Node.js**: v20+ for local development

### Required Secrets
- **OpenAI API Key**: For LLM operations
- **Pinecone API Key**: For vector database (optional)
- **Database Credentials**: PostgreSQL connection string
- **TLS Certificates**: For HTTPS ingress

## 🐳 Container Deployment

### Local Development with Docker Compose

```bash
# Clone the repository
git clone https://github.com/DevilsDev/rag-pipeline-utils.git
cd rag-pipeline-utils

# Set environment variables
cp .env.example .env
# Edit .env with your API keys and configuration

# Start the complete stack
docker-compose up -d

# View logs
docker-compose logs -f rag-pipeline

# Access services
# Application: http://localhost:3000
# Health Check: http://localhost:3001/health
# Prometheus: http://localhost:9090
# Grafana: http://localhost:3002 (admin/ragpipeline)
```

### Production Docker Build

```bash
# Build production image
docker build --target runtime -t rag-pipeline-utils:latest .

# Build development image
docker build --target development -t rag-pipeline-utils:dev .

# Run production container
docker run -d \
  --name rag-pipeline-prod \
  -p 3000:3000 \
  -p 3001:3001 \
  -e OPENAI_API_KEY=your_key_here \
  -e NODE_ENV=production \
  rag-pipeline-utils:latest
```

## ☸️ Kubernetes Deployment

### Quick Start with Kubectl

```bash
# Create namespace
kubectl apply -f deployment/kubernetes/namespace.yaml

# Create secrets (replace with your actual values)
kubectl create secret generic rag-pipeline-secrets \
  --namespace=rag-pipeline \
  --from-literal=openai-api-key=your_openai_key \
  --from-literal=pinecone-api-key=your_pinecone_key \
  --from-literal=postgres-url=postgresql://user:pass@host:5432/db

# Deploy configuration
kubectl apply -f deployment/kubernetes/configmap.yaml

# Deploy application
kubectl apply -f deployment/kubernetes/deployment.yaml
kubectl apply -f deployment/kubernetes/service.yaml
kubectl apply -f deployment/kubernetes/ingress.yaml

# Check deployment status
kubectl get pods -n rag-pipeline
kubectl get services -n rag-pipeline
```

### Production Deployment with Helm

```bash
# Add required Helm repositories
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

# Install dependencies
helm install redis bitnami/redis --namespace rag-pipeline --create-namespace
helm install postgresql bitnami/postgresql --namespace rag-pipeline
helm install prometheus prometheus-community/prometheus --namespace monitoring --create-namespace
helm install grafana grafana/grafana --namespace monitoring

# Deploy RAG Pipeline Utils
helm install rag-pipeline ./deployment/helm/rag-pipeline \
  --namespace rag-pipeline \
  --create-namespace \
  --set secrets.openaiApiKey="your_openai_key" \
  --set secrets.pineconeApiKey="your_pinecone_key" \
  --set ingress.hosts[0].host="rag-pipeline.yourdomain.com" \
  --set autoscaling.enabled=true \
  --set monitoring.enabled=true

# Verify deployment
helm status rag-pipeline -n rag-pipeline
kubectl get all -n rag-pipeline
```

### Custom Values Configuration

Create a `values-production.yaml` file:

```yaml
# Production values for RAG Pipeline Utils
image:
  tag: "2.1.7"
  pullPolicy: Always

deployment:
  replicaCount: 5

resources:
  requests:
    memory: "512Mi"
    cpu: "200m"
  limits:
    memory: "2Gi"
    cpu: "1000m"

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 20
  targetCPUUtilizationPercentage: 70

ingress:
  enabled: true
  hosts:
    - host: rag-pipeline.yourdomain.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: rag-pipeline-tls
      hosts:
        - rag-pipeline.yourdomain.com

monitoring:
  enabled: true
  prometheus:
    enabled: true
  grafana:
    enabled: true

persistence:
  enabled: true
  size: 50Gi
  storageClass: "fast-ssd"
```

Deploy with custom values:

```bash
helm upgrade --install rag-pipeline ./deployment/helm/rag-pipeline \
  --namespace rag-pipeline \
  --values values-production.yaml
```

## 🌩️ Cloud Provider Deployment

### Amazon EKS

```bash
# Create EKS cluster
eksctl create cluster \
  --name rag-pipeline-cluster \
  --region us-west-2 \
  --nodegroup-name standard-workers \
  --node-type m5.large \
  --nodes 3 \
  --nodes-min 1 \
  --nodes-max 10 \
  --managed

# Configure kubectl
aws eks update-kubeconfig --region us-west-2 --name rag-pipeline-cluster

# Install AWS Load Balancer Controller
kubectl apply -k "github.com/aws/eks-charts/stable/aws-load-balancer-controller//crds?ref=master"
helm repo add eks https://aws.github.io/eks-charts
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  --set clusterName=rag-pipeline-cluster \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller \
  -n kube-system

# Deploy application
helm install rag-pipeline ./deployment/helm/rag-pipeline \
  --namespace rag-pipeline \
  --create-namespace \
  --set ingress.className="alb" \
  --set ingress.annotations."kubernetes\.io/ingress\.class"="alb"
```

### Google GKE

```bash
# Create GKE cluster
gcloud container clusters create rag-pipeline-cluster \
  --zone us-central1-a \
  --num-nodes 3 \
  --enable-autoscaling \
  --min-nodes 1 \
  --max-nodes 10 \
  --machine-type n1-standard-2

# Get credentials
gcloud container clusters get-credentials rag-pipeline-cluster --zone us-central1-a

# Deploy application
helm install rag-pipeline ./deployment/helm/rag-pipeline \
  --namespace rag-pipeline \
  --create-namespace \
  --set ingress.className="gce"
```

### Azure AKS

```bash
# Create resource group
az group create --name rag-pipeline-rg --location eastus

# Create AKS cluster
az aks create \
  --resource-group rag-pipeline-rg \
  --name rag-pipeline-cluster \
  --node-count 3 \
  --enable-addons monitoring \
  --generate-ssh-keys

# Get credentials
az aks get-credentials --resource-group rag-pipeline-rg --name rag-pipeline-cluster

# Deploy application
helm install rag-pipeline ./deployment/helm/rag-pipeline \
  --namespace rag-pipeline \
  --create-namespace \
  --set ingress.className="azure/application-gateway"
```

## 📊 Monitoring & Observability

### Prometheus Metrics

The application exposes metrics at `/metrics` endpoint:

- `rag_pipeline_operations_total`: Total pipeline operations
- `rag_pipeline_duration_seconds`: Operation duration histogram
- `rag_pipeline_errors_total`: Total errors by type
- `rag_pipeline_active_connections`: Active connections
- `rag_pipeline_memory_usage_bytes`: Memory usage
- `rag_pipeline_cpu_usage_percent`: CPU usage percentage

### Grafana Dashboards

Import the provided dashboard:

```bash
# Access Grafana
kubectl port-forward svc/grafana 3000:80 -n monitoring

# Open http://localhost:3000
# Username: admin
# Password: (get from secret)
kubectl get secret grafana -n monitoring -o jsonpath="{.data.admin-password}" | base64 --decode

# Import dashboard from deployment/grafana/dashboards/rag-pipeline-dashboard.json
```

### Log Aggregation

Configure log forwarding to your preferred system:

```yaml
# Fluentd configuration for log forwarding
apiVersion: v1
kind: ConfigMap
metadata:
  name: fluentd-config
data:
  fluent.conf: |
    <source>
      @type tail
      path /var/log/containers/rag-pipeline*.log
      pos_file /var/log/fluentd-containers.log.pos
      tag kubernetes.*
      format json
    </source>
    
    <match kubernetes.**>
      @type elasticsearch
      host elasticsearch.logging.svc.cluster.local
      port 9200
      index_name rag-pipeline
    </match>
```

## 🔒 Security Configuration

### Network Policies

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: rag-pipeline-network-policy
  namespace: rag-pipeline
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: rag-pipeline-utils
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - protocol: TCP
      port: 3000
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: kube-system
    ports:
    - protocol: TCP
      port: 53
    - protocol: UDP
      port: 53
```

### Pod Security Standards

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: rag-pipeline
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

## 🚨 Troubleshooting

### Common Issues

#### Pod Startup Failures

```bash
# Check pod status
kubectl get pods -n rag-pipeline

# View pod logs
kubectl logs -f deployment/rag-pipeline-app -n rag-pipeline

# Describe pod for events
kubectl describe pod <pod-name> -n rag-pipeline
```

#### Service Discovery Issues

```bash
# Check service endpoints
kubectl get endpoints -n rag-pipeline

# Test service connectivity
kubectl run debug --image=busybox -it --rm --restart=Never -- nslookup rag-pipeline-service.rag-pipeline.svc.cluster.local
```

#### Ingress Issues

```bash
# Check ingress status
kubectl get ingress -n rag-pipeline

# View ingress controller logs
kubectl logs -f deployment/ingress-nginx-controller -n ingress-nginx
```

### Performance Tuning

#### Resource Optimization

```yaml
resources:
  requests:
    memory: "1Gi"
    cpu: "500m"
  limits:
    memory: "4Gi"
    cpu: "2000m"

# JVM tuning for Node.js
env:
- name: NODE_OPTIONS
  value: "--max-old-space-size=3072"
```

#### Database Connection Pooling

```yaml
env:
- name: POSTGRES_POOL_SIZE
  value: "20"
- name: POSTGRES_POOL_TIMEOUT
  value: "30000"
```

## 📚 Additional Resources

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Helm Documentation](https://helm.sh/docs/)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Prometheus Monitoring](https://prometheus.io/docs/)
- [Grafana Dashboards](https://grafana.com/docs/)

## 🆘 Support

For deployment issues and support:

- 📖 [Documentation](https://devilsdev.github.io/rag-pipeline-utils/)
- 🐛 [GitHub Issues](https://github.com/DevilsDev/rag-pipeline-utils/issues)
- 💬 [GitHub Discussions](https://github.com/DevilsDev/rag-pipeline-utils/discussions)
- 📧 [Email Support](mailto:support@devilsdev.com)

---
**Last Updated:** 2025-08-05  
**Version:** 2.1.7
