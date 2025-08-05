/**
 * Unit tests for parallel processing utilities
 * Tests parallel embedding and retrieval with concurrency control
 */

import { ParallelEmbedder, ParallelRetriever, Semaphore } from '../../../src/core/performance/parallel-processor.js';

describe('Semaphore', () => {
  it('should allow concurrent operations up to limit', async () => {
    const semaphore = new Semaphore(2);
    const operations = [];
    
    // Start 3 operations, only 2 should run immediately
    for (let i = 0; i < 3; i++) {
      operations.push(semaphore.acquire());
    }
    
    const results = await Promise.allSettled(operations.slice(0, 2));
    expect(results.every(r => r.status === 'fulfilled')).toBe(true);
    
    // Third operation should still be pending
    const thirdResult = await Promise.race([
      operations[2],
      new Promise(resolve => setTimeout(() => resolve('timeout'), 10))
    ]);
    expect(thirdResult).toBe('timeout');
    
    // Release one slot
    semaphore.release();
    
    // Now third operation should complete
    await expect(operations[2]).resolves.toBeUndefined();
  });

  it('should handle release without acquire', () => {
    const semaphore = new Semaphore(1);
    expect(() => semaphore.release()).not.toThrow();
  });
});

describe('ParallelEmbedder', () => {
  let mockEmbedder;
  let parallelEmbedder;

  beforeEach(() => {
    mockEmbedder = {
      embed: jest.fn()
    };
    parallelEmbedder = new ParallelEmbedder(mockEmbedder, {
      batchSize: 2,
      maxConcurrency: 2,
      retryAttempts: 1,
      retryDelay: 10
    });
  });

  describe('embedBatch', () => {
    it('should process chunks in parallel batches', async () => {
      const chunks = ['chunk1', 'chunk2', 'chunk3', 'chunk4'];
      const expectedVectors = [
        [[1, 2], [3, 4]], // Batch 1
        [[5, 6], [7, 8]]  // Batch 2
      ];
      
      mockEmbedder.embed
        .mockResolvedValueOnce(expectedVectors[0])
        .mockResolvedValueOnce(expectedVectors[1]);
      
      const result = await parallelEmbedder.embedBatch(chunks);
      
      expect(mockEmbedder.embed).toHaveBeenCalledTimes(2);
      expect(mockEmbedder.embed).toHaveBeenCalledWith(['chunk1', 'chunk2']);
      expect(mockEmbedder.embed).toHaveBeenCalledWith(['chunk3', 'chunk4']);
      expect(result).toEqual([[1, 2], [3, 4], [5, 6], [7, 8]]);
    });

    it('should handle empty chunks array', async () => {
      await expect(parallelEmbedder.embedBatch([])).rejects.toThrow('Invalid chunks provided');
    });

    it('should handle invalid chunks input', async () => {
      await expect(parallelEmbedder.embedBatch(null)).rejects.toThrow('Invalid chunks provided');
      await expect(parallelEmbedder.embedBatch('not-array')).rejects.toThrow('Invalid chunks provided');
    });

    it('should retry failed batches', async () => {
      const chunks = ['chunk1', 'chunk2'];
      
      mockEmbedder.embed
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce([[1, 2], [3, 4]]);
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const result = await parallelEmbedder.embedBatch(chunks);
      
      expect(mockEmbedder.embed).toHaveBeenCalledTimes(2);
      expect(result).toEqual([[1, 2], [3, 4]]);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Batch 0 attempt 1 failed, retrying')
      );
      
      consoleSpy.mockRestore();
    });

    it('should handle partial batch failures gracefully', async () => {
      const chunks = ['chunk1', 'chunk2', 'chunk3', 'chunk4'];
      
      mockEmbedder.embed
        .mockResolvedValueOnce([[1, 2], [3, 4]]) // Batch 0 succeeds
        .mockRejectedValueOnce(new Error('Batch failed')) // Batch 1 fails
        .mockRejectedValueOnce(new Error('Batch failed again')); // Retry fails
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const result = await parallelEmbedder.embedBatch(chunks);
      
      expect(result).toEqual([[1, 2], [3, 4]]);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: 1 batches failed')
      );
      
      consoleSpy.mockRestore();
    });

    it('should throw error if too many batches fail', async () => {
      const chunks = ['chunk1', 'chunk2', 'chunk3', 'chunk4'];
      
      // All batches fail
      mockEmbedder.embed
        .mockRejectedValue(new Error('All batches fail'))
        .mockRejectedValue(new Error('All batches fail'));
      
      await expect(parallelEmbedder.embedBatch(chunks)).rejects.toThrow('Parallel embedding failed');
    });

    it('should validate embedder results', async () => {
      const chunks = ['chunk1', 'chunk2'];
      
      // Return wrong number of vectors
      mockEmbedder.embed.mockResolvedValueOnce([[1, 2]]); // Only 1 vector for 2 chunks
      
      await expect(parallelEmbedder.embedBatch(chunks)).rejects.toThrow(
        'Embedder returned invalid result for batch 0'
      );
    });

    it('should maintain chunk order despite out-of-order completion', async () => {
      const chunks = ['chunk1', 'chunk2', 'chunk3', 'chunk4'];
      
      // Simulate second batch completing before first
      mockEmbedder.embed
        .mockImplementationOnce(() => new Promise(resolve => 
          setTimeout(() => resolve([[1, 2], [3, 4]]), 50)
        ))
        .mockImplementationOnce(() => new Promise(resolve => 
          setTimeout(() => resolve([[5, 6], [7, 8]]), 10)
        ));
      
      const result = await parallelEmbedder.embedBatch(chunks);
      
      // Results should still be in original order
      expect(result).toEqual([[1, 2], [3, 4], [5, 6], [7, 8]]);
    });
  });

  describe('createBatches', () => {
    it('should create correct batch sizes', () => {
      const items = ['a', 'b', 'c', 'd', 'e'];
      const batches = parallelEmbedder.createBatches(items, 2);
      
      expect(batches).toEqual([
        ['a', 'b'],
        ['c', 'd'],
        ['e']
      ]);
    });

    it('should handle empty arrays', () => {
      const batches = parallelEmbedder.createBatches([], 2);
      expect(batches).toEqual([]);
    });

    it('should handle single item', () => {
      const batches = parallelEmbedder.createBatches(['a'], 2);
      expect(batches).toEqual([['a']]);
    });
  });
});

