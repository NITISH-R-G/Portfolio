# Portfolio Data - Editing Guide

This file contains ALL editable content for the portfolio. Edit `portfolio.js` to update the site.

## Quick Changes

### Change Name
```javascript
profile: {
  name: "Your Name",
  // ...
}
```

### Add a Project
```javascript
projects: {
  items: [
    {
      id: "new-project",
      title: "Project Title",
      description: "One sentence description.",
      tags: ["Tech1", "Tech2"],
      color: "#8B5CF6",
      icon: "📊",
      link: "#contact"
    }
  ]
}
```

### Hide a Section
```javascript
experience: {
  enabled: false, // Set to false to hide
  // ...
}
```

### Change Colors
```javascript
theme: {
  background: "#0D0D0D",  // Page background
  surface: "#1A1A1A",     // Card backgrounds
  foreground: "#FFFFFF",  // Primary text
  muted: "#9A9A9A",       // Secondary text
  accent: "#8B5CF6",      // Accent color
  // ...
}
```

### Animation Intensity
```javascript
motion: {
  intensity: "standard",  // "minimal", "standard", or "expressive"
  reducedMotionFallback: true
}
```

## Rules
- All paths starting with `/` resolve to `public/` folder
- Empty social links won't render icons
- `enabled: false` removes section from page AND navigation
- Changes take effect immediately in dev mode (`npm run dev`)