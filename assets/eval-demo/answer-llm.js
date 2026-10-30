// Offline stand-in LLM for the eval demo: answers with the top passage, or
// with $DEMO_ANSWER to simulate a model that stops using the documents.
module.exports = class AnswerLLM {
  async generate(query, docs) {
    return (
      process.env.DEMO_ANSWER ||
      (docs[0] ? docs[0].content : "No information found.")
    );
  }
};
