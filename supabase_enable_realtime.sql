-- Supabase Realtimeを有効化するためのスクリプト
-- これをSupabaseの SQL Editor で実行することで、家族間でのリアルタイム同期が可能になります。

-- 1. transactionsテーブルのレプリカアイデンティティをフル(FULL)に設定（更新・削除の詳細を取得するため）
ALTER TABLE transactions REPLICA IDENTITY FULL;

-- 2. リアルタイムパブリケーションの準備
DO $$
BEGIN
    -- パブリケーションが存在しない場合は作成
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END $$;

-- 3. パブリケーションにテーブルを追加
DO $$
BEGIN
    -- すでにテーブルがパブリケーションに含まれていない場合のみ追加
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'transactions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
    END IF;
END $$;

-- 確認用
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
