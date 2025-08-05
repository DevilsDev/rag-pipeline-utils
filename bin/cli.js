#!/usr/bin/env node
/**
 * Version: 2.0.0
 * Path: bin/cli.js
 * Description: Clean CLI entrypoint with proper error handling
 * Author: Ali Kahwaji
 */

import { Command } from 'commander';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';
import { ingestDocument } from '../src/ingest.js';
import { queryPipeline } from '../src/query.js';
import { logger } from '../src/utils/logger.js';


const program = new Command();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load config dynamically from working dir
function loadConfig() {
  const configPath = resolve(process.cwd(), '.ragrc.json');
  
  if (!existsSync(configPath)) {
    logger.error(`❌ Configuration file not found: ${configPath}`);
    logger.error('Please create a .ragrc.json file in your working directory.');
    logger.error('See documentation for configuration format.');
    process.exit(1);
  }
  
  try {
    const configContent = readFileSync(configPath, 'utf-8');
    return JSON.parse(configContent);
  } catch (error) {
    logger.error(`❌ Failed to parse configuration file: ${configPath}`);
    logger.error(`Parse error: ${error.message}`);
    logger.error('Please check that your .ragrc.json file contains valid JSON.');
    process.exit(1);
  }
}

const config = loadConfig();

program
  .name('rag-pipeline-utils')
  .description('Composable RAG Pipeline Utilities CLI')
  .version('2.1.8');

program
  .command('ingest <file>')
  .description('Ingest a document')
  .action(async (file) => {
    try {
      logger.info(`Starting document ingestion: ${file}`);
      
      if (!existsSync(file)) {
        logger.error(`❌ File not found: ${file}`);
        logger.error('Please check the file path and try again.');
        process.exit(1);
      }
      
      await ingestDocument(file, config);
      logger.info('✅ Document ingestion completed successfully.');
      console.log('✅ Ingestion complete.');
    } catch (error) {
      logger.error('❌ Document ingestion failed:');
      logger.error(`Error: ${error.message}`);
      
      if (error.message.includes('Plugin')) {
        logger.error('This appears to be a plugin-related error.');
        logger.error('Please check your .ragrc.json configuration and ensure all plugins are properly configured.');
      } else if (error.message.includes('ENOENT')) {
        logger.error('File or directory not found. Please check your file paths.');
      }
      
      process.exit(1);
    }
  });

program
  .command('query <prompt>')
  .description('Query the RAG pipeline')
  .action(async (prompt) => {
    try {
      logger.info(`Processing query: ${prompt}`);
      
      if (!prompt || prompt.trim().length === 0) {
        logger.error('❌ Empty query provided.');
        logger.error('Please provide a non-empty query string.');
        process.exit(1);
      }
      
      const answer = await queryPipeline(prompt, config);
      
      if (!answer) {
        logger.warn('⚠️ Query completed but no answer was generated.');
        console.log('No answer generated for the query.');
      } else {
        logger.info('✅ Query completed successfully.');
        console.log('✅ Answer:', answer);
      }
    } catch (error) {
      logger.error('❌ Query processing failed:');
      logger.error(`Error: ${error.message}`);
      
      if (error.message.includes('Plugin')) {
        logger.error('This appears to be a plugin-related error.');
        logger.error('Please check your .ragrc.json configuration and ensure all plugins are properly configured.');
      } else if (error.message.includes('retrieve') || error.message.includes('embed')) {
        logger.error('This appears to be related to document retrieval or embedding.');
        logger.error('Make sure you have ingested documents before querying.');
      }
      
      process.exit(1);
    }
  });

program.parse(process.argv);
