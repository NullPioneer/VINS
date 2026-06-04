import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { ISamarpitAIService, FAQOutput, TagsOutput, QualityOutput } from './samarpit-ai.interface';
import { KnowledgeCreationService } from './knowledge-creation.service';

/**
 * Mock implementation of Samarpit's AI Service Layer (MiniMax-2 client)
 * to run Negha's pipeline in isolation.
 */
class MockSamarpitAIService implements ISamarpitAIService {
  
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

    const questionLower = clean.toLowerCase();
    
    // Check key phrases for professional translation mapping using word boundary regexes
    if (/\b(slack|invite|channel)\b/i.test(questionLower)) {
      return 'How do I obtain access to official VINS communication channels like Slack?';
    }
    if (/\b(noc|objection)\b/i.test(questionLower)) {
      if (/\b(tpo|placement|vacation|sign|signed|signatory|signatories|authority)\b/i.test(questionLower)) {
        return 'Who is authorized to sign the No Objection Certificate (NOC)?';
      }
      return 'What are the formatting, signature, and submission requirements for the NOC?';
    }
    if (/\b(leave|absent|wedding)\b/i.test(questionLower) || /\b(off)\b/i.test(questionLower)) {
      return 'Can I take leave or request an exemption during the internship?';
    }
    if (/\b(stipend|pay|money|deposit|fee|charge)\b/i.test(questionLower)) {
      return 'Is there any stipend or program fee associated with the VINS internship?';
    }
    if (/\b(exam|exams|sem|sems|paper)\b/i.test(questionLower)) {
      return 'Can I temporarily pause the internship or take leave for college exams?';
    }
    if (/\b(certificate|completed|graduation)\b/i.test(questionLower)) {
      return 'How and when will the completion certificate be issued?';
    }
    if (/\b(team|group|partner|teammate)\b/i.test(questionLower)) {
      return 'Can I form a team with my friends from the same college, or switch teams if a teammate is inactive?';
    }
    if (/\b(project|projects|laptop|hardware)\b/i.test(questionLower)) {
      if (/\b(change|allocate|assign)\b/i.test(questionLower)) {
        return 'Is it possible to change my project assignment after the training phase?';
      }
      return 'What laptop hardware specifications are required for VINS projects?';
    }
    if (/\b(rosetta|journal|write)\b/i.test(questionLower)) {
      return 'What are the policies and guidelines for writing the daily Rosetta journal?';
    }
    if (/\b(vibe|lms|quiz|login|proctor|proctoring)\b/i.test(questionLower)) {
      return 'How do I resolve registration and login issues on the ViBe LMS platform?';
    }
    if (/\b(start|starts|timeline|when)\b/i.test(questionLower)) {
      return 'When does the internship start and what are the timeline constraints?';
    }

