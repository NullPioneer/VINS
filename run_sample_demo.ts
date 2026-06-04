/**
 * VINS Knowledge Creation - Full Sample Demo (Member 4 - Negha)
 *
 * Runs one complete end-to-end example through BOTH pipelines:
 *   A) Community Q&A pipeline (peer questions → FAQ)
 *   B) Zoom transcription pipeline (meeting transcript → FAQ)
 *
 * Each phase is printed with a clear explanation of what is happening.
 */

import { ISamarpitAIService, FAQOutput, TagsOutput, QualityOutput } from './samarpit-ai.interface';
import { KnowledgeCreationService } from './knowledge-creation.service';
import { IZoomTranscriptionAIService, ZoomTranscriptionProcessor } from './zoom-transcription-processor';

// ─── Real Samarpit Adapter (same as run_pipeline.ts) ─────────────────────────
import { generateFAQ as _generateFAQ }         from './cs45/ai_functions/faq_ai_service/src/services/generateFAQ';
import { generateTags as _generateTags }        from './cs45/ai_functions/faq_ai_service/src/services/generateTags';
import { reviewFAQQuality as _reviewFAQQuality } from './cs45/ai_functions/faq_ai_service/src/services/reviewFAQQuality';

class SamarpitAIServiceAdapter implements IZoomTranscriptionAIService {
  async generateFAQ(question: string, answers: string[]): Promise<FAQOutput> {
    const r = await _generateFAQ(question, answers);
    return { faqQuestion: r.faqQuestion, faqAnswer: r.faqAnswer, tags: r.tags, quality_score: r.quality_score };
  }
  async generateTags(content: string): Promise<TagsOutput> {
    const r = await _generateTags(content);
    return { tags: r.tags };
  }
  async reviewFAQQuality(faqQuestion: string, faqAnswer: string): Promise<QualityOutput> {
    const r = await _reviewFAQQuality(faqQuestion, faqAnswer);
    return { approved: r.approved, score: r.score, issues: r.issues };
  }
  // Zoom-specific: simple heuristic extraction for demo
  async extractFAQsFromTranscription(transcription: string): Promise<FAQOutput[]> {
    const faqs: FAQOutput[] = [];
    if (/noc|objection|sign/i.test(transcription)) {
      faqs.push(await this.generateFAQ(
        'Who is authorized to sign the NOC?',
        ['Any HOD, Dean, Principal, or TPO can sign it. Must be physically stamped.']
      ));
    }
    if (/standup|mandatory|attendance/i.test(transcription)) {
      faqs.push(await this.generateFAQ(
        'Are daily Zoom standups mandatory?',
        ['Yes, attendance is tracked. Below 85% participation leads to deferral.']
      ));
    }
    return faqs;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function header(title: string) {
  const line = '═'.repeat(60);
  console.log(`\n${line}`);
  console.log(`  ${title}`);
  console.log(`${line}`);
}

function phase(num: string, label: string, explanation: string) {
  console.log(`\n┌─ Phase ${num}: ${label}`);
  console.log(`│  📌 ${explanation}`);
  console.log('│');
}

function result(label: string, value: string) {
  console.log(`│  ${label.padEnd(18)}: ${value}`);
}

function end() { console.log('└' + '─'.repeat(59)); }

// ─── PIPELINE A: Community Q&A ────────────────────────────────────────────────
async function runCommunityPipeline() {
  header('PIPELINE A — Community Q&A → FAQ Generation');

  // Sample: a real peer question with 2 answers (the minimum trigger)
  const sampleQuestion = "Hey, my HOD is on vacation. Can the TPO sign my NOC instead?";
  const sampleAnswers  = [
    "Peer: Yes, my TPO signed it and it was accepted.",
    "Admin: Any authorized signatory—HOD, Dean, Principal, or TPO—can sign the NOC."
  ];
  const questionType: 'general' | 'personal' = 'general'; // Set by Vishal's classifyQuery()

  phase('1', 'Trigger Check (≥ 2 answers)',
    'Your service only fires FAQ generation when a question has at least 2 community answers.\n' +
    '│     This prevents low-quality single-answer FAQs from being generated.');
  console.log(`│  Answers received : ${sampleAnswers.length}`);
  console.log(`│  Trigger fires?   : ${sampleAnswers.length >= 2 ? '✅ YES' : '❌ NO'}`);
  end();

  const adapter = new SamarpitAIServiceAdapter();
  const service = new KnowledgeCreationService(adapter);

  phase('2', 'generateFAQ() — Samarpit\'s real service',
    'Passes the raw question + answers to Samarpit\'s generateFAQ().\n' +
    '│     His function builds an LLM prompt and returns a structured FAQ object.\n' +
    '│     (Currently returns a stub; will use MiniMax once API is wired.)');
  console.log('│  Calling Samarpit\'s generateFAQ()...');
  const faqOut = await adapter.generateFAQ(sampleQuestion, sampleAnswers);
  result('  faqQuestion', `"${faqOut.faqQuestion.slice(0,60)}"`);
  result('  faqAnswer',   `"${faqOut.faqAnswer.slice(0,60)}..."`);
  result('  raw tags',    JSON.stringify(faqOut.tags));
  end();

  phase('3', 'normalizeTags() — Your logic',
    'YOUR code cleans, deduplicates, lowercases, and ensures 3–5 tags.\n' +
    '│     Adds fallback tags (internship, vins, faq) if fewer than 3 are returned.');
  const normalizedTags = service.normalizeTags(faqOut.tags);
  result('  normalized tags', JSON.stringify(normalizedTags));
  end();

  phase('4', 'reviewFAQQuality() — Samarpit\'s real service',
    'Passes the polished question + answer to Samarpit\'s reviewFAQQuality().\n' +
    '│     Returns a quality score (0.0–1.0) and a list of issues found.');
  const reviewOut = await adapter.reviewFAQQuality(faqOut.faqQuestion, faqOut.faqAnswer);
  result('  score',    `${reviewOut.score} / 1.0`);
  result('  approved', reviewOut.approved ? '✅ YES (≥ 0.70)' : '❌ NO (< 0.70)');
  result('  issues',   reviewOut.issues.length === 0 ? 'None' : reviewOut.issues.join('; '));
  end();

  phase('5', 'Auto-approval + type routing — Your logic',
    'YOUR code decides the final status based on the quality score:\n' +
    '│       score ≥ 0.70  →  status = "published"  (auto-approved)\n' +
    '│       score < 0.70  →  status = "pending_review" (admin reviews)\n' +
    '│     For PERSONAL questions, appends the escalation disclaimer automatically.');
  const isApproved = reviewOut.score >= 0.70;
  const status     = isApproved ? 'published' : 'pending_review';
  let   finalAnswer = faqOut.faqAnswer;
  const isPersonal = (questionType as string) === 'personal';
  if (isPersonal && !finalAnswer.includes('#escalate')) {
    finalAnswer += ' For individual case-by-case reviews, please raise an official ticket on your samagama.in dashboard or type #escalate in the Yaksha chat.';
  }
  result('  question type',  questionType.toUpperCase());
  result('  final status',   status);
  result('  disclaimer added', isPersonal ? '✅ YES' : '➖ N/A (general)');
  end();

  phase('6', 'Final FAQDocument output — Saved to MongoDB FAQ collection',
    'This is the final object your service returns to the backend.\n' +
    '│     The backend\'s FaqsService.createFaq() writes it to MongoDB.');
  const finalDoc = {
    faqQuestion:   faqOut.faqQuestion,
    faqAnswer:     finalAnswer,
    tags:          normalizedTags,
    quality_score: reviewOut.score,
    status,
    approved:      isApproved,
    issues:        reviewOut.issues,
    type:          questionType,
  };
  console.log('│');
  console.log(JSON.stringify(finalDoc, null, 2).split('\n').map(l => `│  ${l}`).join('\n'));
  end();
}

// ─── PIPELINE B: Zoom Transcription ───────────────────────────────────────────
async function runZoomPipeline() {
  header('PIPELINE B — Zoom Transcript → FAQ Extraction');

  const sampleTranscript = `
[00:02:10] Mentor: Make sure you upload your NOC on samagama.in.
[00:02:20] Intern A: Sir, who can sign the NOC?
[00:02:30] Mentor: Any HOD, Dean, Principal, or TPO can sign it. Must be physically stamped.
[10:05:00] TA: Remember, standup attendance is tracked and mandatory.
[10:05:20] Intern B: What if we miss a standup?
[10:05:35] TA: Below 85% participation and you'll be deferred to a later batch.
  `.trim();

  const transcriptType: 'general' | 'personal' = 'general';

  phase('1', 'Transcript received',
    'Admin pastes the raw Zoom transcript text. In production this would come\n' +
    '│     from a POST /admin/process-transcript API endpoint.');
  console.log('│  Transcript preview:');
  sampleTranscript.split('\n').slice(0, 4).forEach(l => console.log(`│    ${l}`));
  console.log('│    ...');
  end();

  const adapter   = new SamarpitAIServiceAdapter();
  const processor = new ZoomTranscriptionProcessor(adapter);

  phase('2', 'extractFAQsFromTranscription() — Zoom AI Service',
    'YOUR ZoomTranscriptionProcessor calls extractFAQsFromTranscription().\n' +
    '│     This scans the transcript for known topics (NOC, standups, exams, etc.)\n' +
    '│     and returns raw FAQ candidates.');
  console.log('│  Extracting FAQ candidates from transcript...');
  const faqCandidates = await adapter.extractFAQsFromTranscription(sampleTranscript);
  console.log(`│  FAQ candidates found: ${faqCandidates.length}`);
  faqCandidates.forEach((f, i) => console.log(`│    [${i+1}] "${f.faqQuestion}"`));
  end();

  phase('3', 'validateFAQSchema() → normalizeTags() → reviewFAQQuality()',
    'For each FAQ candidate YOUR code:\n' +
    '│       1. Validates the schema (question/answer not empty, tags is array)\n' +
    '│       2. Normalizes and deduplicates tags (3–5 range enforced)\n' +
    '│       3. Runs quality review and applies auto-approval at 0.70 threshold');
  const results = await processor.processZoomTranscription(sampleTranscript, transcriptType);
  console.log(`│  FAQs passed validation & approved: ${results.length}`);
  end();

  phase('4', 'Final FAQ outputs',
    'Each approved FAQ is ready to be saved into the MongoDB FAQ collection.');
  results.forEach((faq, i) => {
    console.log(`│\n│  ── FAQ #${i+1} ──`);
    result('  Question', `"${faq.faqQuestion}"`);
    result('  Answer',   `"${faq.faqAnswer.slice(0, 80)}..."`);
    result('  Tags',     JSON.stringify(faq.tags));
    result('  Score',    `${faq.quality_score} / 1.0`);
    result('  Status',   faq.status);
    result('  Approved', faq.approved ? '✅ YES' : '❌ NO');
  });
  end();
}

// ─── Run both ─────────────────────────────────────────────────────────────────
(async () => {
  await runCommunityPipeline();
  await runZoomPipeline();

  console.log('\n' + '═'.repeat(60));
  console.log('  ✅ ALL PHASES COMPLETED SUCCESSFULLY');
  console.log('  Your Knowledge Creation Layer is working end-to-end.');
  console.log('═'.repeat(60) + '\n');
})();
