---
sidebar_position: 18
---

# Kubernetes Deployment Guide

Deploy RAG Pipeline Utils on Kubernetes with production-grade configurations, Helm charts, auto-scaling, and comprehensive monitoring.

## Overview

This guide covers:

- Kubernetes manifests for production deployment
- Helm charts for templated deployments
- ConfigMaps and Secrets management
- Horizontal Pod Autoscaling (HPA)
- Service mesh integration
- Monitoring with Prometheus and Grafana
- Rolling updates and rollback strategies

## Prerequisites

- Kubernetes cluster 1.24+
- kubectl configured
- Helm 3.0+
- Basic Kubernetes knowledge
- Container registry access

## Quick Start

### Basic Deployment

Create Kubernetes deployment manifest:

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rag-pipeline
  namespace: production
  labels:
    app: rag-pipeline
    version: v2.3.1
spec:
  replicas: 3
  selector:
    matchLabels:
      app: rag-pipeline
  template:
    metadata:
      labels:
        app: rag-pipeline
        version: v2.3.1
    spec:
      serviceAccountName: rag-pipeline
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001
      containers:
        - name: rag-app
          image: your-registry.com/rag-pipeline-utils:2.3.1
          imagePullPolicy: IfNotPresent
          ports:
            - name: http
              containerPort: 3000
              protocol: TCP
            - name: metrics
              containerPort: 9090
              protocol: TCP
          env:
            - name: NODE_ENV
              value: "production"
            - name: LOG_LEVEL
              value: "info"
            - name: OPENAI_API_KEY
              valueFrom:
                secretKeyRef:
                  name: rag-secrets
                  key: openai-api-key
            - name: VECTOR_DB_URL
              valueFrom:
                configMapKeyRef:
                  name: rag-config
                  key: vector-db-url
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
              port: http
            initialDelaySeconds: 30
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /ready
              port: http
            initialDelaySeconds: 10
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 3
          volumeMounts:
            - name: config
              mountPath: /app/config
              readOnly: true
            - name: data
              mountPath: /app/data
      volumes:
        - name: config
          configMap:
            name: rag-config
        - name: data
          persistentVolumeClaim:
            claimName: rag-data-pvc
```

**Deploy:**

```bash
kubectl apply -f k8s/deployment.yaml
```

## Service Configuration

```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: rag-pipeline
  namespace: production
  labels:
    app: rag-pipeline
spec:
  type: ClusterIP
  selector:
    app: rag-pipeline
  ports:
    - name: http
      port: 80
      targetPort: http
      protocol: TCP
    - name: metrics
      port: 9090
      targetPort: metrics
      protocol: TCP
---
apiVersion: v1
kind: Service
metadata:
  name: rag-pipeline-headless
  namespace: production
spec:
  clusterIP: None
  selector:
    app: rag-pipeline
  ports:
    - name: http
      port: 3000
      targetPort: http
```

## ConfigMaps and Secrets

### ConfigMap

```yaml
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: rag-config
  namespace: production
data:
  vector-db-url: "http://qdrant:6333"
  redis-url: "redis://redis:6379"
  log-level: "info"
  max-concurrent-requests: "100"
  embedding-batch-size: "100"
  # Application configuration
  app-config.json: |
    {
      "pipeline": {
        "timeout": 30000,
        "retryAttempts": 3,
        "retryDelay": 1000
      },
      "cache": {
        "enabled": true,
        "ttl": 3600
      },
      "rateLimit": {
        "windowMs": 900000,
        "maxRequests": 100
      }
    }
```

### Secrets

```yaml
# k8s/secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: rag-secrets
  namespace: production
type: Opaque
stringData:
  openai-api-key: "sk-..."
  pinecone-api-key: "..."
  jwt-secret: "your-jwt-secret"
  redis-password: "strong-password"
```

**Create secrets securely:**

```bash
# Create from file
kubectl create secret generic rag-secrets \
  --from-file=openai-api-key=./secrets/openai.key \
  --from-file=jwt-secret=./secrets/jwt.secret \
  --namespace=production

# Or use sealed secrets (recommended)
kubeseal --format=yaml < secrets.yaml > sealed-secrets.yaml
kubectl apply -f sealed-secrets.yaml
```

## Helm Chart

### Chart Structure

```
helm/rag-pipeline/
├── Chart.yaml
├── values.yaml
├── values-production.yaml
├── templates/
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── configmap.yaml
│   ├── secrets.yaml
│   ├── hpa.yaml
│   ├── ingress.yaml
│   ├── serviceaccount.yaml
│   └── NOTES.txt
```

### Chart.yaml

```yaml
# helm/rag-pipeline/Chart.yaml
apiVersion: v2
name: rag-pipeline
description: RAG Pipeline Utils Helm Chart
version: 2.3.1
appVersion: "2.3.1"
keywords:
  - rag
  - ai
  - llm
  - embeddings
