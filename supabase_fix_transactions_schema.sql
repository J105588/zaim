-- Supabaseの「category_idが見つからない」というキャッシュエラーを解決するためのスクリプト
-- これをSupabaseの SQL Editor で実行してください。

-- 1. カラムが存在するか確認し、存在しない場合は追加、存在する場合はキャッシュを強制更新します
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='category_id') THEN
        ALTER TABLE transactions ADD COLUMN category_id UUID REFERENCES categories(id) ON DELETE SET NULL;
    ELSE
        -- すでに存在する場合、ダミーの変更を加えてキャッシュを強制更新させます
        ALTER TABLE transactions ALTER COLUMN category_id DROP DEFAULT;
    END IF;
END $$;

-- 2. PostgRESTのキャッシュを明示的にリロード（可能な場合）
NOTIFY pgrst, 'reload schema';

-- 3. （予備）テーブルがまだ作成されていない場合のための作成スクリプト
CREATE TABLE IF NOT EXISTS transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLSの再確認
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on transactions" ON transactions;
CREATE POLICY "Allow anon all on transactions" ON transactions FOR ALL TO anon USING (true) WITH CHECK (true);
