CREATE OR REPLACE FUNCTION get_total_balance()
RETURNS numeric AS $$
BEGIN
  RETURN COALESCE(
    SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END),
    0
  );
END;
$$ LANGUAGE plpgsql STABLE;