describe('ParallelRetriever', () => {
  let mockRetriever;
  let parallelRetriever;

  beforeEach(() => {
    mockRetriever = {
      retrieve: jest.fn()
    };
    parallelRetriever = new ParallelRetriever(mockRetriever, {
      maxConcurrency: 2
    });
  });

  describe('retrieveBatch', () => {
    it('should process multiple query vectors in parallel', async () => {
      const queryVectors = [[1, 2], [3, 4], [5, 6]];
      const expectedResults = [
        [{ text: 'result1' }],
        [{ text: 'result2' }],
        [{ text: 'result3' }]
      ];
      
      mockRetriever.retrieve
        .mockResolvedValueOnce(expectedResults[0])
        .mockResolvedValueOnce(expectedResults[1])
        .mockResolvedValueOnce(expectedResults[2]);
      
      const results = await parallelRetriever.retrieveBatch(queryVectors);
      
      expect(mockRetriever.retrieve).toHaveBeenCalledTimes(3);
      expect(results).toEqual(expectedResults);
    });

    it('should handle empty query vectors', async () => {
      const results = await parallelRetriever.retrieveBatch([]);
      expect(results).toEqual([]);
    });

    it('should handle retrieval failures gracefully', async () => {
      const queryVectors = [[1, 2], [3, 4]];
      
      mockRetriever.retrieve
        .mockResolvedValueOnce([{ text: 'result1' }])
        .mockRejectedValueOnce(new Error('Retrieval failed'));
      
      const results = await parallelRetriever.retrieveBatch(queryVectors);
      
      // Should only return successful results
      expect(results).toEqual([[{ text: 'result1' }]]);
    });

    it('should maintain result order', async () => {
      const queryVectors = [[1, 2], [3, 4]];
      
      // Simulate second query completing before first
      mockRetriever.retrieve
        .mockImplementationOnce(() => new Promise(resolve => 
          setTimeout(() => resolve([{ text: 'result1' }]), 50)
        ))
        .mockImplementationOnce(() => new Promise(resolve => 
          setTimeout(() => resolve([{ text: 'result2' }]), 10)
        ));
      
      const results = await parallelRetriever.retrieveBatch(queryVectors);
      
      expect(results).toEqual([
        [{ text: 'result1' }],
        [{ text: 'result2' }]
      ]);
    });
  });
});
