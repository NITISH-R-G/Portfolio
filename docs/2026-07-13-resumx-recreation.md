# Resumx Website Recreation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recreate the Resumx one-page resume portfolio website as a static HTML/CSS/JS site with identical visual design and layout.

**Architecture:** Two-column responsive layout with a fixed left sidebar (profile, skills, contact) and scrollable right main content (intro, projects, experience, education, certifications, testimonials, contact form, footer). Dark theme with Inter font, CSS Grid/Flexbox for layout, and smooth scrolling navigation.

**Tech Stack:** HTML5, CSS3 (custom properties, Grid, Flexbox), Vanilla JavaScript (for smooth scroll, navigation, and interactivity)

---

## File Structure

```
Nitish Portfolio/
├── index.html          # Main HTML structure
├── css/
│   ├── styles.css      # Main styles + CSS variables
│   └── responsive.css  # Media queries for mobile/tablet
├── js/
│   └── main.js         # Navigation, smooth scroll, interactivity
├── assets/
│   └── profile.jpg     # Profile photo (placeholder)
└── docs/
    └── 2026-07-13-resumx-recreation.md  # This plan
```

---

### Task 1: Create HTML Structure

**Files:**
- Create: `index.html`

- [ ] **Step 1: Create base HTML with meta tags and font imports**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Resumx - Henry Walker</title>
    <meta name="description" content="One-page resume portfolio for Henry Walker">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="css/styles.css">
    <link rel="stylesheet" href="css/responsive.css">
