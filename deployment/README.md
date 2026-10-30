# Deployment templates

`@devilsdev/rag-pipeline-utils` is a library plus a CLI. It has no HTTP
server of its own and this project publishes no container image, so these
files deploy **your** image of the example service in
[`examples/fastify-rag-demo`](../examples/fastify-rag-demo): a Fastify app with
`GET /health` and `POST /query` on port 3000.

## 1. Build and push the image

```bash
cd examples/fastify-rag-demo
docker build -t your-registry.example.com/rag-fastify-demo:3.0.2 .
docker push your-registry.example.com/rag-fastify-demo:3.0.2
```

Its `README.md` explains the settings (`OPENAI_API_KEY`, `RAG_OFFLINE=1` for a
run without an LLM, rate limits).

## 2a. Plain manifests (`kubernetes/`)

```bash
kubectl apply -f deployment/kubernetes/namespace.yaml
kubectl -n rag-pipeline create secret generic rag-pipeline-secrets \
  --from-literal=OPENAI_API_KEY=sk-...
kubectl apply -f deployment/kubernetes/
```

Edit `image` in `deployment.yaml` first. `ingress.yaml` is optional; the
example's `POST /query` has no authentication of its own, so put
authentication in front of it before exposing it.

## 2b. Helm (`helm/rag-pipeline/`)

```bash
helm install rag deployment/helm/rag-pipeline \
  --set image.repository=your-registry.example.com/rag-fastify-demo \
  --set existingSecret=rag-pipeline-secrets
```

## Other files

- The root `Dockerfile` builds an image of the `rag-pipeline` CLI
  (`docker run --rm -v "$PWD:/work" <image> query "..."`), and its
  `development` stage is used by the root `docker-compose.yml`.
- `prometheus/` and `grafana/` are configuration for that development
  stack.

The [deployment guides](https://devilsdev.github.io/rag-pipeline-utils/docs/Deployment-Docker)
cover Docker, Kubernetes, AWS, Azure and Google Cloud for your own service.
