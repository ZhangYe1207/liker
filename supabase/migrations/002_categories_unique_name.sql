-- Add UNIQUE constraint on (user_id, name) to prevent duplicate category names per user.
-- Uses DO block for idempotency since the constraint may already exist in production.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'categories_user_name_unique'
  ) THEN
    ALTER TABLE public.categories
      ADD CONSTRAINT categories_user_name_unique UNIQUE (user_id, name);
  END IF;
END
$$;
