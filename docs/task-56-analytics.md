# Task 56 — Privacy-First Analytics

## Tool Choice: Custom Lightweight Tracker

**No external dependencies.** No Google Analytics, no Plausible, no Umami — just a tiny custom module.

### Why Custom?
- Zero external script loading (no performance impact)
- No cookies, no fingerprinting, no user profiling
- No vendor lock-in
- Can optionally send to any webhook endpoint
- Console logging in development
- Fails silently — never breaks UX

### How It Works
1. Events logged to an in-memory queue
2. In development, logged to console (`[analytics] event_name {data}`)
3. If `VITE_ANALYTICS_ENDPOINT` is set, events batch-send via `sendBeacon` every 5 seconds
4. If endpoint is unavailable, events are silently dropped

### To Enable Remote Logging
Set in `.env`:
```
VITE_ANALYTICS_ENDPOINT=https://your-endpoint.example.com/event
```

Acceptable endpoints: webhook, Umami API, Plausible API, custom backend.

## Events Tracked

| Event | Where | Data |
|-------|-------|------|
| `project_click` | ProjectCard "View details" link | `{ title }` |
| `case_study_expand` | CaseStudyCard expand button | `{ title }` |
| `case_study_collapse` | CaseStudyCard collapse button | `{ title }` |
| `resume_download` | Resume download button | `{ label, variant }` |
| `contact_click` | Contact link (email, GitHub, etc.) | `{ label }` |
| `cert_open` | CertGallery lightbox open | `{ title }` |

### NOT Tracked (Privacy)
- Page views (can add if needed)
- Scroll depth
- Time on page
- Mouse movements
- Any personally identifiable data
- Any browser fingerprinting

## Privacy Rules
- No cookies set
- No localStorage used for tracking
- No third-party scripts loaded
- No user profiles created
- Events contain only interaction metadata (title, label)
- Path included for context (public info)
- Timestamp for ordering (no cross-session linking)

## Performance Impact
- Module size: ~1.5KB (analytics.js)
- No network requests unless endpoint configured
- `sendBeacon` used for non-blocking delivery
- Batch flush every 5 seconds (not per-event)