</head>
<body>
    <div class="page-wrapper">
        <!-- Left Sidebar -->
        <aside class="sidebar">
            <!-- Profile Section -->
            <div class="profile">
                <img src="assets/profile.jpg" alt="Henry Walker" class="profile-photo">
                <h1 class="profile-name">Henry Walker <span class="verified">✓</span></h1>
                <p class="profile-pronouns">he/him</p>
            </div>

            <!-- About Section -->
            <section class="sidebar-section">
                <h2 class="section-label">ABOUT</h2>
                <p class="about-text">Brooklyn based full-stack software engineer with 7+ years of experience in building web and mobile apps.</p>
            </section>

            <!-- Contact Section -->
            <section class="sidebar-section">
                <h2 class="section-label">CONTACT</h2>
                <div class="contact-list">
                    <a href="mailto:hey@henrywalker.com" class="contact-item">
                        <span class="contact-icon">✉</span>
                        <span>hey@henrywalker.com</span>
                    </a>
                    <a href="https://henrywalker.com" class="contact-item">
                        <span class="contact-icon">◉</span>
                        <span>henrywalker.com</span>
                    </a>
                    <a href="tel:555-1234-5678" class="contact-item">
                        <span class="contact-icon">📱</span>
                        <span>555-1234-5678</span>
                    </a>
                </div>
            </section>

            <!-- Skills Section -->
            <section class="sidebar-section">
                <h2 class="section-label">SKILLS</h2>
                <div class="skills-grid">
                    <span class="skill-tag">JavaScript</span>
                    <span class="skill-tag">React</span>
                    <span class="skill-tag">Python</span>
                    <span class="skill-tag">Git</span>
                    <span class="skill-tag">Agile</span>
                    <span class="skill-tag">CI/CD</span>
                    <span class="skill-tag">Node.js</span>
                    <span class="skill-tag">Docker</span>
                    <span class="skill-tag">MongoDB</span>
                    <span class="skill-tag">Typescript</span>
                    <span class="skill-tag">AWS</span>
                </div>
            </section>

            <!-- Languages Section -->
            <section class="sidebar-section">
                <h2 class="section-label">LANGUAGES</h2>
                <div class="languages-list">
                    <div class="language-item">
                        <span>English</span>
                        <div class="language-dots">
                            <span class="dot filled"></span>
                            <span class="dot filled"></span>
                            <span class="dot filled"></span>
                            <span class="dot filled"></span>
                            <span class="dot filled"></span>
                        </div>
                    </div>
                    <div class="language-item">
                        <span>German</span>
                        <div class="language-dots">
                            <span class="dot filled"></span>
                            <span class="dot filled"></span>
                            <span class="dot filled"></span>
                            <span class="dot"></span>
                            <span class="dot"></span>
                        </div>
                    </div>
                    <div class="language-item">
                        <span>French</span>
                        <div class="language-dots">
                            <span class="dot filled"></span>
                            <span class="dot filled"></span>
                            <span class="dot"></span>
                            <span class="dot"></span>
                            <span class="dot"></span>
                        </div>
                    </div>
                    <div class="language-item">
                        <span>Chinese</span>
                        <div class="language-dots">
                            <span class="dot filled"></span>
                            <span class="dot"></span>
                            <span class="dot"></span>
                            <span class="dot"></span>
                            <span class="dot"></span>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Social Links -->
            <div class="social-links">
                <a href="#" class="social-icon" aria-label="X (Twitter)">𝕏</a>
                <a href="#" class="social-icon" aria-label="Threads">@</a>
                <a href="#" class="social-icon" aria-label="Instagram">📷</a>
                <a href="#" class="social-icon" aria-label="LinkedIn">in</a>
                <a href="#" class="social-icon" aria-label="GitHub">⌘</a>
                <a href="#" class="social-icon" aria-label="YouTube">▶</a>
            </div>
        </aside>

        <!-- Main Content -->
        <main class="main-content">
            <!-- Intro Section -->
            <section class="content-section intro-section">
                <h2 class="section-label">INTRO</h2>
                <p class="intro-text">I'm Henry Walker, a product engineer from Brooklyn, New York City. My expertise lies in developing innovative and user-focused products for both web and mobile platforms, where I emphasize intuitive design and robust functionality.</p>
                <p class="intro-text">Holding a Master's degree in Computer Science from the Nova University of Science and Technology, my journey began in a dynamic startup, progressing to lead positions in established tech firms.</p>
            </section>

            <!-- Projects Section -->
            <section class="content-section projects-section">
                <h2 class="section-label">PROJECTS</h2>
                <div class="projects-scroll">
                    <div class="project-card">
                        <div class="project-image" style="background: linear-gradient(135deg, #ff9a56 0%, #ff6b6b 100%);"></div>
                        <div class="project-info">
                            <h3 class="project-title">Interactive Data Dashboard</h3>
                            <div class="project-meta">
                                <span>📅 Jan 24, 2024</span>
                                <span>👤 Frontend Lead</span>
                                <span>📁 Internal Tools</span>
                            </div>
                        </div>
                    </div>
                    <div class="project-card">
                        <div class="project-image" style="background: linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%);"></div>
                        <div class="project-info">
                            <h3 class="project-title">Personal Finance Tracker</h3>
                            <div class="project-meta">
                                <span>📅 Mar 15, 2024</span>
                                <span>👤 Frontend Developer</span>
                                <span>📁 Fintech</span>
                            </div>
                        </div>
                    </div>
                    <div class="project-card">
                        <div class="project-image" style="background: linear-gradient(135deg, #34d399 0%, #059669 100%);"></div>
                        <div class="project-info">
                            <h3 class="project-title">Collaborative Coding Environment</h3>
                            <div class="project-meta">
                                <span>📅 Jan 12, 2024</span>
                                <span>👤 Frontend Developer</span>
                                <span>📁 Developer Tools</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Experience Section -->
            <section class="content-section experience-section">
                <h2 class="section-label">EXPERIENCE</h2>
                <div class="experience-list">
                    <div class="experience-card">
                        <div class="experience-icon" style="background: #22c55e;">⚡</div>
                        <div class="experience-content">
                            <h3 class="experience-title">Frontend Lead</h3>
                            <div class="experience-meta">
                                <span>📅 Jan 24 - Present</span>
                                <span>🏢 Alpha</span>
                                <span>📍 Cupertino, CA</span>
                            </div>
                            <p class="experience-description">Spearheaded the development of a suite of progressive web applications using React and Swift, and GraphQL.</p>
                        </div>
                    </div>
                    <div class="experience-card">
                        <div class="experience-icon" style="background: #6366f1;">S</div>
                        <div class="experience-content">
                            <h3 class="experience-title">Frontend Engineer</h3>
                            <div class="experience-meta">
                                <span>📅 Sep 22 - Dec 23</span>
                                <span>🏢 Sigma</span>
                                <span>📍 New York, NY</span>
                            </div>
                            <p class="experience-description">Enhanced user interfaces for the Sigma Web Player using React and Redux, achieving a 25% increase in user engagement.</p>
                        </div>
                    </div>
                    <div class="experience-card">
                        <div class="experience-icon" style="background: #8b5cf6;">Ω</div>
                        <div class="experience-content">
                            <h3 class="experience-title">Junior Software Engineer</h3>
                            <div class="experience-meta">
                                <span>📅 Feb 20 - Dec 23</span>
                                <span>🏢 Omega</span>
                                <span>📍 Menlo Park, CA</span>
                            </div>
                            <p class="experience-description">Involved in the lifecycle of feature development from conception to deployment, emphasizing responsive design and accessibility standards.</p>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Education Section -->
            <section class="content-section education-section">
                <h2 class="section-label">EDUCATION</h2>
                <div class="education-list">
                    <div class="education-card">
                        <div class="education-icon" style="background: #eab308;">🎓</div>
                        <div class="education-content">
                            <h3 class="education-title">Master of Science in Computer Science</h3>
                            <div class="education-meta">
                                <span>📅 Sep 18 - Jun 20</span>
                                <span>🏫 Astra University</span>
                                <span>📍 Stanford, CA</span>
                            </div>
                            <p class="education-description">Specialized in Software Engineering. Completed thesis on "Scalable Architectures for Real-Time Web Applications" and graduated with distinction.</p>
                        </div>
                    </div>
                    <div class="education-card">
                        <div class="education-icon" style="background: #06b6d4;">🎓</div>
                        <div class="education-content">
                            <h3 class="education-title">Bachelor of Science in Software Engineering</h3>
                            <div class="education-meta">
                                <span>📅 Sep 15 - Sep 18</span>
                                <span>🏫 Nova University</span>
                                <span>📍 Providence, RI</span>
                            </div>
                            <p class="education-description">Graduated with honors. Relevant coursework included Advanced Algorithms, Web Development, and User Interface Design.</p>
                        </div>
                    </div>
                </div>
            </section>

            <!-- License & Certification Section -->
            <section class="content-section certification-section">
                <h2 class="section-label">LICENSE & CERTIFICATION</h2>
                <div class="certification-list">
                    <div class="certification-card">
                        <div class="certification-icon" style="background: #ec4899;">α</div>
                        <div class="certification-content">
                            <h3 class="certification-title">Alpha Certified Developer Associate</h3>
                            <p class="certification-date">Issued 2019</p>
                        </div>
                    </div>
                    <div class="certification-card">
                        <div class="certification-icon" style="background: #8b5cf6;">β</div>
                        <div class="certification-content">
                            <h3 class="certification-title">Beta Certified Developer Associate</h3>
                            <p class="certification-date">Issued 2023</p>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Testimonials Section -->
            <section class="content-section testimonials-section">
                <h2 class="section-label">TESTIMONIALS</h2>
                <div class="testimonials-list">
                    <div class="testimonial-card">
                        <div class="testimonial-header">
                            <div class="testimonial-avatar" style="background: #3b82f6;">EB</div>
                            <div>
                                <h3 class="testimonial-name">Evelyn Brooks</h3>
                                <p class="testimonial-role">Lead Engineer at Sigma, managed Henry directly</p>
                            </div>
                        </div>
                        <p class="testimonial-text">Having worked alongside Henry at Sigma, I've been consistently impressed by his exceptional skills as a frontend engineer. Henry's hands-on approach and dedication to building robust web and mobile applications have greatly contributed to our project's success.</p>
                    </div>
                    <div class="testimonial-card">
                        <div class="testimonial-header">
                            <div class="testimonial-avatar" style="background: #10b981;">RP</div>
                            <div>
                                <h3 class="testimonial-name">Raj Patel</h3>
                                <p class="testimonial-role">Junior Software Engineer at Omega, worked with Henry on the same team</p>
                            </div>
                        </div>
                        <p class="testimonial-text">Henry's expertise has been crucial in turning our ambitious project ideas into reality at Omega. His proficiency in both front-end and back-end development ensures a seamless integration of features, delivering a user experience that's both intuitive and high-performing.</p>
                    </div>
                </div>
            </section>

            <!-- Contact Section -->
            <section class="content-section contact-section">
                <h2 class="section-label">CONTACT</h2>
                <div class="contact-table">
                    <a href="mailto:hey@henrywalker.com" class="contact-row">
                        <span class="contact-label">Email</span>
                        <span class="contact-value">hey@henrywalker.com</span>
                    </a>
                    <a href="tel:+5551234567" class="contact-row">
                        <span class="contact-label">Phone</span>
                        <span class="contact-value">+555 123 4567</span>
                    </a>
                    <a href="#" class="contact-row">
                        <span class="contact-label">Meeting</span>
                        <span class="contact-value">Book call</span>
                    </a>
                    <a href="https://henrywalker.com" class="contact-row">
                        <span class="contact-label">Website</span>
                        <span class="contact-value">henrywalker.com</span>
                    </a>
                    <a href="#" class="contact-row">
                        <span class="contact-label">X (Twitter)</span>
                        <span class="contact-value">@henrywalker</span>
                    </a>
                    <a href="#" class="contact-row">
                        <span class="contact-label">LinkedIn</span>
                        <span class="contact-value">/henryw</span>
                    </a>
                </div>
            </section>

            <!-- Footer -->
            <footer class="footer">
                <p>Built using Framer</p>
                <p><a href="#">Buy this template</a></p>
                <p><a href="#">Become an affiliate</a></p>
                <p>© 2026 Resumx by <strong>Jus</strong></p>
            </footer>
        </main>
    </div>

    <!-- Floating Navigation -->
    <nav class="floating-nav">
        <a href="#intro" class="nav-icon" title="Intro">👤</a>
        <a href="#projects" class="nav-icon" title="Projects">📁</a>
        <a href="#experience" class="nav-icon" title="Experience">💼</a>
        <a href="#education" class="nav-icon" title="Education">🎓</a>
        <a href="#certifications" class="nav-icon" title="Certifications">📜</a>
        <a href="#testimonials" class="nav-icon" title="Testimonials">💬</a>
        <a href="#contact" class="nav-icon" title="Contact">✉️</a>
    </nav>

    <script src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Verify HTML structure**

