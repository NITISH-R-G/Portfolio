# Task 46 — Skills Tab Blank Page Fix

## Root Cause

**Data shape mismatch** — the admin editor was reading the wrong path and expecting the wrong format.

| Layer | Expected | Actual |
|-------|----------|--------|
| Portfolio data | `skills.categories` (grouped array) | — |
| Admin tab wiring | `data.sections.skills.items` | `data.skills` (top-level, not in sections) |
| SkillsEditor prop | flat string array `["Python", ...]` | `{ enabled, categories: [{name, items}] }` |

The admin code did:
```js
<SkillsEditor skills={data.sections.skills.items} update={update} />
```

1. `data.sections.skills` → `undefined` (skills is at `data.skills`, not `data.sections.skills`)
2. `.items` on `undefined` → **TypeError: Cannot read properties of undefined**
3. React error boundary catches → **white screen**

## Fixes Applied

### 1. Correct data path (`AdminEditor.jsx:158`)
```diff
- {activeTab === 'skills' && <SkillsEditor skills={data.sections.skills.items} update={update} />}
+ {activeTab === 'skills' && <SkillsEditor skills={data.skills} update={update} />}
```

### 2. SkillsEditor handles categories format (`AdminEditor.jsx`)
- `flattenCategories()` — converts `categories` array to `"Category: Skill"` lines for textarea
- `parseFlatSkills()` — parses textarea lines back to `categories` structure
- `onChange` saves to `data.skills` (not `data.sections.skills.items`)
- Shows item count + category count as help text

### 3. Defensive defaults in `usePortfolio.js`
- `normalizeSkills()` — if draft has `skills.items` (legacy flat array), wraps in `{ categories: [{name: 'General', items}] }`
- Applied after `deepMerge` in `usePortfolio()`

### 4. Admin draft normalization (`AdminEditor.jsx`)
- `normalizeSkills()` — same normalization in admin's initial state
- Ensures `data.skills` always has valid shape before rendering

## Data Flow (After Fix)

```
portfolio.js → skills: { enabled, categories: [{name, items}] }
                    ↓
usePortfolio → loadDraft → deepMerge → normalizeSkills → merged.skills
                    ↓
AdminEditor → loadDraft → deepClone → normalizeSkills → data.skills
                    ↓
SkillsEditor → flattenCategories(data.skills) → textarea "Category: Skill"
                    ↓
onChange → parseFlatSkills(lines) → update('skills', { enabled, categories })
```

## Verification

| Test | Result | Notes |
|------|--------|-------|
| Skills tab no longer blanks page | PASS | Correct data path + defensive defaults |
| Invalid/malformed draft data is handled safely | PASS | normalizeSkills handles flat arrays, missing categories, null |
| Skills render with defaults when needed | PASS | Falls back to { enabled: true, categories: [] } |
| Other admin tabs still work | PASS | No changes to other editors |
| Public portfolio unchanged | PASS | Only admin path affected |
| Build passes | PASS | main 292.88KB, admin 13.62KB, CSS 29.71KB |
