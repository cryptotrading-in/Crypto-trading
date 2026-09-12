-- Repair the primary admin username without changing passwords, sessions, users, wallets, or trading data.
-- The existing primary admin email (e.g. bbrihashme@gmail.com) becomes the username prefix (bbrihashme).
UPDATE admin_users
SET username = lower(substr(email, 1, instr(email, '@') - 1))
WHERE username IS NULL
  AND email IS NOT NULL
  AND instr(email, '@') > 1
  AND NOT EXISTS (
    SELECT 1
    FROM admin_users existing
    WHERE existing.username = lower(substr(admin_users.email, 1, instr(admin_users.email, '@') - 1))
  );
