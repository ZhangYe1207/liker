---
title: "fix: Seed logbook entries for localStorage demo data"
type: fix
status: completed
date: 2026-04-08
---

# fix: Seed logbook entries for localStorage demo data

## Overview

Demo items in localStorage have statuses (completed, in_progress, want) but no corresponding `LogbookEntry` records, so the "活动记录" view is always empty for new users viewing default data.

## Problem Frame

When a new user opens Liker without logging in, they see 25+ demo items across 5 categories. These items have realistic statuses, but the logbook (活动记录) is empty because `LogbookEntry` records are only created when users change status through the UI. This makes the logbook feature appear broken.

## Requirements Trace

- R1. Demo data must include logbook entries that match the demo items' statuses
- R2. Logbook entries should have realistic timestamps spread across the demo items' date range
- R3. Items with status `completed` should show a `null → completed` transition (or a multi-step journey like `null → want → in_progress → completed` for select items to make the logbook more realistic)
- R4. Existing users with real data must not be affected (only seed when logbook is empty AND items are still defaults)

## Scope Boundaries

- No changes to LogbookView component
- No changes to the DataLayer interface
- No changes to types.ts

## Key Technical Decisions

- **Generate entries from demo items programmatically**: Rather than hand-coding each entry, derive logbook entries from the `defaultItems` array by mapping each item's status to appropriate transitions. This keeps demo items and logbook entries in sync.
- **Only seed logbook when key is absent**: Follow the same guard pattern as `loadRaw()` — only populate defaults when `localStorage.getItem(LOGBOOK_KEY)` returns null. An empty array `[]` means the user cleared their logbook intentionally.

## Open Questions

### Resolved During Planning

- **Should multi-step transitions be generated?** Yes, for a subset of `completed` items — e.g., `null → want`, then `want → in_progress`, then `in_progress → completed` — to make the logbook look realistic. Items with `want` or `in_progress` status get a single `null → {status}` entry.

### Deferred to Implementation

- Exact selection of which items get multi-step vs single-step transitions — decide based on what looks natural with the demo data's timestamps

## Implementation Units

- [x] **Unit 1: Add default logbook entries to localStorage data layer**

  **Goal:** Generate and seed `LogbookEntry[]` from `defaultItems` so the logbook is populated for new users

  **Requirements:** R1, R2, R3, R4

  **Files:**
  - Modify: `src/data/localStorage.ts`

  **Approach:**
  - Create a `defaultLogbookEntries` array (or a function that generates it from `defaultItems`)
  - For each demo item:
    - `status: 'want'` → one entry: `null → want` at `createdAt`
    - `status: 'in_progress'` → two entries: `null → want` at `createdAt`, then `want → in_progress` a few days later
    - `status: 'completed'` → two or three entries: `null → want` at `createdAt`, optionally `want → in_progress`, then `→ completed` at `updatedAt` (or a derived date)
    - `status: undefined` (defaults to completed) → single entry: `null → completed` at `createdAt`
    - Items with `rating: 0` and `status: 'want'` → just `null → want`
  - Each entry needs: `id` (deterministic like `'log-' + item.id + '-1'`), `itemId`, `fromStatus`, `toStatus`, `createdAt` (spread realistically)
  - In `loadLogbook()`: if `localStorage.getItem(LOGBOOK_KEY)` is `null`, return the default entries (same pattern as `loadRaw()` returning defaults when `DATA_KEY` is absent)

  **Patterns to follow:**
  - `loadRaw()` function at top of `localStorage.ts` — default data seeding pattern
  - `logStatusChange()` in `src/App.tsx` — the shape of `LogbookEntry` records created at runtime

  **Test scenarios:**
  - Fresh browser (no localStorage): logbook view shows entries matching demo items
  - User who already has logbook data: their entries are untouched
  - User who cleared logbook (empty array `[]` in storage): remains empty (we only seed on `null`, not on empty array)
  - Logbook entries reference valid demo item IDs
  - Timeline in logbook view shows a spread of dates, not all on the same day

  **Verification:**
  - Open app in fresh incognito window → navigate to "活动记录" → entries are visible with realistic dates and status transitions
