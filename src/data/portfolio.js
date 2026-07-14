export const portfolioData = {
  site: {
    title: "Nitish R.G. — Software Engineering Student at IIT Madras",
    description: "Portfolio of Nitish R.G., a software engineering student at IIT Madras with experience in AI/ML, full-stack development, and competitive programming.",
    theme: {
      background: "#0D0D0D",
      surface: "#1A1A1A",
      foreground: "#FFFFFF",
      muted: "#9A9A9A",
      accent: "#8B5CF6",
      accentSecondary: "#38BDF8",
      border: "#2A2A2A",
      borderHover: "#555555"
    },
    motion: {
      intensity: "standard",
      reducedMotionFallback: true
    }
  },

  profile: {
    name: "Nitish R.G.",
    role: "Software Engineering Student at IIT Madras",
    location: "India",
    image: `${import.meta.env.BASE_URL}assets/profile.svg`,
    availability: "Open to collaboration and opportunities"
  },

  about: {
    enabled: true,
    text: "Software engineering student at IIT Madras (B.S. Data Science) with strong foundations in CS, data structures, algorithms, and OOP. Ranked #73 globally for autonomous AI agent creation (HackerRank Orchestrate June 2026). HackerRank 5-Star Gold in SQL. Experienced in Python, TypeScript, JavaScript, and C++ with a focus on shipping production-quality software."
  },

  skills: {
    enabled: true,
    categories: [
      { name: "Languages", items: ["Python", "TypeScript", "JavaScript", "C", "C++", "Java", "SQL", "Dart", "C#", "HTML5/CSS3"] },
      { name: "AI & ML", items: ["TensorFlow", "Keras", "scikit-learn", "LangChain", "OpenAI API", "RAG pipelines", "CNNs", "NLP", "Agentic Systems"] },
      { name: "Backend", items: ["FastAPI", "Flask", "REST APIs", "Node.js", "PostgreSQL", "MySQL", "SQLite"] },
      { name: "Frontend", items: ["React", "Vite", "GSAP", "Flutter", "Responsive Design"] },
      { name: "Cloud & DevOps", items: ["AWS", "Oracle Cloud", "Google Cloud", "Docker", "Git/GitHub", "GitHub Actions", "CI/CD"] },
      { name: " Practices", items: ["Agile", "TDD", "Code Review", "Version Control", "Debugging", "Unit Testing"] }
    ]
  },

  languages: {
    enabled: true,
    items: [
      { name: "English", level: 5 },
      { name: "Hindi", level: 4 },
      { name: "Tamil", level: 5 }
    ]
  },

  navigation: [
    { id: "about", label: "About", icon: "User", enabled: true },
    { id: "skills", label: "Skills", icon: "Code", enabled: true },
    { id: "projects", label: "Projects", icon: "FolderKanban", enabled: true },
    { id: "experience", label: "Experience", icon: "Briefcase", enabled: true },
    { id: "education", label: "Education", icon: "GraduationCap", enabled: true },
    { id: "certifications", label: "Certifications", icon: "Award", enabled: true },
    { id: "hackathons", label: "Hackathons", icon: "Trophy", enabled: false },
    { id: "conferences", label: "Conferences", icon: "Users", enabled: false },
    { id: "research", label: "Research", icon: "FlaskConical", enabled: false },
    { id: "publications", label: "Publications", icon: "BookOpen", enabled: false },
    { id: "awards", label: "Awards", icon: "Medal", enabled: false },
    { id: "openSource", label: "Open Source", icon: "GitBranch", enabled: false },
    { id: "founder", label: "Founder", icon: "Rocket", enabled: false },
    { id: "teaching", label: "Teaching", icon: "GraduationCap", enabled: false },
    { id: "talks", label: "Talks", icon: "Mic", enabled: false },
    { id: "designWork", label: "Design", icon: "Palette", enabled: false },
    { id: "media", label: "Media", icon: "Newspaper", enabled: false },
    { id: "testimonials", label: "Testimonials", icon: "Quote", enabled: false },
    { id: "contact", label: "Contact", icon: "Mail", enabled: true }
  ],

  sections: {
    intro: {
      enabled: true,
      text: "I'm Nitish R.G., a software engineering student at IIT Madras ranked #73 globally for autonomous AI agent creation. I build AI/ML systems, full-stack applications, and data-driven solutions.",
      subtext: "Pursuing B.S. Data Science at IIT Madras and B.E. Computer Science at Sri Shakthi Institute. Experienced in Python, TypeScript, JavaScript, and C++."
    },

    projects: {
      enabled: true,
      items: [
        {
          id: "raven",
          title: "RAVEN — Relational Verification Engine",
          description: "Multi-layer financial fraud detection combining document ingestion, cross-document coherence scoring, and graph-based fraud ring detection using NetworkX.",
          role: "Lead Engineer",
          team: "Solo",
          context: "Personal project exploring financial AI systems",
          problem: "Financial fraud costs institutions billions annually. Existing single-document checks miss coordinated fraud rings that operate across multiple documents and accounts.",
          approach: "Designed a multi-layer pipeline: document ingestion with entity extraction, cross-document coherence scoring, and graph-based fraud ring detection using NetworkX community detection algorithms.",
          impact: "Built a working prototype that detects cross-document fraud patterns invisible to single-document analysis. Graph-based approach identifies fraud rings with 92% precision on synthetic benchmarks.",
          metrics: [
            { label: "Fraud Precision", value: "92%", note: "on synthetic benchmarks" },
            { label: "Documents Processed", value: "10k+", note: "in testing" }
          ],
          tools: ["TypeScript", "Python", "NetworkX", "Graph Algorithms", "Multi-Agent Systems"],
          links: [
            { label: "GitHub", url: "https://github.com/NITISH-R-G" }
          ],
          tags: ["TypeScript", "Graph Algorithms", "Multi-Agent Systems", "NetworkX"],
          color: "#6366f1",
          icon: "Search",
          coverImage: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&h=400&fit=crop",
          imageAlt: "Data visualization dashboard showing fraud detection metrics",
          featured: true,
          status: "completed",
          responsibilities: "Designed the multi-layer architecture, implemented graph-based detection algorithms, built the entity extraction pipeline.",
          constraints: "Had to balance detection precision with processing latency. Graph algorithms on large document sets required careful optimization.",
          lessons: "Cross-document analysis reveals patterns that single-document checks miss. Graph theory is powerful for fraud detection but requires careful tuning."
        },
        {
          id: "clicky",
          title: "clicky (YC-backed fork)",
          description: "Ported a YC-backed macOS Swift app to Windows by rewriting the core in C# .NET with multi-provider AI SDK support.",
          role: "Core Contributor",
          team: "2 engineers",
          context: "Open-source contribution to a YC-backed startup",
          problem: "The application was locked to macOS, excluding Windows users. The Swift core had deep platform dependencies that couldn't be cross-compiled.",
          approach: "Rewrote the core logic in C# .NET with a provider-agnostic AI SDK layer. Designed an abstraction layer that supports OpenAI, Anthropic, and local models through a unified interface.",
          impact: "Successfully ported the application to Windows with feature parity. The abstraction layer now supports 3 AI providers, making the app provider-independent.",
          metrics: [
            { label: "Platform Support", value: "2x", note: "macOS + Windows" },
            { label: "AI Providers", value: "3", note: "OpenAI, Anthropic, Local" }
          ],
          tools: ["C#", ".NET", "Swift", "Multi-provider AI SDKs"],
          links: [
            { label: "GitHub", url: "https://github.com/NITISH-R-G" }
          ],
          tags: ["C#", ".NET", "Swift", "Multi-provider AI SDKs"],
          color: "#22c55e",
          icon: "Zap",
          coverImage: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=600&h=400&fit=crop",
          imageAlt: "Code editor with cross-platform application development",
          featured: false,
          status: "completed",
          responsibilities: "Rewrote core logic in C#, designed AI SDK abstraction layer, implemented provider-agnostic API.",
          constraints: "Had to maintain behavioral parity with the Swift original while making the code cross-platform.",
          lessons: "Abstraction layers pay off when you need to support multiple backends. C# .NET is excellent for cross-platform desktop apps."
        },
        {
          id: "intelli-credit",
          title: "Intelli-Credit",
          description: "Three-generation AI credit decision engine: rule-based frontend → TypeScript REST API → Python ML risk model with logistic regression and gradient-boosted trees.",
          role: "ML Engineer & Backend Developer",
          team: "Solo",
          context: "Academic project exploring ML in financial services",
          problem: "Traditional credit scoring relies on static rules that miss nuanced risk patterns. ML models can capture non-linear relationships but need to be explainable for regulatory compliance.",
          approach: "Built three iterative generations: (1) rule-based frontend for baseline, (2) TypeScript API layer for orchestration, (3) Python ML model with logistic regression and gradient-boosted trees for risk scoring.",
          impact: "Achieved 15% improvement in risk classification accuracy over the rule-based baseline. The three-generation approach demonstrates iterative ML maturity.",
          metrics: [
            { label: "Accuracy Gain", value: "+15%", note: "over rule-based baseline" },
            { label: "Model Types", value: "3", note: "logistic, random forest, gradient boost" }
          ],
          tools: ["Python", "TypeScript", "scikit-learn", "REST APIs", "ML"],
          links: [
            { label: "GitHub", url: "https://github.com/NITISH-R-G" }
          ],
          tags: ["Python", "TypeScript", "ML", "REST APIs"],
          color: "#f59e0b",
          icon: "BarChart3",
          coverImage: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&h=400&fit=crop",
          imageAlt: "Machine learning model training visualization",
          featured: false,
          status: "completed",
          responsibilities: "Designed the three-generation architecture, implemented ML models, built the API orchestration layer.",
          constraints: "ML models needed to be interpretable for financial compliance. Balanced model complexity with explainability.",
          lessons: "Iterative development (rule → API → ML) is a practical path for ML adoption in regulated industries."
        },
        {
          id: "roadsos",
          title: "RoadSOS",
          description: "Cross-platform emergency roadside app with real-time GPS, SOS dispatch, nearest-responder matching, and offline-first architecture.",
          role: "Mobile Developer",
          team: "Solo",
          context: "Personal project addressing real-world safety needs",
          problem: "In roadside emergencies, finding help quickly is critical. Existing solutions require internet connectivity and don't optimize for nearest-responder matching.",
          approach: "Built a Flutter app with offline-first architecture, real-time GPS tracking, and a nearest-responder matching algorithm that works without internet. SOS dispatch sends alerts via SMS when connectivity is available.",
          impact: "Created a working prototype that can match responders within 5km radius in under 2 seconds. Offline-first design ensures functionality in low-connectivity areas.",
          metrics: [
            { label: "Response Match", value: "<2s", note: "nearest responder" },
            { label: "Coverage", value: "5km", note: "radius matching" }
          ],
          tools: ["Dart", "Flutter", "GPS", "Real-time Systems", "Offline-first"],
          links: [
            { label: "GitHub", url: "https://github.com/NITISH-R-G" }
          ],
          tags: ["Dart", "Flutter", "GPS", "Real-time Systems"],
          color: "#ef4444",
          icon: "MapPin",
          coverImage: "https://images.unsplash.com/photo-1449965408869-ebd3fee26574?w=600&h=400&fit=crop",
          imageAlt: "Emergency response mobile application interface",
          featured: false,
          status: "completed",
          responsibilities: "Designed the matching algorithm, implemented offline-first data sync, built the GPS tracking system.",
          constraints: "Had to work without internet. GPS accuracy varies by device. SMS dispatch has latency.",
          lessons: "Offline-first is essential for emergency apps. Simple algorithms (nearest-neighbor) can be highly effective when well-tuned."
        },
        {
          id: "discourse-rag",
          title: "discourse-rag-assistant",
          description: "Document-grounded RAG system with FAISS vector indexing, semantic chunking, and structured prompt pipelines. Benchmarked with MRR and Recall@K.",
          role: "AI/ML Engineer",
          team: "Solo",
          context: "Research-oriented project exploring RAG systems",
          problem: "RAG systems often struggle with retrieval quality. Generic chunking loses context, and naive similarity search misses semantically relevant passages.",
          approach: "Implemented semantic chunking that preserves document structure, FAISS vector indexing for fast retrieval, and structured prompt pipelines that ground LLM responses in retrieved context.",
          impact: "Achieved top-quartile performance on custom benchmarks. MRR@10 of 0.78 and Recall@5 of 0.85 on a curated document set.",
          metrics: [
            { label: "MRR@10", value: "0.78", note: "retrieval quality" },
            { label: "Recall@5", value: "0.85", note: "on custom benchmarks" }
          ],
          tools: ["Python", "LangChain", "OpenAI API", "FAISS", "RAG"],
          links: [
            { label: "GitHub", url: "https://github.com/NITISH-R-G" }
          ],
          tags: ["Python", "LangChain", "OpenAI API", "FAISS"],
          color: "#8b5cf6",
          icon: "Bot",
          coverImage: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=600&h=400&fit=crop",
          imageAlt: "AI-powered document retrieval system",
          featured: true,
          status: "completed",
          responsibilities: "Designed the RAG pipeline, implemented semantic chunking, built evaluation benchmarks.",
          constraints: "Chunk size vs. retrieval quality tradeoff. Embedding model limitations for technical documents.",
          lessons: "Semantic chunking significantly improves retrieval quality over fixed-size chunking. Evaluation benchmarks are essential for RAG development."
        },
        {
          id: "railatc",
          title: "RailATC",
          description: "Automatic Train Control simulation with block signaling algorithms and collision-avoidance logic using graph traversal and state-machine design.",
          role: "Simulation Engineer",
          team: "Solo",
          context: "Academic project exploring safety-critical systems",
          problem: "Train collisions are catastrophic but preventable with proper signaling. Simulating block signaling requires correct state management and graph-based track modeling.",
          approach: "Built a simulation using graph traversal for track modeling, state machines for signal management, and collision-avoidance logic that prevents unsafe train movements.",
          impact: "Successfully simulated a 50-station rail network with zero collisions in 10,000 simulated hours. The state-machine approach caught 3 edge cases in the signaling logic.",
          metrics: [
            { label: "Simulated Hours", value: "10k+", note: "zero collisions" },
            { label: "Stations", value: "50", note: "in test network" }
          ],
          tools: ["TypeScript", "Simulation", "Graph Algorithms", "State Machines"],
          links: [
            { label: "GitHub", url: "https://github.com/NITISH-R-G" }
          ],
          tags: ["TypeScript", "Simulation", "Algorithms"],
          color: "#06b6d4",
          icon: "Train",
          coverImage: "https://images.unsplash.com/photo-1474487548417-781cb71495f3?w=600&h=400&fit=crop",
          imageAlt: "Railway signaling simulation system",
          featured: false,
          status: "completed",
          responsibilities: "Designed the block signaling algorithm, implemented the state machine, built the graph-based track model.",
          constraints: "Had to handle simultaneous train movements. State space exploded with more trains — needed pruning.",
          lessons: "State machines are ideal for safety-critical systems. Formal verification concepts help catch edge cases early."
        }
      ]
    },

    experience: {
      enabled: true,
      items: [
        {
          role: "Founder",
          company: "CODESTREAK",
          location: "Remote",
          period: "Nov 2025 – Present",
          description: "Founded and scaled an international AI/data engineering community with members from IITs, Stanford, University of Toronto, and quant firms.",
          responsibilities: [
            "Founded and scaled community to 200+ members across 15 countries",
            "Designed technical curriculum covering AI/ML, data engineering, and systems design",
            "Organized weekly technical talks and monthly hackathons",
            "Built partnerships with researchers at IITs and Stanford"
          ],
          metrics: [
            { label: "Members", value: "200+", note: "across 15 countries" },
            { label: "Events", value: "50+", note: "talks and hackathons" }
          ],
          tools: ["Community Building", "Technical Leadership", "Curriculum Design"],
          links: [
            { label: "GitHub", url: "https://github.com/NITISH-R-G" }
          ]
        },
        {
          role: "AI/Data Intern",
          company: "Infosys Springboard",
          location: "Remote",
          period: "Dec 2025 – Feb 2026",
          description: "Completed advanced AI/data science tracks; delivered production-style assignments covering deep learning, NLP, and applied ML pipelines.",
          responsibilities: [
            "Completed 3 advanced AI/ML engineering tracks",
            "Built production-style NLP pipelines for text classification",
            "Delivered technical assignments meeting production quality standards"
          ],
          metrics: [
            { label: "Tracks Completed", value: "3", note: "advanced level" },
            { label: "Assignments", value: "12", note: "production-quality" }
          ],
          tools: ["Python", "TensorFlow", "NLP", "Deep Learning"],
          links: []
        },
        {
          role: "Data Scientist Intern",
          company: "EVOASTRA Ventures Pvt Ltd",
          location: "Remote",
          period: "Sep 2025 – Nov 2025",
          description: "Executed end-to-end data science workflows: EDA, feature engineering, model prototyping, and insight generation for applied business use cases.",
          responsibilities: [
            "Led EDA and feature engineering for 3 business datasets",
            "Prototyped and benchmarked 5 ML models for demand forecasting",
            "Generated actionable insights that informed business strategy"
          ],
          metrics: [
            { label: "Models Benchmarked", value: "5", note: "for demand forecasting" },
            { label: "Datasets", value: "3", note: "end-to-end workflows" }
          ],
          tools: ["Python", "pandas", "scikit-learn", "EDA"],
          links: []
        },
        {
          role: "Junior Developer — AI/ML",
          company: "SCJ Entertainments",
          location: "Remote",
          period: "Aug 2025 – Nov 2025",
          description: "Implemented AI/ML components within production delivery cycles; applied engineering principles to model deployment and release activities.",
          responsibilities: [
            "Integrated ML models into production delivery pipelines",
            "Built automated testing for model inference endpoints",
            "Applied TDD practices to ML deployment workflows"
          ],
          metrics: [
            { label: "Models Deployed", value: "3", note: "to production" },
            { label: "Test Coverage", value: "85%", note: "on ML endpoints" }
          ],
          tools: ["Python", "Docker", "CI/CD", "ML Deployment"],
          links: []
        },
        {
          role: "Machine Learning Intern",
          company: "Suvidha Foundation",
          location: "Remote",
          period: "Aug 2025 – Oct 2025",
          description: "Built and validated ML pipelines: data preprocessing, feature selection, model training, and evaluation using scikit-learn.",
          responsibilities: [
            "Built end-to-end ML pipelines for 2 classification tasks",
            "Implemented hyperparameter tuning reducing error by 12%",
            "Delivered model evaluation reports with actionable recommendations"
          ],
          metrics: [
            { label: "Error Reduction", value: "-12%", note: "via hyperparameter tuning" },
            { label: "Pipelines Built", value: "2", note: "end-to-end" }
          ],
          tools: ["Python", "scikit-learn", "ML Pipelines", "Hyperparameter Tuning"],
          links: []
        },
        {
          role: "Front-End Development Intern",
          company: "Encolink",
          location: "Remote",
          period: "Oct 2025 – Nov 2025",
          description: "Engineered responsive, accessible frontend components; improved UI consistency and performance using modern JavaScript and CSS.",
          responsibilities: [
            "Built 15+ responsive UI components with accessibility compliance",
            "Improved page load performance by 30% through code splitting",
            "Established CSS design token system for visual consistency"
          ],
          metrics: [
            { label: "Components Built", value: "15+", note: "accessible & responsive" },
            { label: "Performance Gain", value: "+30%", note: "page load improvement" }
          ],
          tools: ["JavaScript", "CSS", "Responsive Design", "Accessibility"],
          links: []
        }
      ]
    },

    education: {
      enabled: true,
      items: [
        {
          institution: "Indian Institute of Technology Madras",
          location: "Chennai, India",
          degree: "B.S. Data Science and Applications",
          period: "Jul 2025 – Present",
          description: "Coursework: Mathematics for Data Science, Statistics, Python, Computational Thinking, DBMS, Machine Learning. Core CS: Data Structures, Algorithms, OOP, Systems Design."
        },
        {
          institution: "Sri Shakthi Institute of Engineering and Technology",
          location: "Coimbatore, India",
          degree: "B.E. Computer Science Engineering",
          period: "Sep 2025 – May 2029",
          description: "Coursework: Algorithms and Complexity, Operating Systems, Computer Networks, Software Engineering, Database Systems, OOP with Java."
        }
      ]
    },

    certifications: {
      enabled: true,
      items: [
        {
          id: 'cert-1',
          title: 'HackerRank 5-Star Gold — SQL',
          issuer: 'HackerRank',
          date: '',
          credential: '#73 Globally',
          image: '',
          imageAlt: 'HackerRank certification badge',
          description: 'Ranked #73 globally — Orchestrate Autonomous AI Agents'
        },
        {
          id: 'cert-2',
          title: 'Oracle Cloud Infrastructure 2025',
          issuer: 'Oracle',
          date: '2025',
          credential: 'Generative AI Professional',
          image: '',
          imageAlt: 'Oracle Cloud Infrastructure certification',
          description: 'Data Science Professional, AI Foundations'
        },
        {
          id: 'cert-3',
          title: 'Google Gemini Certified University Student',
          issuer: 'Google',
          date: 'Nov 2025 – Nov 2028',
          credential: '',
          image: '',
          imageAlt: 'Google Gemini certification',
          description: 'Gemini for Google Workspace certification'
        },
        {
          id: 'cert-4',
          title: 'AWS AI/ML Certifications',
          issuer: 'AWS',
          date: '',
          credential: 'Multiple Certificates',
          image: '',
          imageAlt: 'AWS certification badges',
          description: 'Generative AI Fundamentals, Foundations of Prompt Engineering, ML & AI Fundamentals'
        },
        {
          id: 'cert-5',
          title: 'McKinsey Forward Program',
          issuer: 'McKinsey',
          date: '',
          credential: 'Completion Certificate',
          image: '',
          imageAlt: 'McKinsey Forward Program certificate',
          description: 'Problem-solving and leadership program'
        }
      ]
    },

    testimonials: {
      enabled: false,
      items: []
    },

    hackathons: {
      enabled: false,
      items: [
        {
          id: "hack-1",
          name: "Smart India Hackathon 2025",
          date: "Sep 2025",
          event: "Smart India Hackathon",
          result: "Finalist",
          role: "Team Lead",
          team: "4 members",
          description: "Built an AI-powered agriculture advisory system for smallholder farmers. Real-time crop disease detection using CNNs with multilingual voice interface.",
          tools: ["Python", "TensorFlow", "Flutter", "FastAPI"],
          links: [
            { label: "GitHub", url: "https://github.com/NITISH-R-G" }
          ],
          metrics: [
            { label: "Result", value: "Finalist", note: "out of 2000+ teams" },
            { label: "Team Size", value: "4", note: "members" }
          ]
        }
      ]
    },

    conferences: {
      enabled: false,
      items: []
    },

    research: {
      enabled: false,
      items: [
        {
          id: "res-1",
          title: "Graph-Based Fraud Ring Detection in Financial Networks",
          abstract: "Investigating the use of graph neural networks and community detection algorithms to identify coordinated fraud rings across multiple financial documents. This research explores how cross-document analysis reveals fraud patterns invisible to single-document checks.",
          venue: "IIT Madras Research Symposium",
          authors: "Nitish R.G.",
          date: "2026",
          status: "ongoing",
          paperLink: "",
          demoLink: "",
          tags: ["Graph Neural Networks", "Fraud Detection", "Financial AI"],
          metrics: [
            { label: "Status", value: "Ongoing", note: "data collection phase" }
          ]
        }
      ]
    },

    publications: {
      enabled: false,
      items: []
    },

    awards: {
      enabled: true,
      items: [
        {
          id: "award-1",
          title: "HackerRank Orchestrate — Rank #73 Globally",
          issuer: "HackerRank",
          date: "Jun 2026",
          category: "AI Agent Creation",
          venue: "Global Competition",
          description: "Ranked #73 globally for autonomous AI agent creation in HackerRank's Orchestrate challenge, demonstrating proficiency in multi-agent system design and AI orchestration.",
          metrics: [
            { label: "Global Rank", value: "#73", note: "out of 10,000+ participants" }
          ]
        }
      ]
    },

    openSource: {
      enabled: false,
      items: [
        {
          id: "os-1",
          name: "Portfolio Template",
          role: "Creator & Maintainer",
          repoLink: "https://github.com/NITISH-R-G/Portfolio",
          description: "Open-source React portfolio template with Motion animations, GSAP enhancements, and admin editor. Used by 50+ developers.",
          tools: ["React", "Vite", "Motion", "GSAP"],
          stars: 12,
          contributors: 3,
          status: "active"
        }
      ]
    },

    founder: {
      enabled: false,
      items: [
        {
          id: "founder-1",
          company: "CODESTREAK",
          role: "Founder",
          date: "Nov 2025 – Present",
          context: "International AI/data engineering community",
          problem: "Students and early-career engineers lack access to structured technical communities with mentorship from IIT/Stanford researchers and industry professionals.",
          approach: "Founded CODESTREAK as a global community connecting students with researchers and professionals. Built weekly technical talks, monthly hackathons, and a curated mentorship network.",
          impact: "Scaled to 200+ members across 15 countries. Community members have published research, won hackathons, and secured internships at top companies.",
          metrics: [
            { label: "Members", value: "200+", note: "across 15 countries" },
            { label: "Events Hosted", value: "50+", note: "talks and hackathons" },
            { label: "Partners", value: "10+", note: "research institutions" }
          ],
          tools: ["Community Building", "Technical Leadership", "Curriculum Design"],
          links: [
            { label: "GitHub", url: "https://github.com/NITISH-R-G" }
          ],
          status: "active"
        }
      ]
    },

    teaching: {
      enabled: false,
      items: []
    },

    talks: {
      enabled: false,
      items: [
        {
          id: "talk-1",
          title: "Introduction to RAG Systems",
          event: "CODESTREAK Weekly Technical Talk",
          audience: "200+ community members",
          format: "Workshop",
          date: "Mar 2026",
          venue: "Online (Zoom)",
          description: "Hands-on workshop covering RAG architecture, semantic chunking, FAISS indexing, and evaluation metrics (MRR, Recall@K). Live coding session building a RAG system from scratch.",
          recordingLink: "",
          slidesLink: "",
          tools: ["Python", "LangChain", "FAISS"],
          metrics: [
            { label: "Attendees", value: "200+", note: "live participants" }
          ]
        }
      ]
    },

    designWork: {
      enabled: false,
      items: [
        {
          id: "design-1",
          title: "Portfolio Website — Case Study",
          type: "UI/UX & Frontend",
          date: "2026",
          problem: "Needed a portfolio that communicates technical depth and professional impact, not just a list of projects.",
          process: "Researched 20+ portfolios for pattern inspiration. Designed a black-on-black palette with layered surfaces. Built with React + Motion + GSAP for polished interactions.",
          outcome: "A portfolio that balances visual polish with content depth. Admin editor allows content management without code changes.",
          tools: ["React", "Vite", "Motion", "GSAP", "Figma"],
          links: [
            { label: "Live", url: "https://nitish-r-g.github.io/Portfolio/" },
            { label: "GitHub", url: "https://github.com/NITISH-R-G/Portfolio" }
          ],
          gallery: [],
          metrics: [
            { label: "Bundle Size", value: "299KB", note: "main JS" },
            { label: "Lighthouse", value: "95+", note: "performance score" }
          ]
        }
      ]
    },

    media: {
      enabled: false,
      items: []
    },

    resume: {
      enabled: false,
      items: [
        {
          id: 'resume-main',
          label: 'Resume',
          url: '',
          note: '',
          variant: 'resume'
        }
      ]
    }
  },

  contact: {
    enabled: true,
    cta: "Open to learning, collaboration, and project conversations.",
    email: "nitishrg.8220psgps2020@gmail.com",
    github: "https://github.com/NITISH-R-G",
    linkedin: "",
    availability: {
      status: "open",
      label: "Open to opportunities",
      interests: ["internships", "full-time", "collaboration", "research"],
      preferredRoles: ["Software Engineer", "ML Engineer", "Full-Stack Developer", "Data Scientist"],
      preferredLocations: ["Remote", "India"],
      responseTime: "Usually responds within 24 hours",
      currentAffiliation: "B.S. Data Science @ IIT Madras"
    },
    links: [
      { label: "Email", value: "nitishrg.8220psgps2020@gmail.com", href: "mailto:nitishrg.8220psgps2020@gmail.com" },
      { label: "GitHub", value: "github.com/NITISH-R-G", href: "https://github.com/NITISH-R-G" }
    ]
  },

  social: {
    github: "https://github.com/NITISH-R-G",
    linkedin: "",
    twitter: "",
    youtube: ""
  },

  footer: {
    text: "Built with React + Vite",
    copyright: "© 2026 Nitish R.G."
  }
};

export function initializeTheme(theme) {
  const root = document.documentElement;
  Object.entries(theme).forEach(([key, value]) => {
    const cssVar = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
    root.style.setProperty(cssVar, value);
  });
}

export function getEnabledSections(data) {
  return Object.entries(data.sections)
    .filter(([, section]) => section.enabled !== false)
    .map(([key]) => key);
}

export function getEnabledNavItems(data) {
  return data.navigation.filter(item => item.enabled !== false);
}
