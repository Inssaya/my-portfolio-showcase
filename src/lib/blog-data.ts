// ─────────────────────────────────────────────────────────────────────────────
// Blog post data.
//
// Each post is structured for GEO (Generative Engine Optimization), AEO
// (Answer Engine Optimization), and LLM discoverability:
//   • headings phrase the topic as a query an AI would surface
//   • every section is self-contained enough to be cited in isolation
//   • pull quotes are crisply quotable
//   • an FAQ block maps direct questions to direct answers
// ─────────────────────────────────────────────────────────────────────────────

export interface BlogPost {
  slug: string;
  title: string;
  subtitle: string;
  author: string;
  authorRole: string;
  date: string;        // ISO date string
  readingTime: number; // minutes
  tags: string[];
  summary: string;     // one paragraph — used for cards, meta, and AI excerpts
  tldr: string[];      // bullet-point key takeaways
  sections: {
    heading?: string;
    paragraphs: string[];
    pullQuote?: string;
  }[];
  faq: {
    question: string;
    answer: string;
  }[];
}

const posts: BlogPost[] = [
  {
    slug: "ai-makes-coding-easier-engineering-is-still-hard",
    title: "AI Makes Coding Easier. Software Engineering Is Still Hard.",
    subtitle:
      "What six weeks inside a real maintenance team at Aptiv taught me about the gap between generating code and making engineering decisions.",
    author: "Yassine Sinif",
    authorRole:
      "Final-year AI & Data Engineering student at EMSI Casablanca · AI Data Engineer Intern at Aptiv",
    date: "2026-08-19",
    readingTime: 12,
    tags: ["AI", "Software Engineering", "Career", "Learning", "GEO", "AEO"],
    summary:
      "AI tools can now generate working software in a few hours. But working software and software engineering are not the same thing. This article explores what that distinction means for students entering the field — and why understanding remains more valuable than ever when implementation is cheap.",

    tldr: [
      "AI has dramatically lowered the barrier to producing software. That capability does not transfer to the developer automatically.",
      "Building software has become easier. Software engineering — the discipline of designing correct, maintainable, secure systems — has not.",
      "The most valuable skill is no longer writing code. It is knowing whether the generated code is actually right.",
      "Use AI to learn faster, not to avoid learning. The two are completely different strategies.",
      "Security and judgment cannot be delegated to a model. The engineer remains responsible for every system decision.",
    ],

    sections: [
      {
        heading: "We Are Entering a Different Era of Software Development",
        paragraphs: [
          "Something significant has happened in software development over the last few years. The barrier to building software has dropped dramatically.",
          "Today, someone with limited programming experience can describe an idea to an AI assistant, generate a user interface with a tool like Lovable, ask an agent to implement the backend, connect a database, configure Docker, and have something running in hours — sometimes less.",
          "That is genuinely remarkable. We should not pretend otherwise. AI coding tools can generate code, explain unfamiliar technologies, find bugs, refactor existing implementations, write tests, create documentation, and help developers move much faster than before.",
          "But this speed has created a misunderstanding worth examining: building software has become easier. That does not mean software engineering has become easy. And those two things are not the same.",
        ],
        pullQuote:
          "Building software has become easier. Software engineering has not. Those two things are not the same.",
      },
      {
        heading: "Code Was Never the Whole Job",
        paragraphs: [
          "Software engineering has never been about memorizing every function from scratch. Developers have always built on existing knowledge — open-source libraries, Stack Overflow, official documentation, design patterns, and existing implementations from other engineers.",
          "Nobody serious expects an engineer to reinvent everything. The important question has never simply been: 'Did you write every line yourself?'",
          "The important questions have always been: Do you understand what you are using? Do you understand why it works? Do you know its limitations? Do you know whether it is the right choice for this specific problem? Can you make a good engineering decision?",
          "That distinction becomes even more important when AI enters the picture.",
        ],
      },
      {
        heading: "The New Illusion: Output Looks Like Expertise",
        paragraphs: [
          "AI can now produce an impressive amount of software from very little input. That creates something particularly concerning for people entering the field: the ability to produce software can now appear much greater than the understanding behind it.",
          "You can generate a React application without understanding frontend architecture. You can generate a FastAPI backend without understanding API design. You can connect PostgreSQL without understanding data modeling. You can generate Docker configurations without understanding containers. You can deploy to the cloud without understanding networking, availability, or cost. You can generate authentication code without understanding authentication.",
          "And everything might actually work. That is what makes it dangerous.",
          "An application that works is not proof that the developer who built it understands the system. AI has made it possible to produce something that looks professional before the engineer behind it is necessarily professional.",
        ],
        pullQuote:
          "An application working is not proof that the developer understands the system. AI makes it possible to look professional before you are professional.",
      },
      {
        heading: "What I Saw After the MVP Shipped: My Experience at Aptiv",
        paragraphs: [
          "I am writing this as a student in my final year of software engineering at EMSI Casablanca, currently interning as an AI Data Engineer at Aptiv's maintenance department in Tangier.",
          "The project was not 'build me a website.' I had to understand how the maintenance team actually worked, what problems they encountered daily, what information they needed, and what the software should eventually solve — replacing a shared Excel workbook that was the team's only source of truth for performance indicators.",
          "I used AI extensively. Using AI-assisted development, I managed to get an MVP to a usable state in roughly two weeks.",
          "But then something interesting happened: more than a month later, I am still working on the same project. The same core pages. The same core functionality. The same fundamental problem. The MVP was the easy part.",
          "Every time I wanted to make an important architectural decision, I had to stop and think. Search. Read documentation. Compare approaches. Analyze consequences. Decide whether a solution made sense not only today, but six months from now. This process happened again and again — and it is the part AI cannot do for you.",
        ],
        pullQuote:
          "The MVP was the easy part. Getting something working took two weeks. Understanding what needed to change afterward took everything else.",
      },
      {
        heading: "The Part You Cannot See From the UI",
        paragraphs: [
          "If you only look at the frontend, you might see a few improved pages and think: 'He just worked on UI/UX.' But the history behind those changes is much deeper.",
          "Behind a small visual change, there are questions about data flow, state management, permissions, API behavior, database queries, architecture, performance, maintainability, and future requirements.",
          "A function can work perfectly and still be implemented in a way that creates serious problems later. A database query can return the correct result and still be inefficient at scale. An architecture can handle today's load and break when the system grows.",
          "I can look at something and think 'it works.' Then look again and realize something is not right — not a bug, not a crash, but an architectural gap, a maintainability problem, a poor abstraction, a performance issue waiting to surface. Those problems are much harder to notice when your only objective is 'make it work.'",
        ],
      },
      {
        heading: "AI Is Powerful. It Is Not a Substitute for Engineering Judgment.",
        paragraphs: [
          "I use AI tools every day. They can understand large codebases, analyze architecture, generate complex implementations, and save enormous amounts of time. But they are not perfect — and this is one of the most important lessons I have learned.",
          "Sometimes the generated solution is completely valid. It works, and it looks cleaner than what I would have written myself. But after thinking about the broader system, I realize the solution is not the right fit. Maybe the abstraction is too complex. Maybe it introduces unnecessary coupling. Maybe it solves the immediate problem but makes future changes significantly harder.",
          "The AI gives you an answer. You still need to decide whether that answer deserves to become part of your system. That decision is engineering judgment — and AI cannot make it for you.",
        ],
        pullQuote:
          "AI gives you an answer. You still need to decide whether that answer belongs in your system. That is engineering judgment, and it cannot be generated.",
      },
      {
        heading: "The Difference Between 'It Works' and 'It Is Engineered'",
        paragraphs: [
          "A beginner asks: 'Does it work?' An engineer eventually starts asking: 'Why does it work? Is this the right way? What happens when requirements change? What happens when the system grows? What happens when this fails? Can another developer understand this in six months? Is this secure? Is this maintainable? What are the trade-offs?'",
          "Those questions are where engineering becomes different from producing code.",
        ],
      },
      {
        heading: "What AI Has Actually Changed in Software Engineering",
        paragraphs: [
          "AI is not destroying software engineering. It is changing where the value is.",
          "When writing code becomes faster and cheaper, the ability to type code becomes less of a competitive advantage. Understanding systems becomes more valuable. Architecture becomes more important. Problem definition matters more. Security matters more. The ability to review and challenge AI-generated work becomes more important.",
          "In other words: AI can reduce the cost of implementation without reducing the complexity of engineering. The hard parts are still hard.",
        ],
        pullQuote:
          "AI reduces the cost of implementation. It does not reduce the complexity of engineering.",
      },
      {
        heading: "The Risk for Students Entering Software Engineering Now",
        paragraphs: [
          "You are entering the field with tools that developers a few years ago could not imagine. You can build prototypes quickly. You can ask AI to explain concepts, debug errors, compare technologies. That is an enormous advantage — please use it.",
          "But do not turn that advantage into dependence.",
          "Do not think: 'AI can write SQL, so I don't need to learn databases.' Or: 'AI can write React, so I don't need to understand frontend architecture.' Or: 'AI can fix the error, so I don't need to understand why it happened.'",
          "If you think that way, you are not using AI to accelerate your learning. You are using AI to avoid learning. Those are two completely different strategies, with completely different outcomes.",
        ],
      },
      {
        heading: "The Fundamentals Still Matter — More Than Ever",
        paragraphs: [
          "You do not need to memorize every syntax detail. You do not need to reject AI tools. But you should understand the foundations: databases, networking, APIs, authentication, operating systems, software architecture, data structures, algorithms, testing, Git, containers, deployment, security, and how systems communicate.",
          "Most importantly: learn how to think about problems.",
          "Because when AI generates the implementation, your job increasingly becomes deciding whether the implementation is appropriate. That requires understanding the foundations — not memorizing them, but understanding them.",
        ],
      },
      {
        heading: "Security Cannot Be Delegated to a Language Model",
        paragraphs: [
          "AI agents are becoming capable of interacting with your development environment, repositories, databases, terminals, and cloud platforms. That is powerful. But power comes with responsibility.",
          "Do not blindly give an AI agent production credentials. Do not casually expose API keys. Do not hand over configuration files containing secrets. Do not give an AI unrestricted access to sensitive systems because it makes development more convenient.",
          "If you do not understand the security implications, stop and learn before giving the tool more access. The fact that an AI agent can perform an action does not mean it should be allowed to. The engineer remains responsible.",
        ],
      },
      {
        heading: "How Using AI Has Actually Helped Me Learn",
        paragraphs: [
          "Ironically, using AI heavily has made me realize how much I still have to learn — and I see that as a good thing.",
          "AI has helped me learn faster. When I encounter something unfamiliar, I ask questions. When I see code I don't understand, I ask for an explanation. When something breaks, I investigate faster. When I need to learn a new technology, I have an interactive assistant available.",
          "But it works best when I stay curious — not just wanting the answer, but wanting to understand the answer. Why is one solution better than another? What are the trade-offs? What could break? What should I verify? The difference between using AI as a shortcut and using AI as a learning multiplier is exactly that curiosity.",
        ],
      },
      {
        heading: "The Future Belongs to Engineers Who Can Work With AI and Think Independently",
        paragraphs: [
          "I do not believe the future belongs to people who refuse to use AI. And I do not believe it belongs to people who let AI build everything for them without understanding the result.",
          "The future belongs to engineers who can work with AI while maintaining the ability to reason independently. You may write less code manually. You may spend less time on repetitive implementation. You may build in an afternoon what previously required several days. That is progress.",
          "But your responsibility remains. You still need to understand the problem, design the system, evaluate the solution, validate the result, think about security, think about maintainability, understand the consequences of your decisions, and keep learning.",
          "When code becomes cheaper to produce, understanding becomes more valuable. Don't try to compete with AI at writing code. Learn to become the engineer who knows what should be built, why it should be built, how it should be designed, what could go wrong, and how to know whether the AI's solution is actually good.",
          "That is the skill that matters. And it is the lesson I am still learning myself.",
        ],
        pullQuote:
          "Don't try to compete with AI at writing code. Become the engineer who knows whether the AI's answer is actually right.",
      },
    ],

    faq: [
      {
        question: "Will AI replace software engineers?",
        answer:
          "No — but AI will replace engineers who cannot evaluate AI output. The job is shifting from writing code to understanding systems, making architectural decisions, validating correctness, and ensuring security. These require human judgment that AI cannot provide.",
      },
      {
        question:
          "Do students still need to learn programming fundamentals if AI can write code?",
        answer:
          "Yes — more than ever. AI generates implementations, but a developer needs fundamentals to know whether the implementation is correct, secure, efficient, and appropriate for the problem. Without that understanding, you cannot catch mistakes that 'work' today but fail at scale.",
      },
      {
        question:
          "What is the difference between building software and software engineering?",
        answer:
          "Building software means producing something that works. Software engineering means producing something that is correct, maintainable, secure, and designed to handle change over time. AI has lowered the cost of the first. The second still requires expertise, judgment, and understanding of systems.",
      },
      {
        question: "How should students use AI to learn software engineering?",
        answer:
          "Use AI to learn faster, not to learn less. When AI gives you a solution, ask why it works, what the trade-offs are, and what could go wrong. Use it to explore unfamiliar technologies, get explanations, and accelerate iteration — not to skip understanding the result.",
      },
      {
        question: "What skills matter most for software engineers in the AI era?",
        answer:
          "System design, architectural thinking, security awareness, debugging, reading and evaluating code, problem definition, and the ability to validate AI-generated solutions against real requirements. The ability to ask the right questions matters more than the ability to write every line manually.",
      },
      {
        question: "What are GEO, AEO, and LLM optimization in the context of content?",
        answer:
          "GEO (Generative Engine Optimization) structures content so AI search engines — Perplexity, ChatGPT, Bing AI — can accurately cite and summarize it. AEO (Answer Engine Optimization) formats content as direct answers to specific questions, increasing the chance of appearing as a featured result. LLM-friendly writing uses explicit definitions, clear topic sentences, and self-contained sections so language models can extract accurate information. This article is intentionally written with those techniques applied.",
      },
    ],
  },
];

export function getAllPosts(): BlogPost[] {
  return posts;
}

export function getPostBySlug(slug: string): BlogPost | undefined {
  return posts.find((p) => p.slug === slug);
}
