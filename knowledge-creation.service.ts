import { ISamarpitAIService, FAQOutput, QualityOutput } from './samarpit-ai.interface';

export interface FAQDocument {
  faqQuestion: string;
  faqAnswer: string;
  tags: string[];
  quality_score: number;
  status: 'draft' | 'pending_review' | 'published' | 'archived';
  approved: boolean;
  issues: string[];
  type: 'general' | 'personal';
}

export class KnowledgeCreationService {
  constructor(private readonly samarpitAIService: ISamarpitAIService) {}

  /**
   * Task 24 & 25: Validates that the FAQ output matches the required schema.
   * Throws an error or returns false if fields are missing or invalid.
   */
  public validateFAQSchema(faq: any): boolean {
    if (!faq) return false;
    if (typeof faq.faqQuestion !== 'string' || faq.faqQuestion.trim() === '') return false;
    if (typeof faq.faqAnswer !== 'string' || faq.faqAnswer.trim() === '') return false;
    if (!Array.isArray(faq.tags)) return false;
    if (typeof faq.quality_score !== 'number' || isNaN(faq.quality_score)) return false;
    return true;
  }

  /**
   * Task 26: Normalizes tags to lowercase and deduplicates them.
   * Ensures tags are limited to 3-5 tags.
   */
  public normalizeTags(tags: string[], existingTags: string[] = []): string[] {
    if (!tags) return [];

    // Convert to lowercase, trim, and replace spaces with hyphens for clean structure
    const cleaned = tags.map(tag => 
      tag.toLowerCase().trim().replace(/\s+/g, '-')
    );

    // Deduplicate tags in the current list
    const uniqueTags = Array.from(new Set(cleaned));

    // Optional: filter out any tag that is already present in existingTags if required
    // Here we'll just keep the unique ones within the generated list
    const normalized = uniqueTags.filter(tag => tag.length > 0);

    // Limit to 3-5 tags. If less than 3, we add 'internship' as a fallback to meet the threshold
    if (normalized.length < 3) {
      const fallbackTags = ['internship', 'vins', 'faq'];
      for (const fallback of fallbackTags) {
        if (normalized.length >= 3) break;
        if (!normalized.includes(fallback)) {
          normalized.push(fallback);
        }
      }
    }

    // Return at most 5 tags as per style guide
    return normalized.slice(0, 5);
  }

  /**
   * Task 28: Trigger condition. Fires only when a question has >= 2 community answers.
   */
  public checkFAQGenerationTrigger(answers: string[]): boolean {
    return answers && answers.length >= 2;
  }

  /**
   * Process a single community query and community answers.
   * Translates them professionally using MiniMax service, normalizes tags,
   * evaluates quality, and determines the approval status based on the 0.70 threshold.
   */
  public async processCommunityQuestion(
    question: string,
    answers: string[],
    type: 'general' | 'personal',
    existingTags: string[] = []
  ): Promise<FAQDocument | null> {
    // 1. Check FAQ Generation Trigger (Task 28)
    if (!this.checkFAQGenerationTrigger(answers)) {
      // Trigger not met (requires >= 2 answers)
      return null;
    }

    try {
      // 2. Consume generateFAQ() (Task 25)
      const faqOutput = await this.samarpitAIService.generateFAQ(question, answers);

      // Validate output schema (Task 24 & 25)
      if (!this.validateFAQSchema(faqOutput)) {
        throw new Error('Malformed FAQ output received from AI Service Layer.');
      }

      // 3. Normalize tags (Task 26)
      const normalizedTags = this.normalizeTags(faqOutput.tags, existingTags);

      // 4. Consume reviewFAQQuality() (Task 27)
      const reviewOutput: QualityOutput = await this.samarpitAIService.reviewFAQQuality(
        faqOutput.faqQuestion,
        faqOutput.faqAnswer
      );

      // 5. Auto-approval flow based on 0.70 threshold (Task 27)
      const isApproved = reviewOutput.score >= 0.70;
      const status = isApproved ? 'published' : 'pending_review';

      // For personal questions, make sure we append appropriate styling rules or notifications
      let finalAnswer = faqOutput.faqAnswer;
      if (type === 'personal') {
        // Personal questions answer formatting: ensure professional disclaimer/guidance
        if (!finalAnswer.includes('raise an official ticket') && !finalAnswer.includes('raise #escalate')) {
          finalAnswer += ' For individual case-by-case reviews, please raise an official ticket on your samagama.in dashboard or type #escalate in the Yaksha chat to reach an coordinator.';
        }
      }

      return {
        faqQuestion: faqOutput.faqQuestion,
        faqAnswer: finalAnswer,
        tags: normalizedTags,
        quality_score: reviewOutput.score,
        status: status as any,
        approved: isApproved,
        issues: reviewOutput.issues,
        type,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error processing question "${question}":`, errorMessage);
      // Return a Draft item flagged with the validation error so it isn't lost
      return {
        faqQuestion: question,
        faqAnswer: 'Failed to generate answer automatically due to processing error: ' + errorMessage,
        tags: [],
        quality_score: 0.0,
        status: 'draft',
        approved: false,
        issues: [errorMessage],
        type,
      };
    }
  }

  /**
   * Main pipeline method to evaluate multiple raw peer questions,
   * translate them professionally, and group them.
   */
  public async evaluatePeerQuestions(
    rawQuestions: Array<{
      id: string;
      rawQuestion: string;
      answers: string[];
      tags: string[];
      status: string;
      type: 'general' | 'personal';
    }>,
    existingTags: string[] = []
  ): Promise<FAQDocument[]> {
    const results: FAQDocument[] = [];

    for (const q of rawQuestions) {
      // We only process questions that are marked as answered
      if (q.status !== 'answered') {
        continue;
      }

      const processed = await this.processCommunityQuestion(
        q.rawQuestion,
        q.answers,
        q.type,
        existingTags
      );

      if (processed) {
        results.push(processed);
      }
    }

    return results;
  }
}
