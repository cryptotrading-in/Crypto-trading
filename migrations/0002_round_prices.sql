PRAGMA foreign_keys = ON;
ALTER TABLE trading_rounds ADD COLUMN entry_price_micros INTEGER NOT NULL DEFAULT 0;
ALTER TABLE trading_rounds ADD COLUMN exit_price_micros INTEGER NOT NULL DEFAULT 0;

CREATE TRIGGER IF NOT EXISTS trg_round_prices_after_update
AFTER UPDATE OF rules ON trading_rounds
WHEN instr(NEW.rules,'ENTRY_PRICE=')>0 AND instr(NEW.rules,'EXIT_PRICE=')>0
BEGIN
  UPDATE trading_rounds
  SET entry_price_micros=CAST(substr(NEW.rules,instr(NEW.rules,'ENTRY_PRICE=')+12,instr(substr(NEW.rules,instr(NEW.rules,'ENTRY_PRICE=')+12),'|')-1) AS REAL)*1000000,
      exit_price_micros=CAST(substr(NEW.rules,instr(NEW.rules,'EXIT_PRICE=')+11,instr(substr(NEW.rules,instr(NEW.rules,'EXIT_PRICE=')+11),'|')-1) AS REAL)*1000000
  WHERE id=NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_round_prices_after_insert
AFTER INSERT ON trading_rounds
WHEN instr(NEW.rules,'ENTRY_PRICE=')>0 AND instr(NEW.rules,'EXIT_PRICE=')>0
BEGIN
  UPDATE trading_rounds
  SET entry_price_micros=CAST(substr(NEW.rules,instr(NEW.rules,'ENTRY_PRICE=')+12,instr(substr(NEW.rules,instr(NEW.rules,'ENTRY_PRICE=')+12),'|')-1) AS REAL)*1000000,
      exit_price_micros=CAST(substr(NEW.rules,instr(NEW.rules,'EXIT_PRICE=')+11,instr(substr(NEW.rules,instr(NEW.rules,'EXIT_PRICE=')+11),'|')-1) AS REAL)*1000000
  WHERE id=NEW.id;
END;
