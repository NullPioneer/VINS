import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { FAQOutput, TagsOutput, QualityOutput } from './samarpit-ai.interface';
import { IZoomTranscriptionAIService, ZoomTranscriptionProcessor } from './zoom-transcription-processor';
import { FAQDocument } from './knowledge-creation.service';

/**
 * Mock implementation of Zoom AI Service Layer.
 * Implements the IZoomTranscriptionAIService interface to support isolated testing.
 */
class MockZoomAIService implements IZoomTranscriptionAIService {

  public async generateFAQ(question: string, answers: string[]): Promise<FAQOutput> {
    const faqQuestion = this.professionalizeQuestion(question);
    const faqAnswer = this.synthesizeAnswers(answers, question);
    const { tags } = await this.generateTags(`${faqQuestion} ${faqAnswer}`);
    const review = await this.reviewFAQQuality(faqQuestion, faqAnswer);

    return {
      faqQuestion,
      faqAnswer,
      tags,
      quality_score: review.score,
    };
  }

  public async generateTags(content: string): Promise<TagsOutput> {
    const text = content.toLowerCase();
    const foundTags = new Set<string>();

    if (/\b(noc)\b/i.test(text) || /no objection/i.test(text)) foundTags.add('noc');
    if (/\b(leave|absent|vacation)\b/i.test(text) || /\b(off)\b/i.test(text)) foundTags.add('leave');
    if (/\b(stipend|pay|deposit|fee|charge)\b/i.test(text)) foundTags.add('stipend');
    if (/\b(exam|exams|sem|sems|paper|papers)\b/i.test(text)) foundTags.add('exams');
    if (/\b(select|selected|selection|result|yellow)\b/i.test(text)) foundTags.add('selection');
    if (/\b(offer\s+letter|offer-letter)\b/i.test(text) || (/\b(offer)\b/i.test(text) && /\b(letter)\b/i.test(text))) foundTags.add('offer-letter');
    if (/\b(certificate|completion|grad|graduation)\b/i.test(text)) foundTags.add('certificate');
    if (/\b(mentor|mentors|mentorship|assign)\b/i.test(text)) foundTags.add('mentorship');
    if (/\b(project|projects|laptop|code|coding)\b/i.test(text)) foundTags.add('projects');
    if (/\b(slack|whatsapp|discord|communication|channel)\b/i.test(text)) foundTags.add('communication');
    if (/\b(time|date|duration|grace|timeline|batch)\b/i.test(text)) foundTags.add('timing');
    if (/\b(vibe|lms|quiz|login|proctor|proctoring)\b/i.test(text)) foundTags.add('vibe-lms');
    if (/\b(spurti|points|sp)\b/i.test(text)) foundTags.add('spurti-points');
    if (/\b(team|group|partner|teammate)\b/i.test(text)) foundTags.add('team-formation');

    const tags = Array.from(foundTags).slice(0, 5);
    return { tags };
  }

  public async reviewFAQQuality(
    faqQuestion: string,
    faqAnswer: string
  ): Promise<QualityOutput> {
    const issues: string[] = [];
    let score = 1.0;

    // Check Style Guide Rules
    if (!faqQuestion.endsWith('?')) {
      issues.push('Question must end with a question mark.');
      score -= 0.15;
    }
    if (faqQuestion.split(' ').length < 3) {
      issues.push('Question is too short and lacks context.');
      score -= 0.15;
    }
    if (faqQuestion.split(' ').length > 25) {
      issues.push('Question exceeds recommended length (25 words).');
      score -= 0.1;
    }

    if (faqAnswer.split(' ').length < 10) {
      issues.push('Answer is too short or incomplete.');
      score -= 0.2;
    }
    if (faqAnswer.toLowerCase().includes('i think') || faqAnswer.toLowerCase().includes('maybe')) {
      issues.push('Answer contains non-authoritative language ("i think", "maybe").');
      score -= 0.15;
    }

    score = Math.max(0, Math.min(1.0, parseFloat(score.toFixed(2))));
    const approved = score >= 0.70;

    return {
      approved,
      score,
      issues,
    };
  }

