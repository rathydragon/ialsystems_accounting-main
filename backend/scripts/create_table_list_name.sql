-- ====================================================================
-- PostgreSQL Database Migration: Rename/Create table 'list_name'
-- បម្លែងឈ្មោះ Database Table ពី 'payers' មកជា 'list_name'
-- ====================================================================

DO $$
BEGIN
  -- ប្រសិនបើមានតារាងចាស់ឈ្មោះ payers សូម rename មក list_name
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payers') THEN
    ALTER TABLE public.payers RENAME TO list_name;
  END IF;
END $$;

-- បង្កើតតារាង list_name ប្រសិនបើមិនទាន់មាន
CREATE TABLE IF NOT EXISTS public.list_name (
  id VARCHAR(255) PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  category TEXT DEFAULT 'OTHER',
  area TEXT,
  status TEXT DEFAULT 'ACTIVE',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes សម្រាប់ស្វែងរកលឿន
CREATE INDEX IF NOT EXISTS idx_list_name_name ON public.list_name(name);
CREATE INDEX IF NOT EXISTS idx_list_name_status ON public.list_name(status);
CREATE INDEX IF NOT EXISTS idx_list_name_category ON public.list_name(category);

-- បើកសិទ្ធិ Row Level Security (RLS)
ALTER TABLE public.list_name ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public access on list_name" ON public.list_name;
CREATE POLICY "Public access on list_name" ON public.list_name FOR ALL USING (true) WITH CHECK (true);
