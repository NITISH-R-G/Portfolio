# Task 52 — Admin IA Restructure

## New Admin Navigation Architecture

**Before:** 20 flat horizontal tabs (overflow on mobile, hard to scan)

**After:** Grouped vertical sidebar with 4 groups

### Navigation Groups

| Group | Sections |
|-------|----------|
| **Core** | Projects, Experience, Education, Skills, Certifications, Contact, Resume |
| **Research & Community** | Research, Publications, Conferences, Talks, Teaching, Open Source, Hackathons |
| **Founder & Creative** | Founder, Design, Media, Testimonials, Awards |
| **Advanced** | Raw JSON |

### Layout

```
┌─────────────────────────────────────────────┐
│  [☰] Portfolio Editor    [Save] [Export] [Reset] │
├──────────┬──────────────────────────────────┤
│ Core     │                                  │
│ ▸ Projects│    [Section Editor Content]      │
│   Experience│                                │
│   Education │                                │
│   Skills    │                                │
│   Certs     │                                │
│   Contact   │                                │
│   Resume    │                                │
│           │                                  │
│ Research  │                                  │
│ ▸ Research │                                  │
│   Pubs     │                                  │
│   ...      │                                  │
├──────────┴──────────────────────────────────┤
```

### Mobile Behavior

- Sidebar hidden by default
- Hamburger menu toggle in header
- Sidebar slides in from left as overlay
- Scrim behind closes sidebar
- Clicking a section closes sidebar

### Keyboard Navigation

- Arrow Down/Up: move between sections
- Home/End: jump to first/last section
- Active section announced via `aria-current="page"`

### Key Changes

- `SECTION_GROUPS` array replaces flat `TABS` array
- `ALL_SECTIONS` flat list derived for keyboard navigation
- `admin-layout` flex container: sidebar + main
- `admin-sidebar` sticky on desktop, fixed overlay on mobile
- `admin-menu-toggle` visible only on mobile
- `admin-sidebar-srim` closes sidebar on click
