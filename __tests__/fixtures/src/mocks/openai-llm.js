/**
 * Mock OpenAI LLM Plugin
 * Implements: llm.generate(prompt, options)
 */
class OpenAILLM {
  async generate(prompt, options = {}) {
    if (options.stream) {
      return this.generateStream(prompt);
    }
    
    // Simulate async generation
    await new Promise(resolve => setTimeout(resolve, 10));
    
    return {
      text: `Generated response to: "${prompt}"`,
      usage: {
        promptTokens: prompt.length / 4,
        completionTokens: 20,
        totalTokens: (prompt.length / 4) + 20
      },
      model: 'gpt-3.5-turbo-mock'
    };
  }
  
  async *generateStream(prompt) {
    const tokens = ['Generated', ' response', ' to:', ` "${prompt}"`];
    
    for (let i = 0; i < tokens.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 10));
      yield {
        token: tokens[i],
        done: false,
        usage: i === tokens.length - 1 ? {
          promptTokens: prompt.length / 4,
          completionTokens: i + 1,
          totalTokens: (prompt.length / 4) + i + 1
        } : null
      };
    }
    
    yield { token: '', done: true };
  }
}


module.exports = OpenAILLM;
