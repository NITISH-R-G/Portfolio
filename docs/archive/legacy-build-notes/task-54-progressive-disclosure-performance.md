# Task 54 — Progressive Disclosure + Performance Hardening

## Part 1: Admin Progressive Disclosure

### FieldGroup defaultOpen
- Added `defaultOpen` prop (default `true` for backward compat)
- All advanced groups now collapse by default

### Collapsed by Default
**Projects:**
- Basic Info → **open**
- Case Study → **collapsed**
- Proof & Metrics → **collapsed**
- Links & Tags → **collapsed**
- Media → **collapsed**

**Experience:**
- Basic Info → **open**
- Proof & Impact → **collapsed**

**EnhancedListEditor (all sections):**
- Basic Info → **open**
- Details → **collapsed**
- Metrics & Proof → **collapsed**
- Tags & Stack → **collapsed**
- Links → **collapsed**
- Gallery → **collapsed**

### Rationale
- Essential fields (title, description, role) are always visible first
- Advanced fields are one click away
- Reduces visual overwhelm for new/empty entries
- Users who need depth expand once; casual editors never see the clutter

## Part 2: Public Detail Progressive Disclosure

CaseStudyCard already implements clean progressive disclosure:
- **Summary:** title, subtitle, date, status, description, compact metrics (max 3)
- **Details (on expand):** context, problem, approach, impact, responsibilities, constraints, lessons, full metrics, tools/tags, links
- **Smart rendering:** only populated fields shown
- **Animation:** smooth height transition via Motion

No changes needed — the existing pattern is solid.

## Part 3: Performance

### Lazy Loading
- `CertGallery` → `React.lazy()` (below fold, 5.8KB)
- `CaseStudyCard` → `React.lazy()` (below fold, 4.2KB)
- Both wrapped in `<Suspense fallback={null}>`

### Bundle Impact
- Main bundle reduced from 303KB → 295KB (-8KB)
- Lazy chunks: 4.2KB + 5.8KB = 10KB total (only loaded when needed)
- Admin bundle unchanged (38KB)

### What's NOT Lazy Loaded
- `ProjectCarousel` — needed on initial view (above fold)
- `Icon` — used everywhere, shared dependency
- `Button` — small, used on initial view
- Motion/Framer — core dependency, can't split

## Part 4: Bundle Awareness

Created `docs/bundle-budget.md` with:
- Current baselines (all chunks documented)
- Warning/critical thresholds
- How to check (simple build command)
- Guidelines for new components

### Thresholds
| Metric | Warning | Critical |
|--------|---------|----------|
| main.js (gzip) | > 120 KB | > 150 KB |
| admin.js (gzip) | > 15 KB | > 25 KB |
| CSS (gzip) | > 10 KB | > 15 KB |
| Total first load | > 220 KB | > 300 KB |
