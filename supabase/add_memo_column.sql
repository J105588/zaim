-- 履歴にメモ機能を追加するためのスクリプト
-- Supabaseの SQL Editor で実行してください。

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS memo TEXT;

-- PostgRESTのキャッシュを更新
NOTIFY pgrst, 'reload schema';
