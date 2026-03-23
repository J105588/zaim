-- Run this in your Supabase SQL Editor

-- 1. Create categories table
CREATE TABLE IF NOT EXISTS categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name_ja TEXT NOT NULL,
  name_zh TEXT NOT NULL,
  icon TEXT NOT NULL, -- Lucide icon name like 'Utensils', 'Car', etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Initial categories
INSERT INTO categories (name_ja, name_zh, icon) VALUES 
('食', '餐饮', 'Utensils'),
('日用品', '日用', 'ShoppingBag'),
('交通', '交通', 'Car'),
('娯楽', '娱乐', 'Heart'),
('その他', '其他', 'MoreHorizontal');

-- Optional: Enable RLS (for simplicity assumes anon access if keys are secure)
-- ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow anon read" ON categories FOR SELECT USING (true);
-- CREATE POLICY "Allow anon read/write" ON transactions FOR ALL USING (true);
