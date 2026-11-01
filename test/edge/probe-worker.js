/**
 * The main entry in a Worker with nodejs_compat: the shared checks, with the
 * optional peers (openai, @opentelemetry/api) bundled by Wrangler.
 */
import * as lib from "@devilsdev/rag-pipeline-utils";
import { makeChecks, worker } from "./checks.js";

export default worker(makeChecks(lib));
