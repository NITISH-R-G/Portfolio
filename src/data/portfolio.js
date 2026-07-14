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
    text: "Software engineering student at IIT Madras (B.S. Data Science) with strong foundations in computer science, data structures, algorithms, and object-oriented programming. Ranked #73 globally for autonomous AI agent creation (HackerRank Orchestrate June 2026) and holds a HackerRank 5-Star Gold badge in SQL. Experienced in designing, developing, and testing software systems across Python, TypeScript, JavaScript, and C++. Passionate about leveraging new technologies and engineering best practices to ship products that have real-world impact."
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
    { id: "contact", label: "Contact", icon: "Mail", enabled: true }
  ],

  sections: {
    intro: {
      enabled: true,
      text: "I'm Nitish R.G., a software engineering student at IIT Madras ranked #73 globally for autonomous AI agent creation. I build AI/ML systems, full-stack applications, and data-driven solutions with real-world impact.",
      subtext: "Currently pursuing B.S. Data Science at IIT Madras and B.E. Computer Science at Sri Shakthi Institute. Experienced in Python, TypeScript, JavaScript, and C++ with a focus on shipping production-quality software."
    },

    projects: {
      enabled: true,
      items: [
        {
          id: "raven",
          title: "RAVEN — Relational Verification Engine",
          description: "Multi-layer financial fraud detection system combining document ingestion, cross-document coherence verification, and graph-based fraud ring detection using NetworkX.",
          tags: ["TypeScript", "Graph Algorithms", "Multi-Agent Systems", "NetworkX"],
          color: "#6366f1",
          icon: "Search",
          link: "https://github.com/NITISH-R-G",
          coverImage: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&h=400&fit=crop",
          imageAlt: "Data visualization dashboard showing fraud detection metrics"
        },
        {
          id: "clicky",
          title: "clicky (YC-backed fork)",
          description: "Ported a YC-backed startup's macOS-only Swift application to Windows by rewriting the core in C# and .NET with multi-provider AI SDK support.",
          tags: ["C#", ".NET", "Swift", "Multi-provider AI SDKs"],
          color: "#22c55e",
          icon: "Zap",
          link: "https://github.com/NITISH-R-G",
          coverImage: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=600&h=400&fit=crop",
          imageAlt: "Code editor with cross-platform application development"
        },
        {
          id: "intelli-credit",
          title: "Intelli-Credit",
          description: "Three-generation AI credit decision engine: rule-driven frontend → TypeScript REST API → Python ML risk model with logistic regression and tree-based classifiers.",
          tags: ["Python", "TypeScript", "ML", "REST APIs"],
          color: "#f59e0b",
          icon: "BarChart3",
          link: "https://github.com/NITISH-R-G",
          coverImage: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&h=400&fit=crop",
          imageAlt: "Machine learning model training visualization"
        },
        {
          id: "roadsos",
          title: "RoadSOS",
          description: "Cross-platform emergency roadside app: real-time GPS, SOS dispatch, nearest-responder matching algorithm, and offline-first architecture.",
          tags: ["Dart", "Flutter", "GPS", "Real-time Systems"],
          color: "#ef4444",
          icon: "MapPin",
          link: "https://github.com/NITISH-R-G",
          coverImage: "https://images.unsplash.com/photo-1449965408869-ebd3fee26574?w=600&h=400&fit=crop",
          imageAlt: "Emergency response mobile application interface"
        },
        {
          id: "discourse-rag",
          title: "discourse-rag-assistant",
          description: "Document-grounded RAG system with FAISS vector indexing, semantic chunking, and structured prompt pipelines. Benchmarked using MRR and Recall@K.",
          tags: ["Python", "LangChain", "OpenAI API", "FAISS"],
          color: "#8b5cf6",
          icon: "Bot",
          link: "https://github.com/NITISH-R-G",
          coverImage: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=600&h=400&fit=crop",
          imageAlt: "AI-powered document retrieval system"
        },
        {
          id: "railatc",
          title: "RailATC",
          description: "Automatic Train Control simulation implementing block signaling algorithms and collision-avoidance logic using graph traversal and state-machine design.",
          tags: ["TypeScript", "Simulation", "Algorithms"],
          color: "#06b6d4",
          icon: "Train",
          link: "https://github.com/NITISH-R-G",
          coverImage: "https://images.unsplash.com/photo-1474487548417-781cb71495f3?w=600&h=400&fit=crop",
          imageAlt: "Railway signaling simulation system"
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
          description: "Founded and scaled an international AI/data engineering community with talents from IITs, Stanford, University of Toronto, researchers worldwide, and professionals from quant firms."
        },
        {
          role: "AI/Data Intern",
          company: "Infosys Springboard",
          location: "Remote",
          period: "Dec 2025 – Feb 2026",
          description: "Completed advanced AI/data science engineering tracks; delivered production-style technical assignments covering deep learning, NLP, and applied ML pipelines."
        },
        {
          role: "Data Scientist Intern",
          company: "EVOASTRA Ventures Pvt Ltd",
          location: "Remote",
          period: "Sep 2025 – Nov 2025",
          description: "Executed end-to-end data science workflows: EDA, feature engineering, model prototyping, performance benchmarking, and insight generation for applied business use cases."
        },
        {
          role: "Junior Developer — AI/ML",
          company: "SCJ Entertainments",
          location: "Remote",
          period: "Aug 2025 – Nov 2025",
          description: "Implemented and integrated AI/ML components within production delivery cycles; applied sound engineering principles to model deployment and software release activities."
        },
        {
          role: "Machine Learning Intern",
          company: "Suvidha Foundation",
          location: "Remote",
          period: "Aug 2025 – Oct 2025",
          description: "Built and validated ML pipelines: data preprocessing, feature selection, model training, hyperparameter tuning, and evaluation using scikit-learn on real-world datasets."
        },
        {
          role: "Front-End Development Intern",
          company: "Encolink",
          location: "Remote",
          period: "Oct 2025 – Nov 2025",
          description: "Engineered responsive, accessible frontend components; improved UI consistency and performance across web interfaces using modern JavaScript and CSS best practices."
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
          description: "Coursework: Mathematics for Data Science, Statistics, Python for Data Science, Computational Thinking, DBMS, Machine Learning Foundations & Techniques. Core CS: Data Structures, Algorithms, OOP, Systems Design."
        },
        {
          institution: "Sri Shakthi Institute of Engineering and Technology",
          location: "Coimbatore, India",
          degree: "B.E. Computer Science Engineering",
          period: "Sep 2025 – May 2029",
          description: "Coursework: Algorithms and Complexity, Operating Systems, Computer Networks, Software Engineering, Database Systems, Object-Oriented Design with Java."
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
          description: 'Ranked #73 Globally — Orchestrate Autonomous AI Agents'
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
          description: 'Gemini for Google Workspace certification for university students'
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
    }
  },

  contact: {
    enabled: true,
    cta: "Open to learning, collaboration, and project conversations.",
    email: "nitishrg.8220psgps2020@gmail.com",
    github: "https://github.com/NITISH-R-G",
    linkedin: "",
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