Open `index.html` in browser to verify basic structure loads correctly.

---

### Task 2: Create Main CSS Styles

**Files:**
- Create: `css/styles.css`

- [ ] **Step 1: Create CSS variables and reset**

```css
/* CSS Variables */
:root {
    --bg-primary: #0d0d0d;
    --bg-secondary: #1a1a1a;
    --bg-card: #1e1e1e;
    --text-primary: #ffffff;
    --text-secondary: #9ca3af;
    --text-muted: #6b7280;
    --border-color: #2a2a2a;
    --accent-green: #22c55e;
    --accent-purple: #8b5cf6;
    --accent-blue: #3b82f6;
    --accent-pink: #ec4899;
    --accent-yellow: #eab308;
    --accent-cyan: #06b6d4;
    --font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    --sidebar-width: 320px;
    --border-radius: 12px;
    --border-radius-sm: 8px;
}

/* Reset */
*, *::before, *::after {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

html {
    scroll-behavior: smooth;
}

body {
    font-family: var(--font-family);
    background-color: var(--bg-primary);
    color: var(--text-primary);
    font-size: 14px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}

a {
    color: inherit;
    text-decoration: none;
}

img {
    max-width: 100%;
    display: block;
}
```

- [ ] **Step 2: Create layout styles**

```css
/* Page Layout */
.page-wrapper {
    display: grid;
    grid-template-columns: var(--sidebar-width) 1fr;
    min-height: 100vh;
    max-width: 1400px;
    margin: 0 auto;
}

/* Sidebar */
.sidebar {
    position: sticky;
    top: 0;
    height: 100vh;
    padding: 40px 30px;
    overflow-y: auto;
    border-right: 1px solid var(--border-color);
}

/* Main Content */
.main-content {
    padding: 40px 60px;
    padding-bottom: 120px;
}
```

