/**
 * QdrantRetriever and PineconeRetriever from the installed package's /edge
 * entry, in a Worker without nodejs_compat, so no Node.js API exists.
 * run.mjs copies this file into the project it installed the package in.
 */
import * as lib from "@devilsdev/rag-pipeline-utils/edge";
import { worker } from "./checks.js";
import { vectorStoreChecks } from "./vector-stores.js";

export default worker(vectorStoreChecks(lib));
