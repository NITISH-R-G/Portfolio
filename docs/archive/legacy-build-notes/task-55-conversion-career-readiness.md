# Task 55 — Conversion + Career-Readiness Upgrade

## What Changed

Upgraded the contact and resume sections from basic contact info to a full career-readiness conversion layer.

## Part 1: Contact as Conversion Layer

### New Availability Model
```js
availability: {
  status: "open" | "selective" | "closed",
  label: "Open to opportunities",
  interests: ["internships", "full-time", "collaboration", "research", "speaking"],
  preferredRoles: ["Software Engineer", "ML Engineer"],
  preferredLocations: ["Remote", "India"],
  responseTime: "Usually responds within 24 hours",
  currentAffiliation: "B.S. Data Science @ IIT Madras"
}
```

### Public Rendering
- **Availability badge** with colored dot (green=open, yellow=selective)
- **Current affiliation** shown beside badge
- **CTA text** (existing)
- **Preferred roles** shown as clean inline text
- **Preferred locations** shown as clean inline text
- **Contact links** (existing table)
- **Response time** shown as subtle italic note

### Admin
- CTA & Message group (always open)
- Availability & Status group (collapsed by default)
- Contact Links group (always open)

## Part 2: Resume/CV Workflow

### New Resume Model
```js
resume: {
  enabled: false,
  items: [
    {
      id: "resume-main",
      label: "Resume",
      url: "https://...",
      note: "ATS-friendly, Last updated Jan 2026",
      variant: "resume" | "cv" | "onepage" | "research"
    }
  ]
}
```

### Supported Variants
| Variant | Use Case |
|---------|----------|
| resume | Standard software engineering resume |
| cv | Full academic CV |
| onepage | One-page concise version |
| research | Research-focused CV |

### Public Rendering
- Multiple download buttons (one per variant)
- Note shown below each button
- Only renders variants with URLs

### Admin
- List editor with move/remove
- Label, variant type, URL, note per variant
- ATS guidance in help text

## Part 3: ATS/Recruiter Friendliness

- Clear section naming ("Resume", "CV")
- Standard variant labels
- Help text for ATS-friendly uploads
- No confusing naming

## Part 4: Professional Signals

Supported in availability model:
- preferredRoles
- preferredLocations
- interests (internships, full-time, collaboration, research, speaking)
- responseTime
- currentAffiliation

All optional — only shown when populated.
