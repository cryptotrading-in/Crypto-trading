PRAGMA foreign_keys = ON;
INSERT OR IGNORE INTO admin_settings(key,value) VALUES ('minimum_deposit_minor','3000'),('minimum_withdrawal_minor','1000'),('preferred_network','TRC20');
INSERT OR IGNORE INTO trading_cycles(id,starts_at,ends_at,status) VALUES ('default-cycle','2026-09-10T00:00:00.000Z','2026-09-11T00:00:00.000Z','scheduled');
INSERT OR IGNORE INTO trading_rounds(id,cycle_id,round_no,enabled,asset,action,start_at,duration_seconds,profit_bps,fee_bps,rules,status) VALUES
('round-1','default-cycle',1,1,'BTC/USDT','BUY','2026-09-10T01:00:00.000Z',300,500,50,'Entry closes 60 seconds after round start. Settlement follows configured round rules.','upcoming'),
('round-2','default-cycle',2,1,'ETH/USDT','SELL','2026-09-10T05:00:00.000Z',300,500,50,'Entry closes 60 seconds after round start. Settlement follows configured round rules.','upcoming'),
('round-3','default-cycle',3,1,'SOL/USDT','BUY','2026-09-10T09:00:00.000Z',300,500,50,'Entry closes 60 seconds after round start. Settlement follows configured round rules.','upcoming'),
('round-4','default-cycle',4,1,'BTC/USDT','SELL','2026-09-10T13:00:00.000Z',300,500,50,'Entry closes 60 seconds after round start. Settlement follows configured round rules.','upcoming'),
('round-5','default-cycle',5,1,'ETH/USDT','BUY','2026-09-10T17:00:00.000Z',300,500,50,'Entry closes 60 seconds after round start. Settlement follows configured round rules.','upcoming');