-- ==========================================
-- 財務管理システム - 最終版 SQL Migration (RLS込み)
-- ==========================================

-- 1. カテゴリーテーブルの作成
CREATE TABLE IF NOT EXISTS categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name_ja TEXT NOT NULL,
  name_zh TEXT NOT NULL,
  icon TEXT NOT NULL, -- Lucideのアイコン名 (例: 'Utensils', 'Car')
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 取引テーブルの作成
CREATE TABLE IF NOT EXISTS transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 行レベルセキュリティ (RLS) の有効化
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- 4. ポリシーの設定 (匿名アクセスを許可)
-- ※ シンプルな運用のための設定です。URLとAnon Keyを知っている人のみが操作可能です。

-- categories: 誰でも読み取り可能
CREATE POLICY "Allow anon select on categories" 
ON categories FOR SELECT 
TO anon 
USING (true);

-- transactions: 誰でも読み取り・作成・更新・削除が可能
CREATE POLICY "Allow anon all on transactions" 
ON transactions FOR ALL 
TO anon 
USING (true) 
WITH CHECK (true);

-- 5. 初期カテゴリーの投入
INSERT INTO categories (name_ja, name_zh, icon) VALUES 
('食費', '餐饮', 'Utensils'),
('日用品', '日用', 'ShoppingBag'),
('交通費', '交通', 'Car'),
('交際費', '娱乐', 'Heart'),
('その他', '其他', 'MoreHorizontal')
ON CONFLICT DO NOTHING;