- [ ] **Step 3: Create profile and section styles**

```css
/* Profile Section */
.profile {
    margin-bottom: 32px;
}

.profile-photo {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    object-fit: cover;
    margin-bottom: 16px;
    border: 2px solid var(--border-color);
}

.profile-name {
    font-size: 24px;
    font-weight: 600;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 8px;
}

.verified {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    background: #3b82f6;
    border-radius: 50%;
    font-size: 12px;
    color: white;
}

.profile-pronouns {
    color: var(--text-secondary);
    font-size: 14px;
}

/* Section Labels */
.section-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1.5px;
    color: var(--text-muted);
    text-transform: uppercase;
    margin-bottom: 16px;
}

/* Sidebar Sections */
.sidebar-section {
    margin-bottom: 28px;
}

.about-text {
    color: var(--text-secondary);
    font-size: 14px;
    line-height: 1.7;
}

/* Contact List */
.contact-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.contact-item {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--text-secondary);
    font-size: 14px;
    transition: color 0.2s;
}

.contact-item:hover {
    color: var(--text-primary);
}

.contact-icon {
    font-size: 16px;
    width: 20px;
    text-align: center;
}

/* Skills Grid */
.skills-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.skill-tag {
    padding: 6px 14px;
    border: 1px solid var(--border-color);
    border-radius: 20px;
    font-size: 13px;
    color: var(--text-secondary);
    transition: all 0.2s;
}

.skill-tag:hover {
    border-color: var(--text-secondary);
    color: var(--text-primary);
}

/* Languages */
.languages-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.language-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 14px;
    color: var(--text-secondary);
}

.language-dots {
    display: flex;
    gap: 4px;
}

.dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--border-color);
}

.dot.filled {
    background: var(--text-secondary);
}

/* Social Links */
.social-links {
    display: flex;
    gap: 12px;
    margin-top: 24px;
}

.social-icon {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    color: var(--text-secondary);
    font-size: 16px;
    transition: all 0.2s;
}

.social-icon:hover {
    border-color: var(--text-secondary);
    color: var(--text-primary);
}
```