  /**
   * Extracts mock FAQs based on keyword analysis of transcriptions.
   */
  public async extractFAQsFromTranscription(transcription: string): Promise<FAQOutput[]> {
    const text = transcription.toLowerCase();
    const faqs: FAQOutput[] = [];

    // 1. Check for NOC/Objection/Signatures/Upload
    if (/\b(noc|objection|sign|signature|stamped)\b/i.test(text)) {
      // Check if it's about authority/who can sign
      if (/\b(who|authority|authorized|hod|tpo|dean|principal)\b/i.test(text)) {
        faqs.push(await this.generateFAQ(
          "Who is authorized to sign the No Objection Certificate (NOC)?",
          ["Any authorized signatory at your college—including the HOD, Acting HOD, Dean, Principal, or Training & Placement Officer (TPO)—is permitted to sign the No Objection Certificate (NOC). The document must be physically signed and stamped with the official institutional seal."]
        ));
      }
      // Check if it's about format/PDF/size
      if (/\b(format|requirements|digital|upload|pdf|size|mb)\b/i.test(text)) {
        faqs.push(await this.generateFAQ(
          "What are the formatting, signature, and submission requirements for the NOC?",
          ["The No Objection Certificate (NOC) must be downloaded from the samagama.in dashboard, printed, physically signed and stamped by an authorized college authority, and uploaded as a PDF (max 1 MB). Hand-written signatures and official seals are mandatory; digital signatures on the PDF path are not accepted."]
        ));
      }
    }

    // 2. Check for Daily Standups/Attendance/Exams
    if (/\b(standup|standups|attendance|mandatory|exams|sem|pause|leave)\b/i.test(text)) {
      // Check if it's about standups mandatory
      if (/\b(mandatory|compulsory|miss|track|attendance)\b/i.test(text)) {
        faqs.push(await this.generateFAQ(
          "How do I get the link for the daily Zoom standups? Are they mandatory?",
          ["Daily Zoom standup links are posted in the Announcements section on your samagama.in dashboard — look for the announcement bell at the top of the page. You are expected to check it daily before the session. Attending the daily standups is mandatory for all interns. This is a full-time summer internship programme, and the daily standup is the primary touchpoint where progress, blockers, and the day's plan are communicated. Missing standups is treated as missing work. Attendance and participation are tracked against strict thresholds — see 10.7."]
        ));
      }
      // Check if it's about exam leaves / pause
      if (/\b(exam|exams|pause|leave|defer)\b/i.test(text)) {
        faqs.push(await this.generateFAQ(
          "Can I temporarily pause the internship or take leave for college exams?",
          ["You cannot pause the internship or take leave for college exams. The attendance rule is firm, and a continuous 55-day commitment is required. If exams fall inside your internship window, you must defer your start date to after your exams conclude."]
        ));
      }
    }

    // Fallback if empty or no matching topics
    if (faqs.length === 0 && text.trim().length > 0) {
      faqs.push(await this.generateFAQ(
        "What is the Vicharanashala Internship (VINS) program?",
        ["The Vicharanashala Internship (VINS) is a free, online 55-day continuous internship providing direct mentorship on real open-source projects. Standard compute resources are provided on the cloud, and interns must maintain high attendance and submit daily journal logs."]
      ));
    }

    return faqs;
  }

  // --- Mock Heuristics for Translation & Synthesizing ---

  private professionalizeQuestion(raw: string): string {
    let clean = raw.trim();
    // Strip greetings/informalities
    clean = clean.replace(/^(hey|hi|hello|please|plz|can you tell me|i want to know|tell me|ask|query regarding|doubt regarding|guys)\b/i, '');
    clean = clean.trim();
    // Capitalize first letter
    clean = clean.charAt(0).toUpperCase() + clean.slice(1);
    if (!clean.endsWith('?')) {
      clean += '?';
    }
    return clean;
  }

  private synthesizeAnswers(rawAnswers: string[], question: string): string {
    if (!rawAnswers || rawAnswers.length === 0) {
      return 'No answer provided.';
    }
    return rawAnswers.join(' ');
  }
}

// Set up readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (query: string): Promise<string> => {
  return new Promise((resolve) => rl.question(query, resolve));
};

// Preset Sample Transcripts
const SAMPLE_TRANSCRIPT_1 = `
[00:02:10] Mentor: Okay team, let's discuss onboarding. Make sure you upload your NOC on samagama.in.
[00:02:20] Intern A: Sir, who can sign the NOC for our college?
[00:02:30] Mentor: Good question. Any authorized signatory like HOD, Dean, Principal, or Training & Placement Officer (TPO) can sign it. But it must be physically stamped.
[00:02:45] Intern B: Can we use digital signatures on the PDF?
[00:02:50] Mentor: No, digital signatures on the PDF path are not accepted. You need to print it, get it physically signed and stamped, then upload a PDF scan under 1 MB.
`;

const SAMPLE_TRANSCRIPT_2 = `
[10:05:00] TA: Let's do the standup. Remember, standup attendance is tracked.
[10:05:20] Intern C: Is daily standup mandatory? What happens if we miss one?
[10:05:35] TA: Yes, daily Zoom standups are absolutely mandatory. We track live attendance and participation rolling over the last 5 days. If it falls below 85%, you'll be deferred to a later batch.
[10:06:00] Intern D: What if we have semester exams coming up? Can we pause the internship?
[10:06:15] TA: No, you cannot pause the internship or take leave for college exams. VINS requires a continuous 55-day commitment. If you have exams, you should defer your start date to the next batch.
`;