    return clean;
  }

  private synthesizeAnswers(rawAnswers: string[], question: string): string {
    if (!rawAnswers || rawAnswers.length === 0) {
      return 'No answer provided by community or admins.';
    }

    const cleanAnswers = rawAnswers
      .map(a => {
        // 1. Remove sender labels (peer, admin, etc.)
        let clean = a.replace(/^(peer:|admin:|peer\s\d+:|tutor:)\s*/i, '').trim();
        // 2. Remove conversational Yes/No/Yeah/Nope prefixes
        clean = clean.replace(/^(yes|no|yeah|nope|sure|ok|yep|nah)\b[,.\s]*/i, '').trim();
        // 3. Remove conversational filler phrases
        clean = clean.replace(/^(i think|in my opinion|according to me|as far as i know|basically|actually)\b[,.\s]*/i, '').trim();
        // 4. Capitalize first letter
        clean = clean.charAt(0).toUpperCase() + clean.slice(1);
        if (clean && !/[.!?]$/.test(clean)) clean += '.';
        return clean;
      })
      .filter(a => a.length > 5);

    if (cleanAnswers.length === 0) {
      return 'Insufficient feedback.';
    }

    const questionLower = question.toLowerCase();

    // Map synthesized answers based on strict regex matching (strictly polished with no Yes/No prefixes)
    if (/\b(slack|invite|channel)\b/i.test(questionLower)) {
      return 'Slack invitation links are sent to your registered email address once your selection dashboard displays selection completion. If you did not receive it, contact the assigned TA.';
    }
    if (/\b(noc|objection)\b/i.test(questionLower)) {
      if (/\b(tpo|placement)\b/i.test(questionLower)) {
        return 'Any authorized signatory at your college—including the HOD, Acting HOD, Dean, Principal, or Training & Placement Officer (TPO)—is permitted to sign the No Objection Certificate (NOC). The document must be physically signed and stamped with the official institutional seal.';
      }
      return 'The No Objection Certificate (NOC) must be downloaded from the samagama.in dashboard, printed, physically signed and stamped by an authorized college authority, and uploaded as a PDF (max 1 MB). Hand-written signatures and official seals are mandatory; digital signatures on the PDF path are not accepted.';
    }
    if (/\b(leave|absent|wedding)\b/i.test(questionLower) || /\b(off)\b/i.test(questionLower)) {
      return 'Leaves or pausing are strictly prohibited during the 55-day continuous internship window. Candidates requiring leave for personal commitments or examinations will be relieved from the internship immediately and deferred to a future batch when they can commit with full availability.';
    }
    if (/\b(stipend|pay|money|deposit|fee|charge)\b/i.test(questionLower)) {
      return 'The Vicharanashala Internship (VINS) is a free, online program. No fees are charged to the interns, and no stipend is provided for the core Bronze and Silver phases. The program offers direct mentorship on real open-source projects.';
    }
    if (/\b(exam|exams|sem|sems|paper)\b/i.test(questionLower)) {
      return 'You cannot pause the internship or take leave for college exams. The attendance rule is firm, and a continuous 55-day commitment is required. If exams fall inside your internship window, you must defer your start date to after your exams conclude.';
    }
    if (/\b(certificate|completed)\b/i.test(questionLower)) {
      return 'Completion certificates are issued digitally by the Vicharanashala Lab for Education Design at IIT Ropar upon successful completion of both the Bronze (training) and Silver (project contribution) phases. They are downloadable from the samagama.in dashboard; physical copies are not mailed.';
    }
    if (/\b(team|group|partner|teammate)\b/i.test(questionLower)) {
      return 'Teams are assigned by mentors based on project requirements. You cannot choose your own team members or change teams once assigned. If your teammate is inactive, report this directly to your mentor, but do not halt your own contributions.';
    }
    if (/\b(project|projects)\b/i.test(questionLower)) {
      if (/\b(change|allocate|assign)\b/i.test(questionLower)) {
        return 'Project assignments cannot be changed once they are allocated at the end of the orientation and training phase.';
      }
      return 'A standard laptop is sufficient as compute-heavy tasks will run on cloud resources provided by the lab. Submissions and coding tasks cannot be completed on a mobile device.';
    }
    if (/\b(rosetta|journal|write)\b/i.test(questionLower)) {
      return 'Rosetta is your daily internship journal and is a mandatory requirement for certificate eligibility. Entries must be updated daily reflecting your own thinking. Using AI tools like ChatGPT to write or summarize Rosetta entries is strictly prohibited and will result in immediate termination.';
    }
    if (/\b(vibe|lms|quiz|login|proctor|proctoring)\b/i.test(questionLower)) {
      return 'To resolve login issues, ensure you are registering on the ViBe LMS using the exact email address that received your selection result. If proctoring flags occur due to network dropouts during quizzes, contact your TA immediately to reset your attempt.';
    }

    return cleanAnswers.join(' ');
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

const mockAIService = new MockSamarpitAIService();
const service = new KnowledgeCreationService(mockAIService);
const peerQuestionsPath = path.join(__dirname, 'peer_questions.json');

async function showMenu() {
  console.log('\n======================================================');
  console.log('   VINS FAQ KNOWLEDGE CREATION TEST PLAYGROUND (M1)   ');
  console.log('======================================================');
  console.log('1. Load a Raw Question from Database (peer_questions.json)');
  console.log('2. Type a Custom Raw Question & Answers (Real-Time Polishing)');
  console.log('3. Exit');
  console.log('======================================================');
  
  const choice = await askQuestion('Choose an option (1-3): ');
  
  if (choice.trim() === '1') {
    await handleDatabaseInput();
  } else if (choice.trim() === '2') {
    await handleCustomInput();
  } else if (choice.trim() === '3') {
    console.log('\nGoodbye!');
    rl.close();
    process.exit(0);
  } else {
    console.log('\n[Error] Invalid choice. Please select 1, 2, or 3.');
    await showMenu();
  }
}

async function handleDatabaseInput() {
  if (!fs.existsSync(peerQuestionsPath)) {
    console.log('\n[Error] peer_questions.json not found! Run the pipeline script first.');
    await showMenu();
    return;
  }

  const rawQuestions = JSON.parse(fs.readFileSync(peerQuestionsPath, 'utf8'));
  console.log(`\n--- Available Questions in Database (${rawQuestions.length} entries) ---`);
  
  // Show first 10 questions for selection
  rawQuestions.slice(0, 15).forEach((q: any) => {
    console.log(`[${q.id}] (${q.type.toUpperCase()}) Raw Q: "${q.rawQuestion.slice(0, 60)}..." (Status: ${q.status})`);
  });
  if (rawQuestions.length > 15) {
    console.log(`... and ${rawQuestions.length - 15} more entries in database.`);
  }

  const idToLoad = await askQuestion('\nEnter Question ID to process (or leave blank to return): ');
  if (!idToLoad.trim()) {
    await showMenu();
    return;
  }

  const questionObj = rawQuestions.find((q: any) => q.id.toLowerCase() === idToLoad.trim().toLowerCase());
  
  if (!questionObj) {
    console.log(`\n[Error] Question ID "${idToLoad}" not found.`);
    await handleDatabaseInput();
    return;
  }

  console.log('\n------------------------------------------------');
  console.log(`[LOADING] Loaded ${questionObj.id}`);
  console.log(`Raw Question: "${questionObj.rawQuestion}"`);
  console.log('Raw Answers:');
  questionObj.answers.forEach((ans: string, i: number) => console.log(`  ${i+1}. "${ans}"`));
  console.log(`Type:         ${questionObj.type}`);
  console.log(`Status:       ${questionObj.status}`);
  console.log('------------------------------------------------');

  console.log('\n[PROCESSING] Running Negha\'s Knowledge Creation pipeline in real-time...');
  const polished = await service.processCommunityQuestion(
    questionObj.rawQuestion,
    questionObj.answers,
    questionObj.type
  );

  printPolishedResult(polished, questionObj.answers.length);
  
  await askQuestion('\nPress [Enter] to return to the main menu...');
  await showMenu();
}

async function handleCustomInput() {
  console.log('\n--- Custom Raw Q&A Interactive Translator ---');
  const rawQuestion = await askQuestion('Enter raw peer question: ');
  if (!rawQuestion.trim()) {
    console.log('[Warning] Question cannot be empty.');
    await handleCustomInput();
    return;
  }

  const answers: string[] = [];
  console.log('\nEnter raw answers from peers/admins (type "done" or leave empty when finished):');
  
  let index = 1;
  while (true) {
    const ans = await askQuestion(`Answer ${index}: `);
    if (!ans.trim() || ans.trim().toLowerCase() === 'done') {
      break;
    }
    answers.push(ans.trim());
    index++;
  }

  const typeChoice = await askQuestion('\nIs this question general or personal? (g/p): ');
  const type = typeChoice.trim().toLowerCase() === 'p' ? 'personal' : 'general';

  console.log('\n[PROCESSING] Synthesizing, polishing and checking quality scores in real-time...');
  const polished = await service.processCommunityQuestion(rawQuestion, answers, type);

  printPolishedResult(polished, answers.length);

  await askQuestion('\nPress [Enter] to return to the main menu...');
  await showMenu();
}

function printPolishedResult(polished: any, numAnswers: number) {
  if (!polished) {
    console.log('\n======================================================');
    console.log('❌ PIPELINE RESULT: TRIGGER CONDITION NOT MET');
    console.log('======================================================');
    console.log(`Detail: Query had only ${numAnswers} answer(s).`);
    console.log('Requirement: FAQ generation triggers only when a query has >= 2 community answers.');
    console.log('======================================================');
    return;
  }

  console.log('\n======================================================');
  console.log('✨ POLISHED PROFESSIONAL FAQ GENERATED IN REAL-TIME');
  console.log('======================================================');
  console.log(`Polished Question:  "${polished.faqQuestion}"`);
  console.log(`Polished Answer:    "${polished.faqAnswer}"`);
  console.log(`Normalized Tags:    ${JSON.stringify(polished.tags)}`);
  console.log(`Quality Score:      ${polished.quality_score} / 1.0`);
  console.log(`Auto-Approved:      ${polished.approved ? '✅ YES' : '❌ NO'}`);
  console.log(`Pipeline Status:    [${polished.status}]`);
  
  if (polished.issues.length > 0) {
    console.log('\nQuality Warnings / Issues Detected:');
    polished.issues.forEach((iss: string) => console.log(`  ⚠️  ${iss}`));
  } else {
    console.log('\n🎉 Perfect Score! Adheres completely to FAQ Style Guide.');
  }
  console.log('======================================================');
}

// Start the playground CLI
showMenu();