- [ ] **Step 4: Create main content section styles**

```css
/* Content Sections */
.content-section {
    margin-bottom: 60px;
}

/* Intro Section */
.intro-text {
    color: var(--text-secondary);
    font-size: 15px;
    line-height: 1.8;
    margin-bottom: 16px;
}

/* Projects Section */
.projects-scroll {
    display: flex;
    gap: 20px;
    overflow-x: auto;
    padding-bottom: 16px;
    scrollbar-width: thin;
    scrollbar-color: var(--border-color) transparent;
}

.projects-scroll::-webkit-scrollbar {
    height: 6px;
}

.projects-scroll::-webkit-scrollbar-track {
    background: transparent;
}

.projects-scroll::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 3px;
}

.project-card {
    min-width: 320px;
    background: var(--bg-card);
    border-radius: var(--border-radius);
    overflow: hidden;
    border: 1px solid var(--border-color);
    transition: transform 0.2s, border-color 0.2s;
}

.project-card:hover {
    transform: translateY(-2px);
    border-color: var(--text-muted);
}

.project-image {
    height: 180px;
    width: 100%;
}

.project-info {
    padding: 16px;
}

.project-title {
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 8px;
}

.project-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    font-size: 12px;
    color: var(--text-muted);
}

/* Experience Section */
.experience-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.experience-card {
    display: flex;
    gap: 16px;
    padding: 20px;
    background: var(--bg-card);
    border-radius: var(--border-radius);
    border: 1px solid var(--border-color);
}

.experience-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    flex-shrink: 0;
}

.experience-content {
    flex: 1;
}

.experience-title {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 6px;
}

.experience-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    font-size: 13px;
    color: var(--text-muted);
    margin-bottom: 12px;
}

.experience-description {
    color: var(--text-secondary);
    font-size: 14px;
    line-height: 1.7;
}

/* Education Section */
.education-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.education-card {
    display: flex;
    gap: 16px;
    padding: 20px;
    background: var(--bg-card);
    border-radius: var(--border-radius);
    border: 1px solid var(--border-color);
}

.education-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    flex-shrink: 0;
}

.education-content {
    flex: 1;
}

.education-title {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 6px;
}

.education-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    font-size: 13px;
    color: var(--text-muted);
    margin-bottom: 12px;
}

.education-description {
    color: var(--text-secondary);
    font-size: 14px;
    line-height: 1.7;
}

/* Certification Section */
.certification-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.certification-card {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px 20px;
    background: var(--bg-card);
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--border-color);
}

.certification-icon {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    flex-shrink: 0;
}

.certification-title {
    font-size: 15px;
    font-weight: 500;
}

.certification-date {
    font-size: 13px;
    color: var(--text-muted);
    margin-top: 2px;
}

/* Testimonials Section */
.testimonials-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.testimonial-card {
    padding: 24px;
    background: var(--bg-card);
    border-radius: var(--border-radius);
    border: 1px solid var(--border-color);
}

.testimonial-header {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 16px;
}

.testimonial-avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: 600;
    flex-shrink: 0;
}

.testimonial-name {
    font-size: 15px;
    font-weight: 600;
}

.testimonial-role {
    font-size: 13px;
    color: var(--text-muted);
    margin-top: 2px;
}

.testimonial-text {
    color: var(--text-secondary);
    font-size: 14px;
    line-height: 1.8;
}

/* Contact Table */
.contact-table {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border-color);
    border-radius: var(--border-radius);
    overflow: hidden;
}

.contact-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-color);
    transition: background 0.2s;
}

.contact-row:last-child {
    border-bottom: none;
}

.contact-row:hover {
    background: var(--bg-card);
}

.contact-label {
    font-size: 14px;
    color: var(--text-primary);
}

.contact-value {
    font-size: 14px;
    color: var(--text-muted);
}

/* Footer */
.footer {
    margin-top: 60px;
    padding-top: 24px;
    border-top: 1px solid var(--border-color);
}

.footer p {
    font-size: 13px;
    color: var(--text-muted);
    margin-bottom: 8px;
}

.footer a {
    color: var(--text-secondary);
    transition: color 0.2s;
}

.footer a:hover {
    color: var(--text-primary);
}

/* Floating Navigation */
.floating-nav {
    position: fixed;
    bottom: 40px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 8px;
    padding: 12px 20px;
    background: rgba(30, 30, 30, 0.95);
    backdrop-filter: blur(10px);
    border-radius: 40px;
    border: 1px solid var(--border-color);
    z-index: 1000;
}

.nav-icon {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    font-size: 18px;
    transition: background 0.2s;
}

.nav-icon:hover {
    background: rgba(255, 255, 255, 0.1);
}

/* Scrollbar */
::-webkit-scrollbar {
    width: 8px;
}

::-webkit-scrollbar-track {
    background: var(--bg-primary);
}

::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
    background: var(--text-muted);
}
```

