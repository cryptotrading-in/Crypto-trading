CREATE TRIGGER IF NOT EXISTS trg_auto_referral_reward_after_deposit
AFTER UPDATE OF status ON deposits
WHEN NEW.status='approved'
 AND OLD.status<>'approved'
 AND COALESCE((SELECT value FROM admin_settings WHERE key='referral_enabled'),'1')='1'
 AND COALESCE((SELECT value FROM admin_settings WHERE key='referral_hold_hours'),'0')='0'
 AND NEW.amount_minor>=COALESCE(CAST((SELECT value FROM admin_settings WHERE key='referral_min_deposit_minor') AS INTEGER),5000)
 AND COALESCE(CAST((SELECT value FROM admin_settings WHERE key='referral_reward_minor') AS INTEGER),500)>0
 AND EXISTS(SELECT 1 FROM referrals r WHERE r.referred_id=NEW.user_id AND r.status='pending')
 AND NOT EXISTS(SELECT 1 FROM referral_rewards rr WHERE rr.referral_id=(SELECT r.id FROM referrals r WHERE r.referred_id=NEW.user_id AND r.status='pending' LIMIT 1))
BEGIN
  UPDATE referrals
  SET status='qualified',qualified_at=COALESCE(reviewed_at,NEW.reviewed_at,CURRENT_TIMESTAMP),rewarded_at=COALESCE(reviewed_at,NEW.reviewed_at,CURRENT_TIMESTAMP)
  WHERE id=(SELECT r.id FROM referrals r WHERE r.referred_id=NEW.user_id AND r.status='pending' LIMIT 1)
    AND status='pending';

  INSERT INTO referral_rewards(id,referral_id,user_id,amount_minor,reason,reference_id,status,qualified_deposit_id)
  SELECT 'auto_'||r.id,r.id,r.referrer_id,
         CAST(COALESCE((SELECT value FROM admin_settings WHERE key='referral_reward_minor'),'500') AS INTEGER),
         'Qualified referral reward',NEW.id,'paid',NEW.id
  FROM referrals r
  WHERE r.referred_id=NEW.user_id
    AND r.status='qualified'
    AND NOT EXISTS(SELECT 1 FROM referral_rewards rr WHERE rr.referral_id=r.id);

  UPDATE wallets
  SET available_minor=available_minor+CAST(COALESCE((SELECT value FROM admin_settings WHERE key='referral_reward_minor'),'500') AS INTEGER),
      updated_at=CURRENT_TIMESTAMP
  WHERE user_id=(SELECT r.referrer_id FROM referrals r WHERE r.referred_id=NEW.user_id AND r.status='qualified' LIMIT 1);

  INSERT INTO bonuses(id,user_id,type,amount_minor,reason,reference_id)
  SELECT 'auto_bonus_'||r.id,r.referrer_id,'referral',
         CAST(COALESCE((SELECT value FROM admin_settings WHERE key='referral_reward_minor'),'500') AS INTEGER),
         'Qualified referral reward',r.id
  FROM referrals r
  WHERE r.referred_id=NEW.user_id
    AND r.status='qualified'
    AND NOT EXISTS(SELECT 1 FROM bonuses b WHERE b.reference_id=r.id AND b.type='referral');

  INSERT INTO wallet_transactions(id,user_id,type,amount_minor,available_after_minor,reserved_after_minor,reference_type,reference_id,reason)
  SELECT 'auto_tx_'||r.id,r.referrer_id,'referral_reward',
         CAST(COALESCE((SELECT value FROM admin_settings WHERE key='referral_reward_minor'),'500') AS INTEGER),
         w.available_minor,w.reserved_minor,'referral',r.id,'Qualified referral reward'
  FROM referrals r
  JOIN wallets w ON w.user_id=r.referrer_id
  WHERE r.referred_id=NEW.user_id
    AND r.status='qualified'
    AND NOT EXISTS(SELECT 1 FROM wallet_transactions wt WHERE wt.reference_type='referral' AND wt.reference_id=r.id AND wt.type='referral_reward');

  INSERT INTO notifications(id,user_id,type,title,body)
  SELECT 'auto_notify_'||r.id,r.referrer_id,'referral','Referral reward credited',
         'Your referral qualified after an approved deposit. '||printf('%.2f',CAST(COALESCE((SELECT value FROM admin_settings WHERE key='referral_reward_minor'),'500') AS INTEGER)/100.0)||' USDT has been added to your wallet.'
  FROM referrals r
  WHERE r.referred_id=NEW.user_id
    AND r.status='qualified'
    AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.id='auto_notify_'||r.id);
END;
