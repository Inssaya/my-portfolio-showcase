-- =============================================================================
-- Seed the portfolio with the current localStorage defaults.
--
-- Optional. Run this once, after schema.sql, if you want to start with the
-- current default content instead of an empty admin. Idempotent: uses
-- ON CONFLICT DO NOTHING everywhere, so re-running it doesn't overwrite
-- edits you made through the admin panel.
-- =============================================================================

insert into public.hero (id, subtitle, title, title_highlight, description)
values (
  1,
  'AI & Data Engineering',
  'I Build Systems That',
  'Actually Scale',
  'Hey, I''m Yassine — a final-year engineering student in AI & Data Science. I like taking ideas and turning them into real-world projects that are stable, useful, and built to succeed in today''s competitive world, and I''m looking for a 6-month PFE internship in Morocco or abroad, ideally with a company where I can grow, contribute, and hopefully continue working together after the internship, while also being open to freelance work.'
)
on conflict (id) do nothing;

insert into public.social_links (id, github, linkedin, email, phone, location)
values (
  1,
  'https://github.com/Inssaya',
  '',
  'yassinsinif4@gmail.com',
  '+212 6 23 84 25 35',
  'Casablanca, Morocco'
)
on conflict (id) do nothing;

-- The rest of the seeds use "insert ... where not exists" against the table
-- being empty, so they only fire on a fresh install.

insert into public.about_cards (icon, title, content, position)
select * from (values
  ('Briefcase'::text, 'Experience'::text,
    'Just finished an internship at Aptiv (Tangier), where I built tools to help a maintenance team catch equipment problems earlier. Before that, I built a chatbot and a PDF tool for a web agency in Casablanca. Now looking for my next internship or freelance project.'::text,
    0::int),
  ('Globe', 'Languages',
    E'Arabic — Native\nFrench — B2\nEnglish — B2\nSpanish — A2',
    1),
  ('Award', 'Certifications',
    'DeepLearning.AI Data Engineering Professional Certificate (in progress) • Python for Data Science, AI & Development (IBM) • Software Engineering: Design and Project Management (HKUST) • La recherche documentaire (École Polytechnique)',
    2)
) as v(icon, title, content, position)
where not exists (select 1 from public.about_cards);

insert into public.education (period, title, institution, description, position)
select * from (values
  ('2022 - 2027'::text,
   'Engineering Degree, Computer Science & Networks'::text,
   'EMSI, Casablanca'::text,
   'Specialization: AI & Data Science'::text,
   0::int)
) as v(period, title, institution, description, position)
where not exists (select 1 from public.education);

insert into public.experience (period, title, company, location, bullets, position)
select * from (values
  ('Jun 2026 – Aug 2026'::text,
   'AI Data Engineer Intern'::text,
   'Aptiv'::text,
   'Tangier, Morocco · Maintenance Department'::text,
   array[
     'Built a maintenance intervention tracking and KPI platform, replacing a manual Excel workflow, and owned its technical specification end to end.',
     'Designed a predictive maintenance module ranking machines by failure risk, combining statistical reliability modeling with an ML classifier.',
     'Built an AI assistant that searches past maintenance reports to find similar cases and suggest likely causes.',
     'Tested everything on synthetic data before touching real production data, to keep sensitive information safe.'
   ]::text[],
   0::int),
  ('2024 – 2025 · 1 month',
   'Software Engineering Intern',
   'Web Agency',
   'Casablanca, Morocco',
   array[
     'Developed a Laravel chatbot with database information retrieval.',
     'Built an automated PDF generation tool.'
   ]::text[],
   1)
) as v(period, title, company, location, bullets, position)
where not exists (select 1 from public.experience);

