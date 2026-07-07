-- Migration to add index on fee_payer for performance optimization in fees calculations
CREATE INDEX IF NOT EXISTS idx_transactions_fee_payer ON transactions(fee_payer);