- [ ] **Step 3: Verify styles load correctly**

Open `index.html` in browser and verify styles are applied.

---

### Task 3: Create Responsive CSS

**Files:**
- Create: `css/responsive.css`

- [ ] **Step 1: Add responsive breakpoints**

```css
/* Tablet */
@media (max-width: 1024px) {
    .page-wrapper {
        grid-template-columns: 280px 1fr;
    }

    .sidebar {
        padding: 30px 20px;
    }

    .main-content {
        padding: 30px 40px;
    }

    .project-card {
        min-width: 280px;
    }
}

/* Mobile */
@media (max-width: 768px) {
    .page-wrapper {
        grid-template-columns: 1fr;
    }

    .sidebar {
        position: relative;
        height: auto;
        border-right: none;
        border-bottom: 1px solid var(--border-color);
        padding: 24px 20px;
    }

    .profile {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-bottom: 20px;
    }

    .profile-photo {
        width: 60px;
        height: 60px;
        margin-bottom: 0;
    }

    .profile-name {
        font-size: 20px;
    }

    .skills-grid {
        gap: 6px;
    }

    .skill-tag {
        padding: 5px 12px;
        font-size: 12px;
    }

    .social-links {
        margin-top: 16px;
    }

    .main-content {
        padding: 24px 20px;
        padding-bottom: 100px;
    }

    .content-section {
        margin-bottom: 40px;
    }

    .project-card {
        min-width: 260px;
    }

    .experience-card,
    .education-card {
        flex-direction: column;
        gap: 12px;
    }

    .experience-icon,
    .education-icon {
        width: 40px;
        height: 40px;
    }

    .experience-meta,
    .education-meta {
        flex-direction: column;
        gap: 4px;
    }

    .contact-row {
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
    }

    .floating-nav {
        bottom: 20px;
        padding: 10px 16px;
    }

    .nav-icon {
        width: 36px;
        height: 36px;
        font-size: 16px;
    }
}

/* Small Mobile */
@media (max-width: 480px) {
    .main-content {
        padding: 20px 16px;
    }

    .projects-scroll {
        gap: 12px;
    }

    .project-card {
        min-width: 240px;
    }

    .project-image {
        height: 140px;
    }

    .testimonial-card {
        padding: 16px;
    }
}
```