insert into public.skill_categories (title, skills, position)
select * from (values
  ('Languages & Frameworks'::text,
   array['Python','Django','FastAPI','React','React Native','JavaScript','TypeScript','Java','C++','C#','ASP.NET']::text[],
   0::int),
  ('Data & ML',
   array['pandas','NumPy','scikit-learn','PyTorch','Feature Engineering','Model Evaluation','Backtesting']::text[],
   1),
  ('LLM & RAG',
   array['LangChain','LangGraph','RAG Pipelines','Embeddings','ChromaDB','Ollama','Prompt Engineering']::text[],
   2),
  ('Data Engineering',
   array['PostgreSQL','SQL Server','SSIS','MySQL','MongoDB','Neo4j','Cassandra','Hadoop','ETL','Kafka','Data Warehousing']::text[],
   3),
  ('DevOps & Tools',
   array['Docker','Git','CI/CD','Linux','REST APIs']::text[],
   4),
  ('BI & Cloud',
   array['Power BI','Tableau']::text[],
   5)
) as v(title, skills, position)
where not exists (select 1 from public.skill_categories);

insert into public.certificates (name, issuer, position)
select * from (values
  ('Data Engineering Professional Certificate (in progress, 2026)'::text, 'DeepLearning.AI & AWS'::text, 0::int),
  ('Python for Data Science, AI & Development', 'IBM', 1),
  ('Software Engineering: Design and Project Management', 'HKUST', 2),
  ('La recherche documentaire', 'École Polytechnique', 3)
) as v(name, issuer, position)
where not exists (select 1 from public.certificates);

