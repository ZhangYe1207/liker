---
date: 2026-03-27
topic: liker-v1-evolution
---

# Liker v1.0: Personal Media Tracker for Chinese Users

## Problem Frame

Chinese users who want to track books, movies, music, and games across categories lack a polished, private, all-in-one solution. Douban is aging and censored; NeoDB is technical/niche; Sofa and BacklogBox are English-only. Liker currently stores data in localStorage with no sync, no metadata enrichment, and no activity tracking -- it's a promising prototype but not yet a product people would rely on daily.

## Product Positioning

A **private-first personal media tracker** for Chinese users, inspired by Sofa's polish and BacklogBox's organization. Not a social rating platform (no public profiles, no mass reviews). Future phases add friends-only sharing and smart recommendations, but v1.0 is about making the core personal experience excellent.

**Competitive moat**: Chinese-locale metadata + zero-friction personal use + Supabase-powered sync across devices.

## Requirements

### R1. User Accounts & Cloud Sync (Supabase)

- R1.1. Users can sign up / log in via email + password, with optional OAuth (GitHub, Google)
- R1.2. All item, category, and preference data syncs to Supabase Postgres in real-time
- R1.3. Existing localStorage data can be migrated to a new account on first login (one-time import)
- R1.4. App remains usable without login (localStorage mode) but shows a prompt to sign up for sync
- R1.5. Auth state persists across browser sessions via Supabase session management

### R2. Auto-Metadata Enrichment

- R2.1. When adding a new item, user can search by title. Results show cover image, description, year, and genre
- R2.2. Data sources by category:
  - Movies/TV: TMDB API (Chinese locale `zh-CN`) -- primary
  - Books: OpenLibrary API -- primary; NeoDB API -- fallback for Chinese books
  - Games: IGDB API -- primary; Steam store data -- supplementary
  - Music: iTunes Search API (existing) + NeoDB/Bangumi -- fallback
  - Anime/Manga: Bangumi API -- primary
- R2.3. User selects a search result to auto-fill: title, cover image, description, year, genre/tags
- R2.4. User can still manually create items without searching (current behavior preserved)
- R2.5. Cover images are stored as external URLs (no self-hosting). Proxy via Supabase Edge Function if CORS is an issue

### R3. Logbook & Status Tracking

- R3.1. Each item has a status: `want` / `in-progress` / `completed` / `dropped` (default: `completed` for newly added items)
- R3.2. Status changes are logged with timestamps in an activity log (logbook)
- R3.3. Logbook view: chronological timeline of "what I consumed and when", filterable by category and status
- R3.4. Items display their current status as a visual badge
- R3.5. Category detail page can be filtered by status
- R3.6. Rating is only prompted/shown for items marked `completed`

## Success Criteria

- Users can sign up, add items by searching Chinese titles, and see them synced on another device
- A user who has tracked 50+ items can browse their logbook and get a meaningful timeline of their consumption history
- Metadata search returns relevant Chinese results for mainstream movies, books, and games (>80% hit rate for top-100 titles)

## Scope Boundaries

**In scope (v1.0):**
- Supabase backend (Auth + Postgres + Edge Functions)
- Metadata search & auto-fill for all existing categories
- Logbook with status tracking
- Migration path from localStorage to cloud

**Out of scope (deferred to v2.0+):**
- Friends-only social / sharing
- Themes / UI customization
- Year in Review / annual stats
- Smart / personalized recommendations (beyond current seed-based)
- PWA / offline-first with service worker
- Douban data import
- Push notifications

## Key Decisions

- **Backend: Supabase** -- Postgres + Auth + Realtime + Edge Functions. Mature ecosystem, good free tier, can self-host later
- **Metadata strategy: international APIs + Chinese fallback** -- TMDB/OpenLibrary/IGDB as stable primary sources (Chinese locale); NeoDB/Bangumi as supplementary for Chinese-specific content
- **No Douban scraping** -- Legally gray and fragile. NeoDB already aggregates Douban data via legal means
- **Local-mode preserved** -- App works without login for zero-friction onboarding. Backend is an upgrade, not a gate
- **Status model over simple rating** -- Adding want/in-progress/completed/dropped transforms Liker from a "list" into a "tracker"

## Dependencies / Assumptions

- Supabase free tier is sufficient for initial user base (<10k users)
- TMDB, OpenLibrary, IGDB APIs remain free and stable
- NeoDB API is publicly accessible (currently is, but single-maintainer project)
- Bangumi API requires registration but is free

## Outstanding Questions

### Resolve Before Planning

(None -- all product decisions resolved)

### Deferred to Planning

- [Affects R1][Technical] Supabase schema design: how to model items, categories, logbook entries, and user preferences in Postgres
- [Affects R1][Technical] Real-time sync strategy: optimistic updates vs. server-first
- [Affects R1][Needs research] OAuth providers: which to enable (Google, GitHub, WeChat?)
- [Affects R2][Needs research] NeoDB API rate limits and authentication requirements
- [Affects R2][Needs research] Bangumi API capabilities and Chinese content coverage
- [Affects R2][Technical] Edge Function architecture for metadata proxy (CORS, caching, rate limiting)
- [Affects R3][Technical] Logbook data model: separate table vs. event-sourced status changes
- [Affects R1][Technical] localStorage-to-Supabase migration: conflict resolution when merging

## Roadmap Context

| Phase | Focus | Key Features |
|-------|-------|-------------|
| **v1.0** (this) | Core personal tracker | Accounts, sync, metadata, logbook |
| **v2.0** | Delight & identity | Themes, Year in Review, stats dashboard, PWA |
| **v3.0** | Social & discovery | Friends-only sharing, smart recommendations, activity feed |

## Next Steps

-> `/ce:plan` for structured implementation planning
