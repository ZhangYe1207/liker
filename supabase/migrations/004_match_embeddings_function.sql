-- SQL function for pgvector similarity search via Supabase RPC
CREATE OR REPLACE FUNCTION match_item_embeddings(
  query_embedding vector(1024),
  match_user_id uuid,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  item_id uuid,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    ie.item_id,
    1 - (ie.embedding <=> query_embedding) AS similarity
  FROM item_embeddings ie
  WHERE ie.user_id = match_user_id
  ORDER BY ie.embedding <=> query_embedding
  LIMIT match_count;
$$;
