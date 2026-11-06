/**
 * QdrantRetriever and PineconeRetriever from the installed package's main
 * entry, in a Worker with nodejs_compat. run.mjs copies this file into the
 * project it installed the package in.
 */
import * as lib from "@devilsdev/rag-pipeline-utils";
import { worker } from "./checks.js";
import { vectorStoreChecks } from "./vector-stores.js";

export default worker(vectorStoreChecks(lib));