- [ ] **Step 2: Test responsive layout**

Resize browser window to verify responsive behavior at different breakpoints.

---

### Task 4: Create JavaScript for Navigation

**Files:**
- Create: `js/main.js`

- [ ] **Step 1: Add smooth scroll and active state logic**

```javascript
// Smooth scroll for navigation links
document.querySelectorAll('.nav-icon').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = link.getAttribute('href').substring(1);
        const targetSection = document.getElementById(targetId);
        
        if (targetSection) {
            targetSection.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Update active nav state on scroll
const sections = document.querySelectorAll('.content-section');
const navLinks = document.querySelectorAll('.nav-icon');

const observerOptions = {
    root: null,
    rootMargin: '-20% 0px -80% 0px',
    threshold: 0
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const sectionId = entry.target.getAttribute('id');
            navLinks.forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('href') === `#${sectionId}`) {
                    link.classList.add('active');
                }
            });
        }
    });
}, observerOptions);

sections.forEach(section => {
    observer.observe(section);
});

// Add active state styles dynamically
const style = document.createElement('style');
style.textContent = `
    .nav-icon.active {
        background: rgba(255, 255, 255, 0.15);
    }
`;
document.head.appendChild(style);
```

- [ ] **Step 2: Test navigation functionality**

Click navigation icons and verify smooth scrolling works correctly.

---

### Task 5: Add Profile Image

**Files:**
- Create: `assets/profile.jpg`

- [ ] **Step 1: Download or create placeholder profile image**

Download a professional headshot placeholder from a free stock photo site or use a placeholder service. Save as `assets/profile.jpg`.

Alternative: Use a solid color circle as placeholder by modifying CSS:

```css
.profile-photo {
    background: linear-gradient(135deg, #3b82f6, #8b5cf6);
    object-fit: cover;
}
```

---

### Task 6: Final Testing and Polish

- [ ] **Step 1: Cross-browser testing**

Test in Chrome, Firefox, and Edge to ensure consistent rendering.

- [ ] **Step 2: Performance check**

Run Lighthouse audit to check for performance issues.

- [ ] **Step 3: Accessibility check**

Verify color contrast, keyboard navigation, and screen reader compatibility.

- [ ] **Step 4: Final visual comparison**

Compare side-by-side with original Resumx website to ensure pixel-perfect accuracy.

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | HTML Structure | `index.html` |
| 2 | Main CSS Styles | `css/styles.css` |
| 3 | Responsive CSS | `css/responsive.css` |
| 4 | JavaScript Navigation | `js/main.js` |
| 5 | Profile Image | `assets/profile.jpg` |
| 6 | Testing & Polish | All files |

**Total Estimated Time:** 45-60 minutes

**Dependencies:** None (vanilla HTML/CSS/JS)

---

## Execution Handoff

Plan complete and saved to `docs/2026-07-13-resumx-recreation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
