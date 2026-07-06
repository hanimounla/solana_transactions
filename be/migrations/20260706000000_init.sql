-- Migration to initialize Solana Indexer Database

CREATE TABLE IF NOT EXISTS indexed_accounts (
    address TEXT PRIMARY KEY,
    last_indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    min_block_time BIGINT,
    max_block_time BIGINT
);

CREATE TABLE IF NOT EXISTS transactions (
    signature TEXT PRIMARY KEY,
    slot BIGINT NOT NULL,
    block_time BIGINT NOT NULL, -- unix timestamp
    err BOOLEAN NOT NULL,
    fee BIGINT NOT NULL, -- lamports
    fee_payer TEXT NOT NULL,
    logs TEXT[] NOT NULL DEFAULT '{}',
    raw_data JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS sol_balance_changes (
    id BIGSERIAL PRIMARY KEY,
    signature TEXT NOT NULL REFERENCES transactions(signature) ON DELETE CASCADE,
    address TEXT NOT NULL,
    pre_balance BIGINT NOT NULL,
    post_balance BIGINT NOT NULL,
    change_amount BIGINT NOT NULL,
    is_signer BOOLEAN NOT NULL,
    is_writable BOOLEAN NOT NULL
);

CREATE TABLE IF NOT EXISTS token_balance_changes (
    id BIGSERIAL PRIMARY KEY,
    signature TEXT NOT NULL REFERENCES transactions(signature) ON DELETE CASCADE,
    address TEXT NOT NULL,
    mint TEXT NOT NULL,
    owner TEXT NOT NULL,
    pre_amount DOUBLE PRECISION NOT NULL,
    post_amount DOUBLE PRECISION NOT NULL,
    change_amount DOUBLE PRECISION NOT NULL,
    decimals INT NOT NULL
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_transactions_block_time ON transactions(block_time);
CREATE INDEX IF NOT EXISTS idx_sol_balance_changes_address ON sol_balance_changes(address);
CREATE INDEX IF NOT EXISTS idx_sol_balance_changes_signature ON sol_balance_changes(signature);
CREATE INDEX IF NOT EXISTS idx_sol_balance_changes_addr_time ON sol_balance_changes(address, signature);
CREATE INDEX IF NOT EXISTS idx_token_balance_changes_owner ON token_balance_changes(owner);
CREATE INDEX IF NOT EXISTS idx_token_balance_changes_signature ON token_balance_changes(signature);
CREATE INDEX IF NOT EXISTS idx_token_balance_changes_owner_time ON token_balance_changes(owner, signature);
