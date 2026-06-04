import { IAIService, FAQOutput } from './ai-service.interface';
import { KnowledgeCreationService, FAQDocument } from './knowledge-creation.service';

/**
 * Interface extending the AI service module's AI Service to add Zoom transcription capability.
 * This keeps the main AI interface decoupled until it is fully integrated.
 */
export interface IZoomTranscriptionAIService extends IAIService {
  /**
   * Parses/Extracts structured FAQ objects from a raw Zoom meeting transcript.
   */
  extractFAQsFromTranscription(transcription: string): Promise<FAQOutput[]>;
}

/**
 * Zoom-specific knowledge creation service that processes transcriptions,
 * normalizes generated tags, reviews FAQ quality, and manages approval status.
 */
export class ZoomTranscriptionProcessor extends KnowledgeCreationService {
  constructor(private readonly zoomAIService: IZoomTranscriptionAIService) {
    super(zoomAIService);
  }

  /**
   * Process a Zoom meeting transcription to generate, normalize, and score FAQs.
   */
  public async processZoomTranscription(
    transcription: string,
    type: 'general' | 'personal',
    existingTags: string[] = []
  ): Promise<FAQDocument[]> {
    try {
      // 1. Call AI Service to extract FAQ candidates from the transcript
      const faqOutputs = await this.zoomAIService.extractFAQsFromTranscription(transcription);
      
      const results: FAQDocument[] = [];
      
      for (const faq of faqOutputs) {
        // Validate basic schema before proceeding (Task 24 & 25)
        if (!this.validateFAQSchema(faq)) {
          console.warn(`Skipping malformed FAQ candidate: ${JSON.stringify(faq)}`);
          continue;
        }

        // 2. Normalize tags (Task 26)
        const normalizedTags = this.normalizeTags(faq.tags, existingTags);
        
        // 3. Review quality (Task 27)
        const reviewOutput = await this.zoomAIService.reviewFAQQuality(
          faq.faqQuestion,
          faq.faqAnswer
        );
        
        // 4. Auto-approval flow based on 0.70 threshold (Task 27)
        const isApproved = reviewOutput.score >= 0.70;
        const status = isApproved ? 'published' : 'pending_review';
        
        // 5. Apply escalation disclaimer to personal questions
        let finalAnswer = faq.faqAnswer;
        if (type === 'personal') {
          if (!finalAnswer.includes('raise an official ticket') && !finalAnswer.includes('raise #escalate')) {
            finalAnswer += ' For individual case-by-case reviews, please raise an official ticket on your samagama.in dashboard or type #escalate in the Yaksha chat to reach an coordinator.';
          }
        }
        
        results.push({
          faqQuestion: faq.faqQuestion,
          faqAnswer: finalAnswer,
          tags: normalizedTags,
          quality_score: reviewOutput.score,
          status: status as any,
          approved: isApproved,
          issues: reviewOutput.issues,
          type,
        });
      }
      
      return results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error processing Zoom meeting transcription:`, errorMessage);
      return [];
    }
  }
}


