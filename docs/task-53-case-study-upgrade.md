# Task 53 — Case Study Upgrade

## What Changed

Upgraded the content model for priority sections from simple title+description entries to rich, structured case studies that communicate proof, impact, and depth.

## Field Models by Section

### Projects (full case study)
**Basic:** title, description, role, team, context, status, featured, icon, color
**Case Study:** problem, approach, impact, responsibilities, constraints, lessons
**Proof:** metrics[{value, label, note}], tools[], links[{label, url}], tags[]
**Media:** coverImage, imageAlt

### Research
**Basic:** title, date, abstract, venue, authors, status
**Proof:** metrics[], tags[]
**Links:** paperLink, demoLink

### Publications
**Basic:** title, date, abstract, venue, authors, status
**Links:** paperLink
**Tags:** tags[]

### Founder
**Basic:** company, role, date, status
**Case Study:** context, problem, approach, impact
**Proof:** metrics[], tools[], links[]

### Design
**Basic:** title, type, date
**Case Study:** problem, process, outcome
**Proof:** metrics[], tools[], links[], gallery[]

### Talks
**Basic:** title, event, date, description
**Details:** audience, format, venue, recordingLink, slidesLink
**Proof:** metrics[], tools[]

### Open Source
**Basic:** name, role, description
**Details:** repoLink, stars, contributors, status
**Proof:** tools[], links[]

### Hackathons
**Basic:** name, date, result, description
**Details:** event, role, team
**Proof:** metrics[], tools[], links[]

### Awards (lighter)
**Basic:** title, issuer, date, description
**Details:** category, venue
**Proof:** metrics[]

### Experience
**Basic:** role, company, location, period, description
**Proof:** responsibilities[], metrics[], tools[], links[]

## Admin Components

### FieldGroup
Collapsible fieldset for organizing related fields. Groups like "Case Study", "Proof & Metrics", "Links & Tags" are collapsible.

### MetricsEditor
Structured metrics: value + label + note. Add/remove individual metrics.

### TagsEditor
Inline tag input with chips. Type + Enter to add, Backspace to remove last.

### LinksEditor
Link pairs: label + URL. Add/remove individual links.

### EnhancedListEditor
Upgraded GenericListEditor with field groups, metrics, tags, links, tools, gallery support. Used for hackathons, research, publications, awards, openSource, founder, talks, designWork.

## Public Components

### CaseStudyCard
Expandable card that shows:
- **Summary:** title, subtitle, date, status, featured badge, description, compact metrics
- **Details (on expand):** context, problem, approach, impact, responsibilities, constraints, lessons, full metrics, tools/tags, links
- **Animation:** Motion-powered expand/collapse with smooth height transition
- **Smart rendering:** Only shows fields that have content

### Sections using CaseStudyCard
Projects, Research, Publications, Awards, Open Source, Founder, Talks, Design, Hackathons

### Sections still using simple list
Conferences, Teaching, Media, Testimonials

## Backward Compatibility
- All existing fields remain unchanged
- New fields are optional — empty fields are invisible
- Simple entries (title + description only) render fine
- No forced field completion