insert into public.projects (slug, title, description, long_description, tech, status, category, position)
select * from (values
  ('multi-vendor-e-commerce-saas-platform'::text, 'Multi-Vendor E-commerce SaaS Platform'::text,
   'Microservices architecture with Firebase, websockets and cloud deployment (AWS).'::text,
   null::text,
   array['React','Next.js','Express','MongoDB','Redis','Kafka']::text[],
   'En cours'::text, 'Personnel'::text, 0::int),
  ('gym-management-app', 'Gym Management App',
   'Full-featured gym management with biometric check-in: NFC, facial recognition, fingerprint and QR code.',
   null,
   array['Java','NFC','Face Recognition','Fingerprint','QR Code']::text[],
   'Terminé', 'Personnel', 1),
  ('optic-management-app', 'Optic Management App',
   'Desktop app for optical store management — inventory, prescriptions, client records.',
   null,
   array['Java','MySQL','Swing']::text[],
   'Terminé', 'Personnel', 2),
  ('pos-system-app', 'POS System App',
   'Point of sale system with real-time inventory, receipt generation and analytics.',
   null,
   array['Java','JavaFX','MySQL']::text[],
   'Terminé', 'Personnel', 3),
  ('rag-chatbot', 'RAG Chatbot',
   'Retrieval-Augmented Generation chatbot querying custom knowledge bases.',
   null,
   array['Python','LangChain','FAISS','OpenAI API','Flask']::text[],
   'Terminé', 'Personnel', 4),
  ('ai-based-enterprise-ticket-management', 'AI-Based Enterprise Ticket Management',
   'Intelligent ticket routing and prioritization using NLP.',
   null,
   array['Python','NLP','Django','PostgreSQL']::text[],
   'Terminé', 'Académique', 5),
  ('mobile-transport-app', 'Mobile Transport App',
   'Mobile application for transport services.',
   null,
   array['React Native']::text[],
   'En cours', 'Personnel', 6),
  ('plagiarism-detection-system', 'Plagiarism Detection System',
   'Plagiarism detection using semantic similarity scoring with TF-IDF and SBERT.',
   null,
   array['Python','TF-IDF','SBERT','Django']::text[],
   'Terminé', 'Académique', 7),
  ('flight-management-system', 'Flight Management System',
   'Web app for flight management with modern interface.',
   null,
   array['Python','Django','Tailwind CSS']::text[],
   'Terminé', 'Académique', 8),
  ('car-locator-platform', 'Car Locator Platform',
   'Vehicle location platform with interactive map.',
   null,
   array['PHP','Laravel','JavaScript']::text[],
   'Terminé', 'Académique', 9),
  ('to-do-list-web-app', 'To-Do List Web App',
   'Task management app with reactive UI.',
   null,
   array['React','TypeScript','Tailwind CSS']::text[],
   'Terminé', 'Personnel', 10),
  ('ai-chatbot', 'AI Chatbot',
   'Intelligent chatbot using natural language processing.',
   null,
   array['Python','NLP','Flask','OpenAI API']::text[],
   'Terminé', 'Académique', 11),
  ('nexora-ai', 'Nexora AI',
   'Call-center SaaS with on-premise RAG for automated ticket handling.',
   'A call-center SaaS platform that automates ticket handling with an on-premise Retrieval-Augmented Generation pipeline — embeddings and retrieval stay fully self-hosted (ChromaDB, sentence-transformers, Ollama) so no support data leaves the client''s infrastructure. FastAPI backend, React/TypeScript frontend, PostgreSQL for persistence.',
   array['FastAPI','React','TypeScript','PostgreSQL','ChromaDB','Sentence-Transformers','Ollama']::text[],
   'Terminé', 'Personnel', 12),
  ('stock-market-analytics-platform', 'Stock Market Analytics Platform',
   'Real-time streaming ingestion and processing for stock market data.',
   'A real-time analytics platform that ingests and processes streaming stock market data through Kafka pipelines, persists it to MySQL, and surfaces live dashboards through Streamlit. Fully containerized with Docker for reproducible deployment.',
   array['Python','Kafka','MySQL','Docker','Streamlit']::text[],
   'Terminé', 'Personnel', 13),
  ('medical-multi-agent-system', 'Medical Multi-Agent System',
   'Coordinated LLM agents for clinical workflows.',
   'A multi-agent system coordinating specialized LLM agents (via LangGraph/LangChain) over clinical workflows, exposed through an MCP tool interface with a FastAPI backend and both React (web) and Flutter (mobile) clients.',
   array['LangGraph','LangChain','FastAPI','MCP','React','Flutter']::text[],
   'Terminé', 'Personnel', 14),
  ('aptiv-maintenance-platform', 'Aptiv Maintenance Platform',
   'Maintenance intervention tracking, KPI platform and failure-risk analysis for a wire-harness plant, replacing a manual Excel workflow.',
   'A multi-user web platform for the maintenance department of a wire-harness plant, replacing a shared Excel workbook that was the only source of truth for the team''s performance indicators. Technicians open the app on any phone or PC on the plant network and log a breakdown as it happens: the repair timer runs on the server, so a reload, a dead battery or a closed browser never distorts the recorded time, and a repair that spans two shifts is handed over and taken over without being split — actual hands-on time and waiting time are separated automatically. Supervisors get MTTR, MTBF, availability, downtime rate, Pareto charts of the most costly machines and weekly trends, all derived automatically from the technicians'' records for any period or scope; targets can be set per machine, line, project or globally, with the most specific applicable target displayed. Two design properties protect the indicators: durations are never stored, only derived from timestamps every time they are displayed, so they cannot silently disagree with the underlying record; and every correction is attributed and kept, so the history stays both accurate and auditable. On top of the recorded history, a failure-risk module scores every machine nightly for its risk of failing within a defined horizon — Level 1 is a Weibull survival model (classical reliability statistics, fully transparent), Level 2 is a logistic-regression / random-forest classifier, and a rolling backtest picks the champion; on a 24-month simulated validation set the statistical model reaches ~2.2x lift and the ML model ~2.4x lift, both measured with a strict no-leak protocol. An agentic assistant is grounded on a fixed set of tools onto the department''s own database (KPIs, Pareto and failure-type breakdowns, spare-part consumption, past-case retrieval with the action that fixed each, per-machine clustering) and may answer only from what those tools return — so every answer is traceable to recorded data. Weekly PDF reports, bilingual FR/EN interface, role-based access enforced centrally, 110 automated tests covering indicator formulas, state transitions, access control, imports and query behaviour, versioned migrations applied at startup, and the whole stack packaged as a single-command container deployment (application + PostgreSQL + nightly backup) that runs on-premise so no maintenance data leaves the plant.',
   array['FastAPI','PostgreSQL','SQLAlchemy','Alembic','React','TypeScript','Docker']::text[],
   'En cours', 'Internship', 15)
) as v(slug, title, description, long_description, tech, status, category, position)
where not exists (select 1 from public.projects);
