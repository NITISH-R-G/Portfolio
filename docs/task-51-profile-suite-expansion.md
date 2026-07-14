# Task 51 — Profile Suite Expansion

## New Section Model

### Sections Added

| Section | ID | Fields | Icon |
|---------|-----|--------|------|
| Hackathons | `hackathons` | name, date, result, description | Trophy |
| Conferences | `conferences` | name, date, role, description | Users |
| Research | `research` | title, date, description, link | FlaskConical |
| Publications | `publications` | title, venue, date, link, description | BookOpen |
| Awards | `awards` | title, issuer, date, description | Medal |
| Open Source | `openSource` | name, role, link, description | GitBranch |
| Founder | `founder` | name, role, date, description, link | Rocket |
| Teaching | `teaching` | title, audience, date, description | GraduationCap |
| Talks | `talks` | title, event, date, description, link | Mic |
| Design | `designWork` | title, type, date, description, link | Palette |
| Media | `media` | title, outlet, date, link | Newspaper |
| Testimonials | `testimonials` | name, role, text | Quote |
| Resume | `resume` | url, text (not a list) | — |

### Data Model

All new sections follow the same pattern:
```js
sectionName: {
  enabled: false,
  items: []
}
```

Resume is special (not a list):
```js
resume: {
  enabled: false,
  url: '',
  text: ''
}
```

### Backward Compatibility

- All new sections default to `enabled: false` with empty `items: []`
- Existing sections untouched
- `hasContent()` checks both `enabled` and `items.length > 0`
- Empty sections hidden on public site automatically

## Architecture

### GenericListEditor (Admin)

One reusable component handles ALL list-based sections:
- `GenericListEditor({ sectionKey, section, update, fields })`
- Configurable fields array defines the form
- Includes: enable toggle, add/remove/reorder, empty state
- No custom editor code needed per section

### GenericSection (Public)

One reusable component renders all generic sections:
- `GenericSection({ id, label, items, fields })`
- Data-driven: only renders if items exist
- Clean card layout with link support

### hasContent() (Public)

Visibility function:
```js
function hasContent(section) {
  if (!section || section.enabled === false) return false
  if (section.items?.length > 0) return true
  if (section.text) return true
  if (section.url) return true
  return false
}
```

## Public Rendering Order

1. Intro
2. Projects
3. Experience
4. Education
5. Certifications
6. Hackathons (if has content)
7. Conferences (if has content)
8. Research (if has content)
9. Publications (if has content)
10. Awards (if has content)
11. Open Source (if has content)
12. Founder (if has content)
13. Teaching (if has content)
14. Talks (if has content)
15. Design (if has content)
16. Media (if has content)
17. Testimonials (if has content)
18. Resume (if enabled + URL set)
19. Contact

## Admin Tabs

20 tabs total: Projects, Experience, Education, Skills, Certifications, Hackathons, Conferences, Research, Publications, Awards, Open Source, Founder, Teaching, Talks, Design, Media, Testimonials, Resume, Contact, Raw JSON

## Files Updated

- `src/data/portfolio.js` — 13 new sections in data model, 13 new nav entries
- `src/admin/AdminEditor.jsx` — GenericListEditor, ResumeEditor, 14 new tab panels
- `src/components/MainContent.jsx` — Data-driven rendering, GenericSection, hasContent()
- `src/components/Icon.jsx` — 11 new Lucide icon imports
- `src/styles/global.css` — Generic list card styles
