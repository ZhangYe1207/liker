-- Cap conversation title length at 100 chars (DB-side defense in depth).
-- The /api/conversations rename endpoint already validates via Pydantic,
-- but the DB key path goes service-role -> bypass-RLS -> direct insert,
-- so a misbehaving caller could otherwise stash arbitrarily large strings.

alter table public.conversations
  add constraint conversations_title_length
  check (char_length(title) between 1 and 100);
