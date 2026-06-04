export interface FAQOutput {
  faqQuestion: string;
  faqAnswer: string;
  tags: string[];
  quality_score: number;
}

export interface TagsOutput {
  tags: string[];
}

export interface QualityOutput {
  approved: boolean;
  score: number;
  issues: string[];
}

export interface IAIService {
  /**
   * D-05 FAQ Generation from Community Answers
   * Uses AI to synthesize a clean, professional, reusable FAQ entry from community feedback.
   */
  generateFAQ(question: string, answers: string[]): Promise<FAQOutput>;

  /**
   * D-06 Automatic Tag Generation
   * Generates 3-5 lowercase normalized tags for given content.
   */
  generateTags(content: string): Promise<TagsOutput>;

  /**
   * D-07 FAQ Quality Review
   * Evaluates the clarity, completeness, duplication risk, and relevance of an FAQ.
   */
  reviewFAQQuality(
    faqQuestion: string,
    faqAnswer: string
  ): Promise<QualityOutput>;
}

