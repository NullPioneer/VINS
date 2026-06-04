import * as fs from 'fs';
import * as path from 'path';
import { IAIService, FAQOutput, TagsOutput, QualityOutput } from './ai-service.interface';
import { KnowledgeCreationService, FAQDocument } from './knowledge-creation.service';

// ─── Real AI Service Adapter ────────────────────────────────────────
// Wraps the actual service functions from cs45/ai_functions/faq_ai_service.
// The AI service functions still return hardcoded stubs internally (MiniMax not yet
// wired), but ALL prompt-building logic and validators run for real.
// When MiniMax is connected, this adapter requires zero changes.
import { generateFAQ as _generateFAQ } from './cs45/ai_functions/faq_ai_service/src/services/generateFAQ';
import { generateTags as _generateTags } from './cs45/ai_functions/faq_ai_service/src/services/generateTags';
import { reviewFAQQuality as _reviewFAQQuality } from './cs45/ai_functions/faq_ai_service/src/services/reviewFAQQuality';

class aiServiceAdapter implements IAIService {

  // Delegates directly to the AI service module's generateFAQ function.
  // His function builds the LLM prompt and validates the response schema.
  public async generateFAQ(question: string, answers: string[]): Promise<FAQOutput> {
    const result = await _generateFAQ(question, answers);
    return {
      faqQuestion: result.faqQuestion,
      faqAnswer:   result.faqAnswer,
      tags:        result.tags,
      quality_score: result.quality_score,
    };
  }

  // Delegates to the AI service module's generateTags function.
  public async generateTags(content: string): Promise<TagsOutput> {
    const result = await _generateTags(content);
    return { tags: result.tags };
  }

  // Delegates to the AI service module's reviewFAQQuality function.
  public async reviewFAQQuality(
    faqQuestion: string,
    faqAnswer: string,
  ): Promise<QualityOutput> {
    const result = await _reviewFAQQuality(faqQuestion, faqAnswer);
    return {
      approved: result.approved,
      score:    result.score,
      issues:   result.issues,
    };
  }
}

// ─── Backend AiService Adapter (Query Classification Logic) ───────────────
// The backend AiService already implements classifyQuery() and analyzeToxicity()
// using the same heuristics the query classification module defined. We replicate the logic here in a
// lightweight standalone class so the runner does not need NestJS DI to boot.
class BackendAiAdapter {
  classifyQuery(text: string): { type: 'generic' | 'personal' } {
    const clean = (text || '').toLowerCase();
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const phonePattern = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g;
    const personalKeywords = [
      'my invoice', 'my billing', 'my credit card', 'my password',
      'my account number', 'charges on my profile', 'refund my order',
      'my phone number',
    ];
    const hasEmail = emailPattern.test(clean);
    const hasPhone = phonePattern.test(clean);
    const hasPersonalKw = personalKeywords.some(kw => clean.includes(kw));
    return { type: (hasEmail || hasPhone || hasPersonalKw) ? 'personal' : 'generic' };
  }

  // ── dummy placeholder for private professionalizeQuestion (no longer needed) ──
  private professionalizeQuestion(raw: string): string {
    return raw.trim();
  }
}

// --- Main Runner Execution ---
async function run() {
  console.log('====================================================');
  console.log('   VINS KNOWLEDGE CREATION PIPELINE RUNNER (MEMBER 4)  ');
  console.log('====================================================\n');

  const peerQuestionsPath = path.join(__dirname, 'peer_questions.json');
  const outputFaqPath = path.join(__dirname, 'professional_faqs.json');
  const existingFaqPath = path.join(__dirname, 'vicharanashala_faq.json');

  if (!fs.existsSync(peerQuestionsPath)) {
    console.error(`Error: File not found at ${peerQuestionsPath}`);
    process.exit(1);
  }

  // 1. Load Datasets
  console.log(`[1/4] Loading peer questions from ${path.basename(peerQuestionsPath)}...`);
  const rawQuestions = JSON.parse(fs.readFileSync(peerQuestionsPath, 'utf8'));
  console.log(`Loaded ${rawQuestions.length} raw peer questions.`);

  // Apply backend classification to override/verify the 'type' field on each question
  // This mirrors exactly what happens in questions.service.ts → raiseQuery()
  const backendAi = new BackendAiAdapter();
  for (const q of rawQuestions) {
    const classification = backendAi.classifyQuery(`${q.rawQuestion}`);
    // Only override if the field is missing; trust DB value if present
    if (!q.type) {
      q.type = classification.type;
    }
  }

  let existingTags: string[] = [];
  if (fs.existsSync(existingFaqPath)) {
    console.log(`[2/4] Loading existing tags from ${path.basename(existingFaqPath)} to prevent duplication...`);
    try {
      const existingData = JSON.parse(fs.readFileSync(existingFaqPath, 'utf8'));
      if (existingData.intent_categories) {
        existingTags = Object.keys(existingData.intent_categories);
        console.log(`Loaded ${existingTags.length} existing tag categories from samagama.in FAQ database.`);
      }
    } catch (e) {
      console.log('Warning: Failed to load existing tags, continuing with empty vocabulary.');
    }
  }

  // 2. Initialize Service Layer with the AI service module's adapter
  console.log('[3/4] Initializing KnowledgeCreationService with the real AI service adapter\'s real AI service adapter...');
  const realAIService = new aiServiceAdapter();
  const service = new KnowledgeCreationService(realAIService);

  // 3. Run Pipeline
  console.log('[4/4] Evaluating and translating questions via Negha\'s pipeline (real AI service adapter)...');
  const results = await service.evaluatePeerQuestions(rawQuestions, existingTags);

  // 4. Summarize Results
  const totalRaw = rawQuestions.length;
  const processedCount = results.length; // Met trigger (status = answered & >= 2 answers)
  const approved = results.filter(f => f.approved);
  const flagged = results.filter(f => !f.approved);

  console.log('\n================== RUN SUMMARY ==================');
  console.log(`Total Raw Peer Questions:         ${totalRaw}`);
  console.log(`Met Trigger (Answered, >=2 Ans): ${processedCount}`);
  console.log(`Auto-Approved (Score >= 0.70):    ${approved.length}`);
  console.log(`Flagged for Review (Score < 0.70):${flagged.length}`);
  console.log('=================================================\n');

  console.log('Approved FAQs Sample:');
  approved.slice(0, 5).forEach(f => {
    console.log(` - [${f.type.toUpperCase()}] Q: "${f.faqQuestion}" (Score: ${f.quality_score})`);
    console.log(`   A: "${f.faqAnswer.slice(0, 100)}..."`);
    console.log(`   Tags: ${JSON.stringify(f.tags)}\n`);
  });

  if (flagged.length > 0) {
    console.log('Flagged FAQs Sample:');
    flagged.slice(0, 2).forEach(f => {
      console.log(` - [${f.type.toUpperCase()}] Q: "${f.faqQuestion}" (Score: ${f.quality_score})`);
      console.log(`   Issues: ${JSON.stringify(f.issues)}\n`);
    });
  }

  // 5. Write outputs
  fs.writeFileSync(outputFaqPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`[Success] Written professionalized FAQs to ${path.basename(outputFaqPath)}.`);
}

run().catch(err => {
  console.error('Fatal Pipeline Error:', err);
});


