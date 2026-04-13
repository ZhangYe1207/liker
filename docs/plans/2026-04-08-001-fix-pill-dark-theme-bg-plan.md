---
title: "fix: Pill and input backgrounds not adapting to dark/colored themes"
type: fix
status: completed
date: 2026-04-08
---

# fix: Pill and input backgrounds not adapting to dark/colored themes

## Overview

Status filter pills (全部/想读/在读/读过/搁置) and a few other elements use hardcoded `#fff` or light-tint backgrounds that don't adapt to non-warm themes. In midnight (dark) theme, white pill backgrounds blend with light text, making them unreadable. Other color themes (frost, sakura, forest) are unaffected for pills since their `--card-bg` is `#fff`, but the delete-confirmation and input focus backgrounds use light tints that would look wrong on midnight.

## Problem Frame

When switching to the midnight (dark) theme, the inactive status filter pills in category detail view have white backgrounds while the text color adapts to light — resulting in invisible/unreadable labels. The user reports other color themes also exhibit issues.

## Requirements Trace

- R1. `.pill` inactive background must adapt to theme
- R2. `.input:focus` background must adapt to theme
- R3. `.cat-delete-btn:hover` background must adapt to theme
- R4. `.list-item-confirming` background must adapt to theme
- R5. `.pill.active` box-shadow should use theme-aware color (currently hardcoded purple rgba)

## Scope Boundaries

- Only fix hardcoded color values that break across themes
- No layout or structural changes
- No new CSS variables — reuse existing theme variables

## Key Technical Decisions

- **Use `var(--card-bg)` for pill and input backgrounds**: Already defined per-theme (`#fff` for light themes, `#1e1b2e` for midnight). Exact semantic match.
- **Use `rgba` with theme-aware approach for tinted backgrounds**: Delete-confirmation and hover states need a subtle tint. Use `var(--coral)` with low-opacity background or define relative to existing variables.

## Implementation Units

- [x] **Unit 1: Fix all hardcoded light backgrounds**

  **Goal:** Replace hardcoded `#fff` and light-tint backgrounds with theme-aware CSS variable equivalents

  **Requirements:** R1, R2, R3, R4, R5

  **Files:**
  - Modify: `src/index.css`

  **Approach:**
  - Line 1294: `.pill` — change `background: #fff` → `background: var(--card-bg)`
  - Line 1282: `.input:focus` — change `background: #fff` → `background: var(--card-bg)`
  - Line 702: `.cat-delete-btn:hover` — change `background: #fff0f0` → `background: rgba(255,107,107,0.08)` (transparent tint works on any background)
  - Line 929: `.list-item-confirming` — change `background: #fff8f8` → `background: rgba(255,107,107,0.08)`
  - Line 1309: `.pill.active` box-shadow — change hardcoded purple `rgba(168,85,247,0.28)` → use a shadow that works across themes, or remove (gradient background is sufficient visual indicator)

  **Patterns to follow:**
  - Existing theme variable usage throughout `index.css` (`var(--card-bg)`, `var(--tint-border)`)
  - Midnight theme defines all variables at `html[data-theme="midnight"]` block (~line 2194)

  **Test scenarios:**
  - Warm theme: pills look identical to current (--card-bg is #fff)
  - Midnight theme: pills have dark background, text is readable
  - Frost/sakura/forest themes: pills render correctly
  - Delete confirmation in both card and list view: subtle red tint visible on all themes
  - Active pill: gradient background + no jarring shadow mismatch on non-purple themes

  **Verification:**
  - Toggle through all 5 themes; no element has a white/light background that clashes with dark surroundings
  - Build succeeds without errors

## System-Wide Impact

- **Minimal**: Pure CSS variable substitution. No JS changes, no type changes, no component restructuring.
- `.pill` class is used in: status filter bar (category detail), time range filter (StatsView), category pills (AddEditModal). All benefit from this fix.
