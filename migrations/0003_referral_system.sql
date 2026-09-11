ALTER TABLE referrals ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE referrals ADD COLUMN qualified_at TEXT;
ALTER TABLE referrals ADD COLUMN rewarded_at TEXT;
ALTER TABLE referral_rewards ADD COLUMN status TEXT NOT NULL DEFAULT 'paid';
ALTER TABLE referral_rewards ADD COLUMN qualified_deposit_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_rewards_referral ON referral_rewards(referral_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status, created_at DESC);
INSERT OR IGNORE INTO admin_settings(key,value) VALUES
('referral_enabled','1'),
('referral_reward_minor','500'),
('referral_min_deposit_minor','5000'),
('referral_hold_hours','0'),
('referral_new_user_reward_minor','0'),
('referral_monthly_cap','0');
