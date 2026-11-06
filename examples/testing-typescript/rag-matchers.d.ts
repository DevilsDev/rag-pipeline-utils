import "vitest";
import type { RagMatchers } from "@devilsdev/rag-pipeline-utils/testing";

declare module "vitest" {
  interface Matchers<R, T> extends RagMatchers<R> {}
}