maintainers:
  - name: Ali Kahwaji
    email: ali@example.com
```

### values.yaml

```yaml
# helm/rag-pipeline/values.yaml
replicaCount: 3

image:
  repository: your-registry.com/rag-pipeline-utils
  tag: "2.3.1"
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 80
  targetPort: 3000
  annotations: {}

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
  hosts:
    - host: rag.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: rag-tls
      hosts:
        - rag.example.com

resources:
  requests:
    memory: "2Gi"
    cpu: "1000m"
  limits:
    memory: "4Gi"
    cpu: "2000m"

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80

config:
  nodeEnv: production
  logLevel: info
  vectorDbUrl: "http://qdrant:6333"
  redisUrl: "redis://redis:6379"

secrets:
  openaiApiKey: ""
  pineconeApiKey: ""
  jwtSecret: ""

persistence:
  enabled: true
  storageClass: "standard"
  accessMode: ReadWriteOnce
  size: 10Gi

monitoring:
  enabled: true
  serviceMonitor:
    enabled: true
    interval: 30s

securityContext:
  runAsNonRoot: true
  runAsUser: 1001
  fsGroup: 1001
  capabilities:
    drop:
      - ALL
```

### Deployment Template

```yaml
# helm/rag-pipeline/templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "rag-pipeline.fullname" . }}
  labels:
    {{- include "rag-pipeline.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "rag-pipeline.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
        checksum/secret: {{ include (print $.Template.BasePath "/secrets.yaml") . | sha256sum }}
      labels:
        {{- include "rag-pipeline.selectorLabels" . | nindent 8 }}
    spec:
      serviceAccountName: {{ include "rag-pipeline.serviceAccountName" . }}
      securityContext:
        {{- toYaml .Values.securityContext | nindent 8 }}
      containers:
      - name: {{ .Chart.Name }}
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
        imagePullPolicy: {{ .Values.image.pullPolicy }}
        ports:
        - name: http
          containerPort: 3000
          protocol: TCP
        - name: metrics
          containerPort: 9090
          protocol: TCP
        env:
        - name: NODE_ENV
          value: {{ .Values.config.nodeEnv }}
        - name: LOG_LEVEL
          value: {{ .Values.config.logLevel }}
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: {{ include "rag-pipeline.fullname" . }}
              key: openai-api-key
        - name: VECTOR_DB_URL
          value: {{ .Values.config.vectorDbUrl }}
        resources:
          {{- toYaml .Values.resources | nindent 12 }}
        livenessProbe:
          httpGet:
            path: /health
            port: http
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: http
          initialDelaySeconds: 10
          periodSeconds: 5
        volumeMounts:
        - name: config
          mountPath: /app/config
          readOnly: true
        {{- if .Values.persistence.enabled }}
        - name: data
          mountPath: /app/data
        {{- end }}
      volumes:
      - name: config
        configMap:
          name: {{ include "rag-pipeline.fullname" . }}
      {{- if .Values.persistence.enabled }}
      - name: data
        persistentVolumeClaim:
          claimName: {{ include "rag-pipeline.fullname" . }}
      {{- end }}
```

## Horizontal Pod Autoscaling

```yaml
# k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: rag-pipeline-hpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: rag-pipeline
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: "1000"
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 50
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Percent
          value: 100
          periodSeconds: 30
        - type: Pods
          value: 2
          periodSeconds: 30
      selectPolicy: Max
```

## Ingress Configuration

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: rag-pipeline
  namespace: production
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "300"
spec:
  ingressClassName: nginx
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

## Monitoring Stack

### ServiceMonitor (Prometheus Operator)

```yaml
# k8s/servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: rag-pipeline
  namespace: production
  labels:
    app: rag-pipeline
spec:
  selector:
    matchLabels:
      app: rag-pipeline
  endpoints:
    - port: metrics
      interval: 30s
      path: /metrics
      scheme: http
```

### Grafana Dashboard

```yaml
# k8s/grafana-dashboard.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: rag-pipeline-dashboard
  namespace: monitoring
  labels:
    grafana_dashboard: "1"
data:
  rag-pipeline.json: |
    {
      "dashboard": {
        "title": "RAG Pipeline Metrics",
        "panels": [
          {
            "title": "Request Rate",
            "targets": [
              {
                "expr": "rate(http_requests_total[5m])"
              }
            ]
          },
          {
            "title": "P95 Latency",
            "targets": [
              {
                "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))"
              }
            ]
          }
        ]
      }
    }
```

## Deployment Strategies

### Rolling Update

```yaml
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
```

### Blue-Green Deployment

```yaml
# Blue deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rag-pipeline-blue
spec:
  replicas: 3
  selector:
    matchLabels:
      app: rag-pipeline
      version: blue
  template:
    metadata:
      labels:
        app: rag-pipeline
        version: blue
    spec:
      containers:
        - name: rag-app
          image: rag-pipeline:2.3.0
---
# Green deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rag-pipeline-green
spec:
  replicas: 3
  selector:
    matchLabels:
      app: rag-pipeline
      version: green
  template:
    metadata:
      labels:
        app: rag-pipeline
        version: green
    spec:
      containers:
        - name: rag-app
          image: rag-pipeline:2.3.1
---
# Service switches between blue and green
apiVersion: v1
kind: Service
metadata:
  name: rag-pipeline
spec:
  selector:
    app: rag-pipeline
    version: green # Switch to blue for rollback
```

## Helm Deployment Commands

### Install

```bash
# Add custom values
helm install rag-pipeline ./helm/rag-pipeline \
  --namespace production \
  --create-namespace \
  --values values-production.yaml \
  --set image.tag=2.3.1 \
  --set secrets.openaiApiKey=$OPENAI_API_KEY

# Dry run first
helm install rag-pipeline ./helm/rag-pipeline \
  --namespace production \
  --dry-run --debug
```

### Upgrade

```bash
# Upgrade with new values
helm upgrade rag-pipeline ./helm/rag-pipeline \
  --namespace production \
  --values values-production.yaml \
  --set image.tag=2.3.2 \
  --wait --timeout 5m

# Check rollout status
kubectl rollout status deployment/rag-pipeline -n production
```

### Rollback

```bash
# List releases
helm history rag-pipeline -n production

# Rollback to previous version
helm rollback rag-pipeline -n production

# Rollback to specific revision
helm rollback rag-pipeline 3 -n production
```

## Production Best Practices

### Resource Quotas

```yaml
# k8s/resourcequota.yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: production-quota
  namespace: production
spec:
  hard:
    requests.cpu: "100"
    requests.memory: 200Gi
    limits.cpu: "200"
    limits.memory: 400Gi
    persistentvolumeclaims: "10"
```

### Pod Disruption Budget

```yaml
# k8s/pdb.yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: rag-pipeline-pdb
  namespace: production
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: rag-pipeline
```

### Network Policy

```yaml
# k8s/networkpolicy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: rag-pipeline-netpol
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: rag-pipeline
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: production
      ports:
        - protocol: TCP
          port: 3000
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              name: production
      ports:
        - protocol: TCP
          port: 6333 # Qdrant
        - protocol: TCP
          port: 6379 # Redis
    - to:
        - namespaceSelector: {}
      ports:
        - protocol: TCP
          port: 443 # External APIs
```

## Troubleshooting

### Pod Issues

```bash
# Check pod status
kubectl get pods -n production -l app=rag-pipeline

# View pod logs
kubectl logs -f deployment/rag-pipeline -n production

# Describe pod
kubectl describe pod <pod-name> -n production

# Execute commands in pod
kubectl exec -it <pod-name> -n production -- /bin/sh
```

### Service Issues

```bash
# Check service endpoints
kubectl get endpoints rag-pipeline -n production

# Test service connectivity
kubectl run curl --image=curlimages/curl -it --rm -- \
  curl http://rag-pipeline.production.svc.cluster.local/health
```

### HPA Issues

```bash
# Check HPA status
kubectl get hpa -n production

# Describe HPA
kubectl describe hpa rag-pipeline-hpa -n production

# Check metrics server
kubectl top pods -n production
```

## Security Hardening

### Pod Security Standards

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: production
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

### Service Account

```yaml
# k8s/serviceaccount.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: rag-pipeline
  namespace: production
automountServiceAccountToken: false
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: rag-pipeline
  namespace: production
rules:
  - apiGroups: [""]
    resources: ["configmaps", "secrets"]
    verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: rag-pipeline
  namespace: production
subjects:
  - kind: ServiceAccount
    name: rag-pipeline
roleRef:
  kind: Role
  name: rag-pipeline
  apiGroup: rbac.authorization.k8s.io
```

## Next Steps

- [AWS EKS Deployment](/docs/Deployment-AWS) - Deploy on AWS Elastic Kubernetes Service
- [Azure AKS Deployment](/docs/Deployment-Azure) - Deploy on Azure Kubernetes Service
- [GCP GKE Deployment](/docs/Deployment-GCP) - Deploy on Google Kubernetes Engine
- [Monitoring Guide](/docs/Observability) - Comprehensive monitoring setup

## Additional Resources

- [Kubernetes Best Practices](https://kubernetes.io/docs/concepts/configuration/overview/)
- [Helm Documentation](https://helm.sh/docs/)
- [Prometheus Operator](https://prometheus-operator.dev/)
- [cert-manager](https://cert-manager.io/)
