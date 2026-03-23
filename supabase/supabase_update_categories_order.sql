-- Run this in your Supabase SQL Editor to add sorting capability

-- 1. Add sort_order column
ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;

-- 2. Update orders for initial categories
-- You can change these numbers to rearrange the items in the grid
UPDATE categories SET sort_order = 10 WHERE name_ja = '食';
UPDATE categories SET sort_order = 20 WHERE name_ja = '日用品';
UPDATE categories SET sort_order = 30 WHERE name_ja = '交通';
UPDATE categories SET sort_order = 40 WHERE name_ja = '娯楽';
UPDATE categories SET sort_order = 50 WHERE name_ja = 'その他';

-- 3. Ensure future categories are ordered
-- The app will now use .order('sort_order', { ascending: true })
