export const portfolioData = {
  site: {
    title: "Nitish R.G. — Student Developer & Data Science Enthusiast",
    description: "Portfolio of Nitish R.G., a student developer and data science enthusiast at IIT Madras.",
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
    role: "Student Developer & Data Science Enthusiast",
    location: "Uttar Pradesh, India",
    image: `${import.meta.env.BASE_URL}assets/profile.svg`,
    availability: "Open to learning and collaboration"
  },

  about: {
    enabled: true,
    text: "IIT Madras student passionate about building data-driven solutions and mastering algorithmic problem-solving. Currently exploring machine learning, data analysis, and software development through academic projects and self-directed learning."
  },

  skills: {
    enabled: true,
    categories: [
      { name: "Programming", items: ["Python", "Java"] },
      { name: "Data", items: ["Pandas", "NumPy", "Data Cleaning", "Exploratory Analysis"] },
      { name: "Machine Learning", items: ["Regression", "Model Evaluation", "Feature Preparation"] },
      { name: "Foundations", items: ["Algorithms", "Linear Algebra", "Debugging"] },
      { name: "Tools", items: ["Git/GitHub"] }
    ]
  },

  languages: {
    enabled: true,
    items: [
      { name: "English", level: 5 },
      { name: "Hindi", level: 5 }
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
      text: "I'm Nitish R.G., a student developer and data science enthusiast at Indian Institute of Technology Madras. I enjoy building data-driven solutions and mastering algorithmic problem-solving through academic projects and self-directed learning.",
      subtext: "Currently exploring machine learning, data analysis, and software development, with a focus on transforming raw data into meaningful models and insights."
    },

    projects: {
      enabled: true,
      items: [
        {
          id: "house-price-prediction",
          title: "House Price Prediction",
          description: "Data preparation and regression-based prediction model for estimating house prices.",
          tags: ["Python", "Pandas", "Scikit-learn", "NumPy"],
          color: "#22c55e",
          icon: "📊",
          link: "#contact"
        },
        {
          id: "matrix-operations-toolkit",
          title: "Matrix Operations Toolkit",
          description: "Matrix computations and linear algebra utilities for mathematical computing tasks.",
          tags: ["Python", "NumPy", "Linear Algebra", "OOP"],
          color: "#6366f1",
          icon: "🔢",
          link: "#contact"
        },
        {
          id: "algorithm-practice-lab",
          title: "Algorithm Practice Lab",
          description: "Implementations for strings, data structures, and mathematical programming challenges.",
          tags: ["Python", "Java", "Data Structures", "Algorithms"],
          color: "#8B5CF6",
          icon: "💻",
          link: "#contact"
        }
      ]
    },

    experience: {
      enabled: true,
      placeholder: "Currently building academic and personal projects. Detailed work samples are available in the projects section."
    },

    education: {
      enabled: true,
      items: [
        {
          institution: "Indian Institute of Technology Madras",
          location: "Chennai, India",
          description: "Coursework focused on programming, data science, mathematics, and algorithms."
        }
      ]
    },

    certifications: {
      enabled: false,
      placeholder: "Currently building academic and personal projects."
    },

    testimonials: {
      enabled: false,
      items: []
    }
  },

  contact: {
    enabled: true,
    cta: "Open to learning, collaboration, and project conversations.",
    email: "contact@example.com",
    github: "https://github.com/NITISH-R-G",
    linkedin: "",
    links: [
      { label: "Email", value: "contact@example.com", href: "mailto:contact@example.com" },
      { label: "GitHub", value: "github.com/NITISH-R-G", href: "https://github.com/NITISH-R-G" },
      { label: "LinkedIn", value: "linkedin.com/in/nitish", href: "#" }
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