-- Run this in your Supabase SQL Editor

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category TEXT, -- NULL for income
  amount NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS (Optional, for simplicity we assume anon access if keys are secure)
-- ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow anon read/write" ON transactions FOR ALL USING (true);
