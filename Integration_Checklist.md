# Integration Checklist & Dependencies - AI Member 4 (Negha)

This checklist details everything you (AI Member 4 - Negha) need from the other teams to integrate your **Knowledge Creation Layer** into the complete Crowd-Sourced FAQ Generation Platform.

---

## 1. AI Team Dependencies

### 🤖 From AI service module (AI Service Layer)
* **API Implementation**: The actual TypeScript implementation of the MiniMax-2 wrappers for the three functions defined in [AI service module-ai.interface.ts](file:///c:/Users/negha/OneDrive/Documents/VINS/AI service module-ai.interface.ts):
  1. `generateFAQ(question: string, answers: string[])`
  2. `generateTags(content: string)`
  3. `reviewFAQQuality(faq: FAQInput)`
* **Configuration**: API key setup and environment variables loaded in NestJS (`MINIMAX_API_KEY`, etc.) for LLM completion requests.

### 🛡️ From query classification module (Routing & Safety Layer)
* **Query Classification**: Storing the classified query type (`type: 'general' | 'personal'`) on each query document in the database, which you need as an input parameter for `processCommunityQuestion()`.
* **Moderation Check**: Storing the moderation flag (`isSafe: true/false`) on each query, ensuring you only generate FAQs from safe queries.

### 📋 From the project coordinator (Product & Lifecycle Layer)
* **State Machine Alignment**: Confirmation of the FAQ state transitions (e.g., status moves to `Approved` or `Pending Review` based on your auto-approval score of $\geq 0.70$).
* **Handoff for Manual Review**: The manual dashboard routing rules for FAQs that score $< 0.70$ (flagged as `Pending Review` or `Draft` awaiting admin revision).

### 🧪 From the evaluation team (Testing & Evaluation)
* **Evaluation Dataset**: The official test dataset (40+ queries and 50+ FAQs) to benchmark the generated output quality of your service.

---

## 2. Platform Engineering Dependencies

### 🗄️ From Database Team (the database team)
* **Mongoose Models**: Setup of the MongoDB database connection and registration of schemas:
  1. `FAQ` Collection: `{ question, answer, tags, quality_score, status, type, originalQueryId }`
  2. `Query` Collection: `{ questionText, answers, isGeneric, isSafe, hasFiredFaqGen }`
  3. `Answer` Collection: `{ answerText, upvotes }`

### 💻 From Backend Team (the backend team)
* **Controller Endpoints**: Exposing and routing your service methods to the REST endpoints:
  * `POST /ai/generate-faq`
  * `POST /ai/generate-tags`
  * `POST /ai/review-faq`
* **Trigger hook**: Setting up a trigger/event-listener (e.g., in the Answer upvote controller) to run your `processCommunityQuestion()` code in real-time as soon as a query document accumulates $\geq 2$ upvoted answers.

### 🎨 From Frontend Team (the frontend team)
* **Admin Review Dashboard**: A UI page for admins (Negha/the project coordinator) to:
  * View FAQs flagged for review (score $< 0.70$) along with their warning logs.
  * Manually edit the polished question/answer.
  * Click "Approve" or "Publish" to transition state to `Published`.
* **Answer Page Upvote Click**: The upvote button on the frontend query page must send the vote action to the backend immediately to increment the upvote count and fire the FAQ trigger.

