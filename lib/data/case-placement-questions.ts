export interface PlacementQuestion {
  id: string;
  track_code: string;
  question: string;
  options: { label: string; value: string }[];
  correct_answer: string;
  difficulty: 'basic' | 'intermediate' | 'advanced';
}

export const PLACEMENT_QUESTIONS: PlacementQuestion[] = [
  // ============================================================
  // AI-1: AI Foundations (Principal-Agent framework, basic AI concepts, tools)
  // ============================================================

  // Basic (Week 1)
  {
    id: 'ai1-q1',
    track_code: 'AI-1',
    question:
      'In the Principal-Agent framework for AI, who is the "principal"?',
    options: [
      { label: 'The AI model that generates responses', value: 'A' },
      { label: 'The human who defines goals and delegates tasks to the AI', value: 'B' },
      { label: 'The software engineer who built the AI', value: 'C' },
      { label: 'The training dataset used to train the model', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'basic',
  },
  {
    id: 'ai1-q2',
    track_code: 'AI-1',
    question:
      'Which of the following best describes what a Large Language Model (LLM) does?',
    options: [
      { label: 'Stores and retrieves facts from a database', value: 'A' },
      { label: 'Predicts the next most likely token in a sequence based on patterns learned from text', value: 'B' },
      { label: 'Executes pre-written rules to answer questions', value: 'C' },
      { label: 'Searches the internet in real time for every query', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'basic',
  },
  {
    id: 'ai1-q3',
    track_code: 'AI-1',
    question:
      'What is a "hallucination" in the context of AI language models?',
    options: [
      { label: 'When the AI generates an image instead of text', value: 'A' },
      { label: 'When the AI produces confident-sounding but factually incorrect information', value: 'B' },
      { label: 'When the AI refuses to answer a question', value: 'C' },
      { label: 'When the AI repeats the same sentence in a loop', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'basic',
  },

  // Intermediate (Week 2)
  {
    id: 'ai1-q4',
    track_code: 'AI-1',
    question:
      'What is the primary purpose of a "system prompt" when working with an AI assistant?',
    options: [
      { label: 'To provide the AI with its training data', value: 'A' },
      { label: 'To set the AI\'s role, behavior constraints, and context before a conversation', value: 'B' },
      { label: 'To update the AI\'s model weights in real time', value: 'C' },
      { label: 'To encrypt the conversation for security', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'intermediate',
  },
  {
    id: 'ai1-q5',
    track_code: 'AI-1',
    question:
      'Which AI tool category is most appropriate for generating a summary of a 50-page research paper?',
    options: [
      { label: 'Image generation tool (e.g., DALL-E)', value: 'A' },
      { label: 'Code interpreter tool (e.g., Jupyter AI)', value: 'B' },
      { label: 'Text generation and summarization tool (e.g., ChatGPT, Claude)', value: 'C' },
      { label: 'Speech-to-text transcription tool (e.g., Whisper)', value: 'D' },
    ],
    correct_answer: 'C',
    difficulty: 'intermediate',
  },
  {
    id: 'ai1-q6',
    track_code: 'AI-1',
    question:
      'In the Principal-Agent framework, what is "alignment" primarily concerned with?',
    options: [
      { label: 'Making the AI run faster on hardware', value: 'A' },
      { label: 'Ensuring the AI agent\'s actions match the principal\'s intended goals', value: 'B' },
      { label: 'Formatting the AI\'s output in a specific style', value: 'C' },
      { label: 'Training the AI on more data to improve accuracy', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'intermediate',
  },
  {
    id: 'ai1-q7',
    track_code: 'AI-1',
    question:
      'What does the "temperature" parameter control in AI text generation?',
    options: [
      { label: 'The speed at which the model generates tokens', value: 'A' },
      { label: 'The randomness and creativity of the output — higher values produce more varied responses', value: 'B' },
      { label: 'The maximum length of the generated response', value: 'C' },
      { label: 'The number of sources the model references', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'intermediate',
  },

  // Advanced (Week 3)
  {
    id: 'ai1-q8',
    track_code: 'AI-1',
    question:
      'A student uses ChatGPT to draft a college essay and submits it as their own work. From a Principal-Agent framework perspective, what is the core issue?',
    options: [
      { label: 'The AI was not aligned properly', value: 'A' },
      { label: 'The student failed their responsibility as the principal to verify, edit, and take ownership of the agent\'s output', value: 'B' },
      { label: 'The AI hallucinated the entire essay', value: 'C' },
      { label: 'The temperature setting was too high', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'advanced',
  },
  {
    id: 'ai1-q9',
    track_code: 'AI-1',
    question:
      'Which combination of AI tools would be most effective for a student preparing a research presentation on climate change?',
    options: [
      { label: 'Use only an image generator to create all slides', value: 'A' },
      { label: 'Use a text LLM for research synthesis, a citation tool for source verification, and a presentation AI for slide design', value: 'B' },
      { label: 'Use a single chatbot for everything including citations', value: 'C' },
      { label: 'Use a code interpreter to analyze climate data only', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'advanced',
  },
  {
    id: 'ai1-q10',
    track_code: 'AI-1',
    question:
      'Why is it important to understand that LLMs have a "knowledge cutoff date"?',
    options: [
      { label: 'Because older models are always less accurate', value: 'A' },
      { label: 'Because the model may present outdated information as current fact, requiring the principal to verify recency-sensitive claims', value: 'B' },
      { label: 'Because the model stops working after that date', value: 'C' },
      { label: 'Because it determines the language the model can understand', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'advanced',
  },

  // ============================================================
  // AI-2: AI Application (real-world AI use cases, prompt engineering, data analysis)
  // ============================================================

  // Basic (Week 1)
  {
    id: 'ai2-q1',
    track_code: 'AI-2',
    question:
      'Which of the following is an example of using AI for data analysis?',
    options: [
      { label: 'Asking an AI to write a poem', value: 'A' },
      { label: 'Uploading a spreadsheet to an AI tool and asking it to identify trends and outliers', value: 'B' },
      { label: 'Using AI to generate a profile picture', value: 'C' },
      { label: 'Asking AI to translate a sentence to French', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'basic',
  },
  {
    id: 'ai2-q2',
    track_code: 'AI-2',
    question:
      'What is "prompt engineering"?',
    options: [
      { label: 'Writing code to build an AI model from scratch', value: 'A' },
      { label: 'The practice of crafting effective instructions to get better, more relevant responses from AI', value: 'B' },
      { label: 'Designing the hardware that runs AI models', value: 'C' },
      { label: 'Training an AI model on new data', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'basic',
  },
  {
    id: 'ai2-q3',
    track_code: 'AI-2',
    question:
      'Which real-world scenario is a practical application of AI in education?',
    options: [
      { label: 'Replacing all teachers with AI chatbots', value: 'A' },
      { label: 'Using AI to generate personalized study plans based on a student\'s strengths and weaknesses', value: 'B' },
      { label: 'Having AI take exams on behalf of students', value: 'C' },
      { label: 'Using AI to automatically assign grades without review', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'basic',
  },

  // Intermediate (Week 2)
  {
    id: 'ai2-q4',
    track_code: 'AI-2',
    question:
      'Which prompt engineering technique involves providing the AI with examples of desired input-output pairs before asking the actual question?',
    options: [
      { label: 'Zero-shot prompting', value: 'A' },
      { label: 'Chain-of-thought prompting', value: 'B' },
      { label: 'Few-shot prompting', value: 'C' },
      { label: 'Retrieval-augmented generation', value: 'D' },
    ],
    correct_answer: 'C',
    difficulty: 'intermediate',
  },
  {
    id: 'ai2-q5',
    track_code: 'AI-2',
    question:
      'You need AI to analyze customer feedback data and categorize sentiments. Which approach yields the most reliable results?',
    options: [
      { label: 'Ask the AI: "Analyze this data"', value: 'A' },
      { label: 'Provide specific categories (positive, negative, neutral, mixed), define each category, give examples, then ask it to classify each entry', value: 'B' },
      { label: 'Upload the data and let the AI decide what to do', value: 'C' },
      { label: 'Ask the AI to rewrite the feedback in a better tone', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'intermediate',
  },
  {
    id: 'ai2-q6',
    track_code: 'AI-2',
    question:
      'What is "chain-of-thought" prompting?',
    options: [
      { label: 'Asking multiple unrelated questions in sequence', value: 'A' },
      { label: 'Instructing the AI to break down its reasoning step-by-step before arriving at an answer', value: 'B' },
      { label: 'Chaining multiple AI models together', value: 'C' },
      { label: 'Asking the AI to cite its sources in a chain', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'intermediate',
  },
  {
    id: 'ai2-q7',
    track_code: 'AI-2',
    question:
      'When using AI for data analysis, why is it important to clean and structure your data before uploading it?',
    options: [
      { label: 'AI cannot read any unstructured data at all', value: 'A' },
      { label: 'Clean, structured data reduces misinterpretation and produces more accurate and actionable insights', value: 'B' },
      { label: 'It makes the AI process data faster but has no effect on quality', value: 'C' },
      { label: 'The AI will refuse to analyze messy data', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'intermediate',
  },

  // Advanced (Week 3)
  {
    id: 'ai2-q8',
    track_code: 'AI-2',
    question:
      'A marketing team wants to use AI to predict which customer segments are most likely to churn. Which combination of techniques is most appropriate?',
    options: [
      { label: 'Use a text-only chatbot to guess based on company name', value: 'A' },
      { label: 'Upload structured customer data to an AI with code execution capabilities, engineer prompts to perform cohort analysis, and validate predictions against historical outcomes', value: 'B' },
      { label: 'Ask the AI to generate a churn prediction report without any data', value: 'C' },
      { label: 'Use image recognition AI to analyze customer photos', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'advanced',
  },
  {
    id: 'ai2-q9',
    track_code: 'AI-2',
    question:
      'You are designing a prompt to extract structured JSON data from unstructured meeting notes. Which strategy is most effective?',
    options: [
      { label: 'Say "Convert to JSON" and hope for the best', value: 'A' },
      { label: 'Define the exact JSON schema with field names and types, provide an example output, specify edge cases (e.g., missing attendees), and set a fallback value convention', value: 'B' },
      { label: 'Ask the AI to summarize the meeting first, then manually create JSON', value: 'C' },
      { label: 'Use a different AI model that specializes in JSON', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'advanced',
  },
  {
    id: 'ai2-q10',
    track_code: 'AI-2',
    question:
      'When iterating on a complex prompt that is not producing desired results, what is the most systematic improvement approach?',
    options: [
      { label: 'Rewrite the entire prompt from scratch each time', value: 'A' },
      { label: 'Change one variable at a time (e.g., role, constraints, examples), test each change against a consistent evaluation set, and document what improves or degrades performance', value: 'B' },
      { label: 'Make the prompt longer by adding more instructions', value: 'C' },
      { label: 'Switch to a different AI model', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'advanced',
  },

  // ============================================================
  // AI-3: AI Mastery (advanced prompts, autonomous agents, RAG, fine-tuning)
  // ============================================================

  // Basic (Week 1)
  {
    id: 'ai3-q1',
    track_code: 'AI-3',
    question:
      'What is Retrieval-Augmented Generation (RAG)?',
    options: [
      { label: 'A technique to make AI models generate longer responses', value: 'A' },
      { label: 'A method that enhances AI responses by retrieving relevant documents from an external knowledge base before generating an answer', value: 'B' },
      { label: 'A way to train AI models on new data in real time', value: 'C' },
      { label: 'A process of converting text to images using AI', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'basic',
  },
  {
    id: 'ai3-q2',
    track_code: 'AI-3',
    question:
      'What is an "autonomous AI agent"?',
    options: [
      { label: 'An AI that can only respond to direct questions', value: 'A' },
      { label: 'An AI system that can independently plan, execute multi-step tasks, use tools, and make decisions to achieve a goal', value: 'B' },
      { label: 'An AI that operates without any internet connection', value: 'C' },
      { label: 'A chatbot with a custom avatar', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'basic',
  },
  {
    id: 'ai3-q3',
    track_code: 'AI-3',
    question:
      'What does "fine-tuning" an AI model mean?',
    options: [
      { label: 'Adjusting the font size of AI-generated text', value: 'A' },
      { label: 'Further training a pre-trained model on a specific dataset to specialize its behavior for a particular domain or task', value: 'B' },
      { label: 'Deleting unnecessary features from the AI', value: 'C' },
      { label: 'Running the AI on faster hardware', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'basic',
  },

  // Intermediate (Week 2)
  {
    id: 'ai3-q4',
    track_code: 'AI-3',
    question:
      'In a RAG pipeline, what is the role of "embeddings"?',
    options: [
      { label: 'They are the final generated text responses', value: 'A' },
      { label: 'They are numerical vector representations of text that enable semantic similarity search to find relevant documents', value: 'B' },
      { label: 'They are the prompts sent to the language model', value: 'C' },
      { label: 'They are the user interface components of the application', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'intermediate',
  },
  {
    id: 'ai3-q5',
    track_code: 'AI-3',
    question:
      'Which of the following is a key challenge when building autonomous AI agents?',
    options: [
      { label: 'Making the agent respond in multiple languages', value: 'A' },
      { label: 'Preventing cascading errors where one wrong step leads the agent further off course in subsequent steps', value: 'B' },
      { label: 'Choosing the right color scheme for the agent\'s interface', value: 'C' },
      { label: 'Making the agent work without any API calls', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'intermediate',
  },
  {
    id: 'ai3-q6',
    track_code: 'AI-3',
    question:
      'What is "tool use" (function calling) in the context of AI agents?',
    options: [
      { label: 'The AI physically manipulating tools in a factory', value: 'A' },
      { label: 'The ability of an AI to invoke external APIs, databases, calculators, or code execution to perform actions beyond text generation', value: 'B' },
      { label: 'Using multiple AI models at the same time', value: 'C' },
      { label: 'A debugging technique for AI engineers', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'intermediate',
  },
  {
    id: 'ai3-q7',
    track_code: 'AI-3',
    question:
      'When would you choose RAG over fine-tuning for a domain-specific application?',
    options: [
      { label: 'When you need to change the model\'s fundamental behavior and tone', value: 'A' },
      { label: 'When your knowledge base updates frequently and you need the AI to always reference the latest information without retraining', value: 'B' },
      { label: 'When you have unlimited compute budget', value: 'C' },
      { label: 'When you want the model to forget its general knowledge', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'intermediate',
  },

  // Advanced (Week 3)
  {
    id: 'ai3-q8',
    track_code: 'AI-3',
    question:
      'You are designing a multi-agent system where one agent researches, another writes, and a third reviews. What architectural pattern best manages coordination between these agents?',
    options: [
      { label: 'Run all three agents simultaneously and merge outputs', value: 'A' },
      { label: 'Use an orchestrator agent that manages workflow sequencing, passes context between agents, handles error recovery, and validates outputs at each stage', value: 'B' },
      { label: 'Let each agent work independently and pick the best result', value: 'C' },
      { label: 'Use a single agent with three different prompts', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'advanced',
  },
  {
    id: 'ai3-q9',
    track_code: 'AI-3',
    question:
      'What is "chunking strategy" in RAG, and why does it matter?',
    options: [
      { label: 'It refers to how fast documents are processed', value: 'A' },
      { label: 'It is how documents are split into segments for embedding — chunk size and overlap affect retrieval precision, context completeness, and answer quality', value: 'B' },
      { label: 'It is the method of compressing AI model sizes', value: 'C' },
      { label: 'It determines the number of API calls made per query', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'advanced',
  },
  {
    id: 'ai3-q10',
    track_code: 'AI-3',
    question:
      'When fine-tuning a model for a specific enterprise use case, what is the most critical risk to mitigate?',
    options: [
      { label: 'The model becoming too fast at generating responses', value: 'A' },
      { label: 'Catastrophic forgetting — where the model loses general capabilities it had before fine-tuning, while also potentially overfitting to narrow training examples', value: 'B' },
      { label: 'The fine-tuned model using too much storage space', value: 'C' },
      { label: 'The training process taking too long', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'advanced',
  },

  // ============================================================
  // AI-4: AI Innovation (AI-first product design, ethical AI, AI governance)
  // ============================================================

  // Basic (Week 1)
  {
    id: 'ai4-q1',
    track_code: 'AI-4',
    question:
      'What does "AI-first product design" mean?',
    options: [
      { label: 'Adding AI features to an existing product as an afterthought', value: 'A' },
      { label: 'Designing a product where AI capabilities are a core part of the value proposition and user experience from the ground up', value: 'B' },
      { label: 'Using AI to design the product\'s logo and branding', value: 'C' },
      { label: 'Building a product that only AI can use', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'basic',
  },
  {
    id: 'ai4-q2',
    track_code: 'AI-4',
    question:
      'What is "AI bias"?',
    options: [
      { label: 'When an AI model prefers one programming language over another', value: 'A' },
      { label: 'Systematic patterns in AI outputs that unfairly favor or disadvantage certain groups, often reflecting biases present in training data', value: 'B' },
      { label: 'When an AI runs slower for certain users', value: 'C' },
      { label: 'The tendency of AI to give positive responses', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'basic',
  },
  {
    id: 'ai4-q3',
    track_code: 'AI-4',
    question:
      'What is "AI governance"?',
    options: [
      { label: 'The government department that builds AI', value: 'A' },
      { label: 'The set of policies, frameworks, and oversight mechanisms that guide the responsible development, deployment, and use of AI systems', value: 'B' },
      { label: 'A type of AI that governs other AI systems', value: 'C' },
      { label: 'The process of shutting down AI systems', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'basic',
  },

  // Intermediate (Week 2)
  {
    id: 'ai4-q4',
    track_code: 'AI-4',
    question:
      'When designing an AI-first product, what is a "human-in-the-loop" system?',
    options: [
      { label: 'A system where humans do all the work and AI is not used', value: 'A' },
      { label: 'A design where AI handles routine decisions but routes uncertain, high-stakes, or edge cases to human reviewers for approval', value: 'B' },
      { label: 'A system where humans train the AI by playing games', value: 'C' },
      { label: 'A feedback form that users fill out after using AI', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'intermediate',
  },
  {
    id: 'ai4-q5',
    track_code: 'AI-4',
    question:
      'Which ethical principle requires that users should be able to understand why an AI system made a particular decision?',
    options: [
      { label: 'Scalability', value: 'A' },
      { label: 'Transparency and explainability', value: 'B' },
      { label: 'Efficiency', value: 'C' },
      { label: 'Automation', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'intermediate',
  },
  {
    id: 'ai4-q6',
    track_code: 'AI-4',
    question:
      'What is the "EU AI Act" primarily designed to regulate?',
    options: [
      { label: 'The pricing of AI products in Europe', value: 'A' },
      { label: 'The classification and governance of AI systems by risk level, imposing stricter requirements on high-risk applications', value: 'B' },
      { label: 'Which companies are allowed to build AI', value: 'C' },
      { label: 'The speed at which AI models can be trained', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'intermediate',
  },
  {
    id: 'ai4-q7',
    track_code: 'AI-4',
    question:
      'In AI product design, what is a "feedback loop" and why can it be dangerous?',
    options: [
      { label: 'It is when users provide star ratings for AI responses', value: 'A' },
      { label: 'It is when an AI system\'s outputs influence its future inputs, potentially amplifying biases or errors over time if not carefully monitored', value: 'B' },
      { label: 'It is a feature that lets users undo AI actions', value: 'C' },
      { label: 'It is the loop in the code that runs the AI model', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'intermediate',
  },

  // Advanced (Week 3)
  {
    id: 'ai4-q8',
    track_code: 'AI-4',
    question:
      'A healthcare startup wants to build an AI-first diagnostic tool. Which combination of governance measures is most critical before deployment?',
    options: [
      { label: 'Fast deployment to get first-mover advantage, with governance added later', value: 'A' },
      { label: 'Clinical validation studies, regulatory compliance (e.g., FDA/CE marking), algorithmic bias audits across demographic groups, clear liability frameworks, and mandatory human physician oversight for final diagnoses', value: 'B' },
      { label: 'User satisfaction surveys and A/B testing', value: 'C' },
      { label: 'Open-sourcing the model for community review', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'advanced',
  },
  {
    id: 'ai4-q9',
    track_code: 'AI-4',
    question:
      'What is "responsible AI by design" and how does it differ from "responsible AI as compliance"?',
    options: [
      { label: 'They are the same thing with different names', value: 'A' },
      { label: '"By design" integrates ethical considerations, fairness testing, and safety guardrails into every stage of product development, while "as compliance" treats ethics as a checkbox exercise after the product is built', value: 'B' },
      { label: '"By design" means building AI without any constraints', value: 'C' },
      { label: '"As compliance" is always the better approach for speed', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'advanced',
  },
  {
    id: 'ai4-q10',
    track_code: 'AI-4',
    question:
      'When building an AI product for a global market, what is the most comprehensive approach to handling cultural and regional differences?',
    options: [
      { label: 'Build one model and deploy it everywhere identically', value: 'A' },
      { label: 'Design a modular system with configurable cultural norms, regional regulatory compliance layers, localized training data, and region-specific bias testing — while maintaining core ethical standards globally', value: 'B' },
      { label: 'Only deploy in markets with no AI regulation', value: 'C' },
      { label: 'Let users customize the AI\'s behavior however they want', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'advanced',
  },

  // ============================================================
  // H-1: Communication Excellence (professional communication, presentation, writing)
  // ============================================================

  // Basic (Week 1)
  {
    id: 'h1-q1',
    track_code: 'H-1',
    question:
      'What is the primary purpose of professional communication in a workplace?',
    options: [
      { label: 'To use complex vocabulary to impress colleagues', value: 'A' },
      { label: 'To clearly and effectively convey information, ideas, or requests to achieve a shared understanding and desired outcome', value: 'B' },
      { label: 'To write the longest possible emails', value: 'C' },
      { label: 'To avoid all forms of informal interaction', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'basic',
  },
  {
    id: 'h1-q2',
    track_code: 'H-1',
    question:
      'Which of the following is the most effective email subject line for a professional request?',
    options: [
      { label: 'Hi', value: 'A' },
      { label: 'Request: Budget Approval for Q3 Marketing Campaign by March 15', value: 'B' },
      { label: 'URGENT PLEASE READ!!!', value: 'C' },
      { label: 'Some stuff I need', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'basic',
  },
  {
    id: 'h1-q3',
    track_code: 'H-1',
    question:
      'What does "active listening" mean in professional communication?',
    options: [
      { label: 'Listening while multitasking on your phone', value: 'A' },
      { label: 'Fully concentrating on the speaker, understanding their message, responding thoughtfully, and asking clarifying questions', value: 'B' },
      { label: 'Waiting for your turn to speak without paying attention', value: 'C' },
      { label: 'Recording every meeting for later review', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'basic',
  },

  // Intermediate (Week 2)
  {
    id: 'h1-q4',
    track_code: 'H-1',
    question:
      'When structuring a professional presentation, what is the most effective framework for a persuasive pitch?',
    options: [
      { label: 'Start with the conclusion, then provide random supporting points', value: 'A' },
      { label: 'Hook the audience with a compelling problem, present data-backed evidence, propose a clear solution, and end with a specific call to action', value: 'B' },
      { label: 'Read directly from slides filled with dense text', value: 'C' },
      { label: 'Start with your personal background and qualifications', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'intermediate',
  },
  {
    id: 'h1-q5',
    track_code: 'H-1',
    question:
      'A colleague sends a confrontational email criticizing your project. What is the most professional response approach?',
    options: [
      { label: 'Reply immediately with an equally strong rebuttal', value: 'A' },
      { label: 'Pause before responding, acknowledge their concerns factually, address specific points with evidence, and suggest a productive path forward — optionally moving the discussion to a call', value: 'B' },
      { label: 'Forward the email to your manager to handle', value: 'C' },
      { label: 'Ignore the email completely', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'intermediate',
  },
  {
    id: 'h1-q6',
    track_code: 'H-1',
    question:
      'What is the "Pyramid Principle" in business writing?',
    options: [
      { label: 'Writing in a triangular shape on the page', value: 'A' },
      { label: 'Starting with the key conclusion or recommendation first, then supporting it with grouped arguments and detailed evidence — enabling busy readers to grasp the main point immediately', value: 'B' },
      { label: 'Building up to the main point at the very end', value: 'C' },
      { label: 'Using exactly three points in every paragraph', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'intermediate',
  },
  {
    id: 'h1-q7',
    track_code: 'H-1',
    question:
      'When presenting data in a professional setting, which approach is most effective?',
    options: [
      { label: 'Show as many charts as possible to appear thorough', value: 'A' },
      { label: 'Select the most relevant data points, use clear visualizations, explain what the data means (not just what it shows), and connect insights to the audience\'s priorities', value: 'B' },
      { label: 'Read numbers directly from a spreadsheet', value: 'C' },
      { label: 'Use only text descriptions without any visual aids', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'intermediate',
  },

  // Advanced (Week 3)
  {
    id: 'h1-q8',
    track_code: 'H-1',
    question:
      'You need to present a project failure to senior stakeholders. What is the most effective communication strategy?',
    options: [
      { label: 'Minimize the failure and focus on unrelated successes', value: 'A' },
      { label: 'Own the outcome transparently, present a root cause analysis, outline specific corrective actions with timelines, share lessons learned, and demonstrate how the experience strengthens future execution', value: 'B' },
      { label: 'Blame external factors and team members', value: 'C' },
      { label: 'Cancel the presentation and send a brief email instead', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'advanced',
  },
  {
    id: 'h1-q9',
    track_code: 'H-1',
    question:
      'When writing a proposal for a cross-functional audience (technical engineers, business leaders, and end users), how should you adapt your communication?',
    options: [
      { label: 'Write in highly technical language since engineers are the most important audience', value: 'A' },
      { label: 'Create a layered document: executive summary for leaders, technical architecture section for engineers, user impact section for end users — each in appropriate language with clear navigation between sections', value: 'B' },
      { label: 'Use the simplest possible language throughout to avoid confusion', value: 'C' },
      { label: 'Write separate documents for each audience', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'advanced',
  },
  {
    id: 'h1-q10',
    track_code: 'H-1',
    question:
      'What distinguishes excellent professional writing from merely competent writing?',
    options: [
      { label: 'Using more adjectives and longer sentences', value: 'A' },
      { label: 'Clarity of thought expressed through precise word choice, logical structure, awareness of the reader\'s context and needs, and the ability to make complex ideas accessible without oversimplifying', value: 'B' },
      { label: 'Perfect grammar with no stylistic variation', value: 'C' },
      { label: 'Including as many industry buzzwords as possible', value: 'D' },
    ],
    correct_answer: 'B',
    difficulty: 'advanced',
  },
];

/**
 * Returns all placement questions for a specific CASE track.
 * @param trackCode - The track code (e.g., 'AI-1', 'AI-2', 'AI-3', 'AI-4', 'H-1')
 */
export function getQuestionsForTrack(trackCode: string): PlacementQuestion[] {
  return PLACEMENT_QUESTIONS.filter((q) => q.track_code === trackCode);
}
