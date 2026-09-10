PRAGMA foreign_keys = ON;
ALTER TABLE trading_rounds ADD COLUMN entry_price_micros INTEGER NOT NULL DEFAULT 0;
ALTER TABLE trading_rounds ADD COLUMN exit_price_micros INTEGER NOT NULL DEFAULT 0;