const mockAIService = new MockZoomAIService();
const processor = new ZoomTranscriptionProcessor(mockAIService);
const existingFaqPath = path.join(__dirname, 'vicharanashala_faq.json');

async function showMenu() {
  console.log('\n======================================================');
  console.log('   VINS ZOOM TRANSCRIPTION FAQ PIPELINE (MEMBER 4)    ');
  console.log('======================================================');
  console.log('1. Process Sample Transcript 1: Onboarding & NOC Policies');
  console.log('2. Process Sample Transcript 2: Daily Standups & Exam Policies');
  console.log('3. Enter a Custom Zoom Meeting Transcription');
  console.log('4. Exit');
  console.log('======================================================');
  
  const choice = await askQuestion('Choose an option (1-4): ');
  
  if (choice.trim() === '1') {
    await runPipelineOnTranscript(SAMPLE_TRANSCRIPT_1, "Sample Transcript 1: Onboarding & NOC");
  } else if (choice.trim() === '2') {
    await runPipelineOnTranscript(SAMPLE_TRANSCRIPT_2, "Sample Transcript 2: Daily Standups & Exams");
  } else if (choice.trim() === '3') {
    await handleCustomInput();
  } else if (choice.trim() === '4') {
    console.log('\nGoodbye!');
    rl.close();
    process.exit(0);
  } else {
    console.log('\n[Error] Invalid choice. Please select 1, 2, 3, or 4.');
    await showMenu();
  }
}

async function runPipelineOnTranscript(transcriptText: string, name: string) {
  console.log(`\n--- Processing: ${name} ---`);
  console.log('--- Transcript Preview ---');
  console.log(transcriptText.trim().split('\n').slice(0, 5).join('\n'));
  if (transcriptText.trim().split('\n').length > 5) console.log('...');
  console.log('--------------------------');

  const typeChoice = await askQuestion('\nIs this transcription general or personal? (g/p) [default: general]: ');
  const type = typeChoice.trim().toLowerCase() === 'p' ? 'personal' : 'general';

  // Load existing tags from database (Task 26)
  let existingTags: string[] = [];
  if (fs.existsSync(existingFaqPath)) {
    try {
      const existingData = JSON.parse(fs.readFileSync(existingFaqPath, 'utf8'));
      if (existingData.intent_categories) {
        existingTags = Object.keys(existingData.intent_categories);
      }
    } catch (e) {
      // Ignored
    }
  }

  console.log('\n[Processing] Running Zoom Meeting Transcription extraction pipeline...');
  const results = await processor.processZoomTranscription(transcriptText, type, existingTags);

  printResults(results);

  await askQuestion('\nPress [Enter] to return to the main menu...');
  await showMenu();
}

async function handleCustomInput() {
  console.log('\n--- Custom Zoom Transcript Input ---');
  console.log('Enter or paste the transcription text. Type "done" on a blank line when finished:');
  
  const lines: string[] = [];
  while (true) {
    const line = await askQuestion('');
    if (line.trim().toLowerCase() === 'done') {
      break;
    }
    lines.push(line);
  }

  const transcript = lines.join('\n');
  if (!transcript.trim()) {
    console.log('[Warning] Transcript cannot be empty.');
    await showMenu();
    return;
  }

  await runPipelineOnTranscript(transcript, "Custom User Transcript");
}

function printResults(results: FAQDocument[]) {
  console.log('\n================== PIPELINE RESULT ==================');
  console.log(`Total FAQs Extracted: ${results.length}`);
  console.log('=====================================================');

  if (results.length === 0) {
    console.log('No FAQs could be extracted or generated from the transcription.');
    return;
  }

  results.forEach((faq, index) => {
    console.log(`\n[FAQ #${index + 1}]`);
    console.log(`Question:    "${faq.faqQuestion}"`);
    console.log(`Answer:      "${faq.faqAnswer}"`);
    console.log(`Tags:        ${JSON.stringify(faq.tags)}`);
    console.log(`Score:       ${faq.quality_score} / 1.0`);
    console.log(`Status:      [${faq.status}] (${faq.approved ? '✅ Approved' : '❌ Flagged for Review'})`);
    
    if (faq.issues.length > 0) {
      console.log('Quality Warnings:');
      faq.issues.forEach(iss => console.log(`  - ⚠️  ${iss}`));
    } else {
      console.log('🎉 No quality issues detected.');
    }
    console.log('-----------------------------------------------------');
  });
}

// Start CLI
showMenu();
