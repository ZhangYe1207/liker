-- Add review column to items and create item_embeddings table for AI features
-- Enables pgvector extension for semantic similarity search

-- ============================================================
-- Enable pgvector extension
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ============================================================
-- Add review column to items
-- ============================================================
ALTER TABLE public.items ADD COLUMN review TEXT DEFAULT '';

-- ============================================================
-- Item Embeddings (one embedding per item for semantic search)
-- ============================================================
CREATE TABLE public.item_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  embedding vector(1536),
  content_hash TEXT NOT NULL,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT uq_item_embeddings_item_id UNIQUE (item_id)
);

ALTER TABLE public.item_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_embeddings" ON public.item_embeddings
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "users_insert_own_embeddings" ON public.item_embeddings
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "users_update_own_embeddings" ON public.item_embeddings
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "users_delete_own_embeddings" ON public.item_embeddings
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE INDEX idx_item_embeddings_embedding ON public.item_embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_item_embeddings_item_id ON public.item_embeddings USING btree (item_id);
CREATE INDEX idx_item_embeddings_user_id ON public.item_embeddings USING btree (user_id);
