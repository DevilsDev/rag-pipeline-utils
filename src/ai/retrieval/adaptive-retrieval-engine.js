/**
 * Adaptive Retrieval Engine - Extracted from monolithic AI module
 * Handles personalized content retrieval and user profile management
 */

const { EventEmitter } = require("events");
const crypto = require("crypto");

class AdaptiveRetrievalEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.config = {
      learning: {
        algorithm: options.algorithm || "contextual_bandit",
        explorationRate: options.explorationRate || 0.1,
        learningRate: options.learningRate || 0.01,
      },
      ...options,
    };
    this.userProfiles = new Map();
    this.queryHistory = new Map();
    this.feedbackHistory = [];
  }

  async initializeUserProfile(userId, preferences = {}) {
    const profile = {
      userId,
      interests: preferences.interests || [],
      preferences: preferences,
      expertise: preferences.expertise || "beginner",
      createdAt: Date.now(),
      interactions: 0,
      personalizedRankings: new Map(),
      learningHistory: [],
      adaptationWeights: {
        contentSimilarity: 0.4,
        userPreference: 0.3,
        contextualRelevance: 0.2,
        temporalDecay: 0.1,
      },
    };

    this.userProfiles.set(userId, profile);
    this.emit("userProfileInitialized", { userId, profile });
    return profile;
  }

  async getUserProfile(userId) {
    const profile = this.userProfiles.get(userId);
    if (!profile) {
      throw new Error(`User profile not found for ${userId}`);
    }
    return profile;
  }

  async adaptiveRetrieve(userId, query, options = {}) {
    const profile = this.userProfiles.get(userId);
    if (!profile) {
      throw new Error(
        `User profile not found for ${userId}. Please initialize profile first.`,
      );
    }

    const maxResults = options.maxResults || 10;

    // Simulate document retrieval with adaptive ranking
    const baseDocuments = Array.from({ length: maxResults }, (_, i) => ({
      id: `doc_${i + 1}`,
      title: `Document ${i + 1} about ${query}`,
      content: `Content related to ${query} with relevance score`,
      baseScore: 0.9 - i * 0.1,
      metadata: {
        source: "knowledge_base",
        timestamp: Date.now() - Math.random() * 86400000,
        tags: profile.interests.slice(0, 2),
      },
    }));

    // Apply adaptive ranking based on user profile
    const adaptedDocuments = baseDocuments
      .map((doc) => {
        const adaptiveScore = this._calculateAdaptiveScore(doc, profile, query);
        return {
          ...doc,
          adaptiveScore,
          finalScore: doc.baseScore * 0.6 + adaptiveScore * 0.4,
          adaptationFactors: {
            userInterests: profile.interests.some((interest) =>
              doc.title.toLowerCase().includes(interest.toLowerCase()),
            )
              ? 0.2
              : 0,
            expertise: profile.expertise === "advanced" ? 0.1 : 0,
            historicalPreference: Math.random() * 0.1,
          },
        };
      })
      .sort((a, b) => b.finalScore - a.finalScore);

    const result = {
      documents: adaptedDocuments,
      adaptationMetadata: {
        userId,
        query,
        adaptationStrategy: this.config.learning.algorithm,
        profileFactors: {
          interests: profile.interests,
          expertise: profile.expertise,
          interactionCount: profile.interactions,
        },
        retrievalTimestamp: Date.now(),
      },
    };

    // Update interaction count
    profile.interactions++;

    this.emit("adaptiveRetrievalCompleted", {
      userId,
      query,
      resultsCount: adaptedDocuments.length,
      adaptationApplied: true,
    });

    return result;
  }

  async processFeedback(userId, feedback) {
    const profile = this.userProfiles.get(userId);
    if (!profile) {
      throw new Error(`User profile not found for ${userId}`);
    }

    // Store feedback in learning history
    const feedbackEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      query: feedback.query,
      results: feedback.results,
      ratings: feedback.ratings || [],
      clickedResults: feedback.clickedResults || [],
      dwellTime: feedback.dwellTime || [],
      feedbackType: "explicit",
    };

    profile.learningHistory.push(feedbackEntry);

    // Initialize preferences.queryPatterns if not exists
    if (!profile.preferences.queryPatterns) {
      profile.preferences.queryPatterns = [];
    }

    // Update query patterns based on feedback
    if (feedback.query) {
      const existingPattern = profile.preferences.queryPatterns.find(
        (p) => p.query === feedback.query,
      );
      if (existingPattern) {
        existingPattern.frequency++;
        existingPattern.lastUsed = Date.now();
        if (feedback.ratings && feedback.ratings.length > 0) {
          const avgRating =
            feedback.ratings.reduce((sum, rating) => sum + rating, 0) /
            feedback.ratings.length;
          existingPattern.avgRating =
            (existingPattern.avgRating + avgRating) / 2;
        }
      } else {
        const avgRating =
          feedback.ratings && feedback.ratings.length > 0
            ? feedback.ratings.reduce((sum, rating) => sum + rating, 0) /
              feedback.ratings.length
            : 3;
        profile.preferences.queryPatterns.push({
          query: feedback.query,
          frequency: 1,
          avgRating,
          lastUsed: Date.now(),
          category: this._categorizeQuery(feedback.query),
        });
      }
    }

    // Update user preferences based on feedback
    if (feedback.ratings && feedback.ratings.length > 0) {
      const avgRating =
        feedback.ratings.reduce((sum, rating) => sum + rating, 0) /
        feedback.ratings.length;

      // Extract topics from highly rated results
      if (avgRating >= 4) {
        feedback.results.forEach((result, index) => {
          if (feedback.ratings[index] >= 4) {
            // Extract keywords and add to interests if not already present
            const keywords = result.title.toLowerCase().split(" ");
            keywords.forEach((keyword) => {
              if (keyword.length > 3 && !profile.interests.includes(keyword)) {
                profile.interests.push(keyword);
              }
            });
          }
        });
      }
    }

    // Update adaptation weights based on feedback patterns
    this._updateAdaptationWeights(profile, feedbackEntry);

    this.emit("feedbackProcessed", {
      userId,
      feedbackId: feedbackEntry.id,
      learningHistorySize: profile.learningHistory.length,
      updatedInterests: profile.interests,
    });

    return {
      processed: true,
      feedbackId: feedbackEntry.id,
      profileUpdated: true,
      newInterestsCount: profile.interests.length,
    };
  }

  async generatePersonalizedRankings(userId, results, context = {}) {
    const profile = this.userProfiles.get(userId);
    if (!profile) {
      throw new Error(`User profile not found for ${userId}`);
    }

    // Simulate personalized ranking based on user interests
    const rankedResults = results
      .map((result) => ({
        ...result,
        personalizedScore: Math.random() * 0.5 + 0.5,
        relevanceFactors: profile.interests.slice(0, 2),
      }))
      .sort((a, b) => b.personalizedScore - a.personalizedScore);

    this.emit("personalizedRankingsGenerated", {
      userId,
      resultsCount: rankedResults.length,
    });
    return rankedResults;
  }

  async personalizeRanking(userId, documents, context = {}) {
    const profile = this.userProfiles.get(userId);
    if (!profile) {
      throw new Error(`User profile not found for ${userId}`);
    }

    // Apply personalized ranking to documents
    const personalizedResults = documents
      .map((doc) => {
        let personalizedScore = doc.score || 0.5;
        const rankingFactors = {
          contentRelevance: 0,
          userInterests: 0,
          historicalPreference: 0,
          contextualMatch: 0,
        };

        // Boost score based on user interests
        if (profile.interests && profile.interests.length > 0) {
          const interestMatch = profile.interests.some((interest) =>
            doc.content.toLowerCase().includes(interest.toLowerCase()),
          );
          if (interestMatch) {
            rankingFactors.userInterests = 0.2;
            personalizedScore += 0.2;
          }
        }

        // Apply historical preferences
        if (profile.learningHistory && profile.learningHistory.length > 0) {
          rankingFactors.historicalPreference = Math.random() * 0.1;
          personalizedScore += rankingFactors.historicalPreference;
        }

        // Contextual matching with query
        if (context.query) {
          const queryWords = context.query.toLowerCase().split(" ");
          const contentWords = doc.content.toLowerCase().split(" ");
          const overlap = queryWords.filter((word) =>
            contentWords.includes(word),
          ).length;
          rankingFactors.contextualMatch = (overlap / queryWords.length) * 0.15;
          personalizedScore += rankingFactors.contextualMatch;
        }

        rankingFactors.contentRelevance = doc.score || 0.5;

        return {
          ...doc,
          personalizedScore: Math.min(personalizedScore, 1.0),
          rankingFactors,
        };
      })
      .sort((a, b) => b.personalizedScore - a.personalizedScore);

    this.emit("personalizedRankingCompleted", {
      userId,
      documentsCount: documents.length,
      query: context.query,
    });

    return personalizedResults;
  }

  async optimizeRetrieval(query, context = {}) {
    const optimizedQuery = `optimized: ${query}`;
    const retrievalStrategy = "adaptive";

    this.emit("retrievalOptimized", {
      originalQuery: query,
      optimizedQuery,
      strategy: retrievalStrategy,
      context,
    });

    return {
      query: optimizedQuery,
      strategy: retrievalStrategy,
      confidence: Math.random() * 0.3 + 0.7,
    };
  }

  _categorizeQuery(query) {
    const lowerQuery = query.toLowerCase();
    if (lowerQuery.includes("machine learning") || lowerQuery.includes("ml"))
      return "machine_learning";
    if (lowerQuery.includes("deep learning") || lowerQuery.includes("neural"))
      return "deep_learning";
    if (
      lowerQuery.includes("ai") ||
      lowerQuery.includes("artificial intelligence")
    )
      return "artificial_intelligence";
    if (lowerQuery.includes("data") || lowerQuery.includes("analytics"))
      return "data_science";
    return "general";
  }

  _calculateAdaptiveScore(document, profile, query) {
    let score = 0;

    // Interest matching
    const interestMatch = profile.interests.some(
      (interest) =>
        document.title.toLowerCase().includes(interest.toLowerCase()) ||
        document.content.toLowerCase().includes(interest.toLowerCase()),
    );
    if (interestMatch) score += 0.3;

    // Expertise level matching
    if (
      profile.expertise === "advanced" &&
      document.metadata.tags.includes("advanced")
    ) {
      score += 0.2;
    } else if (
      profile.expertise === "beginner" &&
      document.metadata.tags.includes("basic")
    ) {
      score += 0.2;
    }

    // Historical preference (simplified)
    score += Math.random() * 0.2;

    return Math.min(score, 1.0);
  }

  _updateAdaptationWeights(profile, feedbackEntry) {
    // Simple learning rate adjustment based on feedback quality
    const avgRating =
      feedbackEntry.ratings.length > 0
        ? feedbackEntry.ratings.reduce((sum, r) => sum + r, 0) /
          feedbackEntry.ratings.length
        : 3;

    if (avgRating >= 4) {
      // Positive feedback - slightly increase user preference weight
      profile.adaptationWeights.userPreference = Math.min(
        0.5,
        profile.adaptationWeights.userPreference + 0.01,
      );
    } else if (avgRating <= 2) {
      // Negative feedback - increase content similarity weight
      profile.adaptationWeights.contentSimilarity = Math.min(
        0.6,
        profile.adaptationWeights.contentSimilarity + 0.01,
      );
    }
  }
}

module.exports = { AdaptiveRetrievalEngine };
