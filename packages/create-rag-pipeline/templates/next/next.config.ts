import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Loaded by Node at runtime rather than bundled: the library is CommonJS
  // and requires its optional providers (openai, ...) only when used
  serverExternalPackages: ["@devilsdev/rag-pipeline-utils"],
  // Deploy the documents with the route that reads them
  outputFileTracingIncludes: { "/api/ask": ["./docs/**"] },
};

export default nextConfig;
