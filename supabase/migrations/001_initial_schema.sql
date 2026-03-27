-- Liker v1.0 Initial Schema
-- Tables: profiles, categories, items, logbook_entries
-- All tables have RLS enabled with user-scoped policies

-- ============================================================
-- Profiles (auto-created on auth.users insert)
-- ============================================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  preferences jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_profile" ON public.profiles
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);

CREATE POLICY "users_update_own_profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- ============================================================
-- Categories
-- ============================================================
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text NOT NULL DEFAULT '📁',
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_categories" ON public.categories
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "users_insert_own_categories" ON public.categories
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "users_update_own_categories" ON public.categories
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "users_delete_own_categories" ON public.categories
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE INDEX idx_categories_user_id ON public.categories USING btree (user_id);

-- ============================================================
-- Items
-- ============================================================
CREATE TABLE public.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text DEFAULT '',
  rating integer DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  status text DEFAULT 'completed' CHECK (status IN ('want', 'in_progress', 'completed', 'dropped')),
  cover_url text,
  year text,
  genre text,
  external_id text,
  source text CHECK (source IN ('neodb', 'bangumi', 'igdb', 'tmdb', 'steam', 'manual') OR source IS NULL),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_items" ON public.items
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "users_insert_own_items" ON public.items
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "users_update_own_items" ON public.items
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "users_delete_own_items" ON public.items
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE INDEX idx_items_user_id ON public.items USING btree (user_id);
CREATE INDEX idx_items_category_id ON public.items USING btree (category_id);
CREATE INDEX idx_items_status ON public.items USING btree (status);

-- ============================================================
-- Logbook Entries (status change events)
-- ============================================================
CREATE TABLE public.logbook_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.logbook_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_logbook" ON public.logbook_entries
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "users_insert_own_logbook" ON public.logbook_entries
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "users_delete_own_logbook" ON public.logbook_entries
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE INDEX idx_logbook_entries_user_id ON public.logbook_entries USING btree (user_id);
CREATE INDEX idx_logbook_entries_item_id ON public.logbook_entries USING btree (item_id);
CREATE INDEX idx_logbook_entries_created_at ON public.logbook_entries USING btree (created_at DESC);

-- ============================================================
-- Triggers
-- ============================================================

-- Auto-create profile on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER items_updated_at
  BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
