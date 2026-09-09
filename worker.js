const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...extra } });
const ok = data => json({ ok: true, ...data });
const fail = (message, status = 400) => json({ ok: false, error: message }, status);
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const money = n => Math.round(Number(n) * 100);
const displayMoney = n => (Number(n || 0) / 100).toFixed(2);

async function hash(value, salt = crypto.randomUUID()) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(value), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name:'PBKDF2', salt:enc.encode(salt), iterations:120000, hash:'SHA-256' }, base, 256);
  return `${salt}:${[...new Uint8Array(bits)].map(x=>x.toString(16).padStart(2,'0')).join('')}`;
}
async function verify(value, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, digest] = stored.split(':');
  const check = await hash(value, salt);
  return check === `${salt}:${digest}`;
}
function cookie(name, value, maxAge) { return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`; }
function clearCookie(name) { return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`; }
async function body(req) { try { return await req.json(); } catch { return {}; } }
async function setting(db, key, fallback='') { const r=await db.prepare('SELECT value FROM admin_settings WHERE key=?').bind(key).first(); return r?.value ?? fallback; }
async function audit(db, actorType, actorId, action, targetType='', targetId='', metadata={}) { await db.prepare('INSERT INTO audit_logs(id,actor_type,actor_id,action,target_type,target_id,metadata) VALUES(?,?,?,?,?,?,?)').bind(id(),actorType,actorId,action,targetType,targetId,JSON.stringify(metadata)).run(); }

async function session(req, env) {
  const raw = req.headers.get('Cookie')?.match(/ct_session=([^;]+)/)?.[1];
  if (!raw) return null;
  const s = await env.DB.prepare('SELECT * FROM sessions WHERE id=? AND expires_at>?').bind(decodeURIComponent(raw), now()).first();
  return s || null;
}
async function requireClient(req, env) { const s=await session(req,env); if(!s?.user_id) throw new Error('AUTH_REQUIRED'); return s; }
async function requireAdmin(req, env) { const s=await session(req,env); if(!s?.admin_id) throw new Error('ADMIN_REQUIRED'); return s; }

async function signup(req, env) {
  const b=await body(req);
  if(!b.email || !b.password || !b.fullName) return fail('Full name, email and password are required.');
  if(String(b.password).length < 8) return fail('Password must be at least 8 characters.');
  const exists=await env.DB.prepare('SELECT id FROM users WHERE lower(email)=lower(?)').bind(b.email.trim()).first();
  if(exists) return fail('An account with this email already exists.',409);
  const uid=id();
  const ph=await hash(b.password);
  const recovery=b.recoveryPin && /^\d{4}$/.test(String(b.recoveryPin)) ? await hash(String(b.recoveryPin)) : null;
  const referralCode=`CT${uid.replaceAll('-','').slice(0,8).toUpperCase()}`;
  const referredBy=b.referralCode ? (await env.DB.prepare('SELECT id FROM users WHERE referral_code=?').bind(b.referralCode).first())?.id || null : null;
  await env.DB.batch([
    env.DB.prepare('INSERT INTO users(id,email,password_hash,full_name,phone,country,referral_code,referred_by,signup_ip_hash,device_fingerprint) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(uid,b.email.trim().toLowerCase(),ph,b.fullName.trim(),b.phone||null,b.country||null,referralCode,referredBy,null,b.deviceFingerprint||null),
    env.DB.prepare('INSERT INTO profiles(user_id,recovery_pin_hash) VALUES(?,?)').bind(uid,recovery),
    env.DB.prepare('INSERT INTO wallets(user_id) VALUES(?)').bind(uid),
    env.DB.prepare('INSERT INTO notifications(id,user_id,type,title,body) VALUES(?,?,?,?,?)').bind(id(),uid,'security','Welcome','Your account was created successfully.')
  ]);
  if(referredBy) await env.DB.prepare('INSERT OR IGNORE INTO referrals(id,referrer_id,referred_id) VALUES(?,?,?)').bind(id(),referredBy,uid).run();
  const sid=id(); const exp=new Date(Date.now()+7*86400000).toISOString();
  await env.DB.prepare('INSERT INTO sessions(id,user_id,expires_at) VALUES(?,?,?)').bind(sid,uid,exp).run();
  await audit(env.DB,'client',uid,'signup','user',uid,{});
  return ok({ user:{id:uid,email:b.email.trim().toLowerCase(),fullName:b.fullName,referralCode}, sessionCookie:cookie('ct_session',sid,7*86400) });
}

async function login(req, env) {
  const b=await body(req); if(!b.email || !b.password) return fail('Email and password are required.');
  const u=await env.DB.prepare('SELECT * FROM users WHERE lower(email)=lower(?)').bind(b.email.trim()).first();
  if(!u || u.account_status!=='active' || !(await verify(b.password,u.password_hash))) return fail('Invalid email or password.',401);
  const sid=id(), exp=new Date(Date.now()+7*86400000).toISOString();
  await env.DB.prepare('INSERT INTO sessions(id,user_id,expires_at) VALUES(?,?,?)').bind(sid,u.id,exp).run();
  await audit(env.DB,'client',u.id,'login','user',u.id,{});
  return ok({user:{id:u.id,email:u.email,fullName:u.full_name},sessionCookie:cookie('ct_session',sid,7*86400)});
}

async function adminLogin(req, env) {
  const b=await body(req); if(!b.identifier || !b.password) return fail('Username/email and password are required.');
  const a=await env.DB.prepare('SELECT * FROM admin_users WHERE (lower(username)=lower(?) OR lower(email)=lower(?)) AND enabled=1').bind(b.identifier.trim(),b.identifier.trim()).first();
  if(!a || !(await verify(b.password,a.password_hash))) return fail('Invalid admin credentials.',401);
  const sid=id(), exp=new Date(Date.now()+8*3600000).toISOString();
  await env.DB.prepare('INSERT INTO sessions(id,admin_id,expires_at) VALUES(?,?,?)').bind(sid,a.id,exp).run();
  await audit(env.DB,'admin',a.id,'login','admin',a.id,{});
  return ok({admin:{id:a.id,username:a.username,email:a.email,role:a.role},sessionCookie:cookie('ct_session',sid,8*3600)});
}

async function bootstrapAdmin(req, env) {
  const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM admin_users').first();
  if(Number(count?.n||0)>0) return fail('Primary administrator is already configured.',409);
  const b=await body(req);
  if(!b.email || !b.password || !/^\d{4}$/.test(String(b.recoveryPin||''))) return fail('Email, password and 4-digit recovery PIN are required.');
  const a=id();
  await env.DB.prepare('INSERT INTO admin_users(id,email,password_hash,recovery_pin_hash,is_primary) VALUES(?,?,?,?,1)').bind(a,b.email.trim().toLowerCase(),await hash(b.password),await hash(String(b.recoveryPin))).run();
  return ok({created:true});
}

async function wallet(db, userId) { return await db.prepare('SELECT available_minor,reserved_minor FROM wallets WHERE user_id=?').bind(userId).first(); }
async function rounds(db, balanceMinor) {
  const rows=await db.prepare(`SELECT r.*, c.starts_at cycle_start, c.ends_at cycle_end FROM trading_rounds r JOIN trading_cycles c ON c.id=r.cycle_id ORDER BY r.round_no`).all();
  const thresholds=[5000,10000,15000,20000,25000];
  return (rows.results||[]).map(r=>({...r,threshold_minor:thresholds[r.round_no-1],unlocked:Number(balanceMinor)>=thresholds[r.round_no-1]}));
}
async function clientMe(req, env) {
  const s=await requireClient(req,env); const u=await env.DB.prepare('SELECT id,email,full_name,phone,country,referral_code,referred_by,account_status,created_at FROM users WHERE id=?').bind(s.user_id).first();
  const w=await wallet(env.DB,s.user_id); const p=await env.DB.prepare('SELECT withdrawal_address FROM profiles WHERE user_id=?').bind(s.user_id).first();
  return ok({user:u,wallet:{available:displayMoney(w?.available_minor),reserved:displayMoney(w?.reserved_minor)},withdrawalAddress:p?.withdrawal_address||'',rounds:await rounds(env.DB,w?.available_minor||0)});
}

async function deposit(req, env) {
  const s=await requireClient(req,env), b=await body(req), amount=money(b.amount);
  const min=Number(await setting(env.DB,'minimum_deposit_minor','3000'));
  if(!['TRC20','ERC20'].includes(b.network) || amount<min || !b.txid) return fail(`Minimum deposit is ${displayMoney(min)} USDT and TXID is required.`);
  const addr=await setting(env.DB,b.network==='TRC20'?'trc20_deposit_address':'erc20_deposit_address','');
  if(!addr) return fail('Deposit address is not configured yet.',503);
  const did=id();
  await env.DB.prepare('INSERT INTO deposits(id,user_id,network,deposit_address,amount_minor,txid,receipt_key,status) VALUES(?,?,?,?,?,?,?,?)').bind(did,s.user_id,b.network,addr,amount,b.txid.trim(),b.receiptKey||null,'submitted').run();
  await env.DB.prepare('INSERT INTO notifications(id,user_id,type,title,body) VALUES(?,?,?,?,?)').bind(id(),s.user_id,'deposit','Deposit received','Your deposit is awaiting review.').run();
  await audit(env.DB,'client',s.user_id,'deposit_submitted','deposit',did,{amount,network:b.network});
  return ok({depositId:did,status:'submitted'});
}

async function withdrawal(req, env) {
  const s=await requireClient(req,env), b=await body(req), amount=money(b.amount), min=Number(await setting(env.DB,'minimum_withdrawal_minor','1000'));
  if(amount<min) return fail(`Minimum withdrawal is ${displayMoney(min)} USDT.`);
  if(!/^\d{4}$/.test(String(b.pin||''))) return fail('A 4-digit withdrawal PIN is required.');
  const p=await env.DB.prepare('SELECT * FROM profiles WHERE user_id=?').bind(s.user_id).first();
  if(!p?.withdrawal_address) return fail('Set your withdrawal address in Wallet Settings first.');
  if(!await verify(String(b.pin),p.withdrawal_pin_hash)) return fail('Incorrect withdrawal PIN.',403);
  const w=await wallet(env.DB,s.user_id); if(Number(w?.available_minor||0)<amount) return fail('Insufficient available balance.',409);
  const wid=id();
  const newAvail=Number(w.available_minor)-amount, newReserved=Number(w.reserved_minor)+amount;
  await env.DB.batch([
    env.DB.prepare('UPDATE wallets SET available_minor=?,reserved_minor=?,updated_at=? WHERE user_id=? AND available_minor>=?').bind(newAvail,newReserved,now(),s.user_id,amount),
    env.DB.prepare('INSERT INTO withdrawals(id,user_id,amount_minor,address) VALUES(?,?,?,?)').bind(wid,s.user_id,amount,p.withdrawal_address),
    env.DB.prepare('INSERT INTO wallet_transactions(id,user_id,type,amount_minor,available_after_minor,reserved_after_minor,reference_type,reference_id,reason) VALUES(?,?,?,?,?,?,?,?,?)').bind(id(),s.user_id,'withdrawal_reserve',-amount,newAvail,newReserved,'withdrawal',wid,'Withdrawal reservation')
  ]);
  await audit(env.DB,'client',s.user_id,'withdrawal_requested','withdrawal',wid,{amount});
  return ok({withdrawalId:wid,status:'pending'});
}

async function walletSettings(req, env) {
  const s=await requireClient(req,env), b=await body(req);
  if(b.withdrawalAddress!==undefined) await env.DB.prepare('UPDATE profiles SET withdrawal_address=?,updated_at=? WHERE user_id=?').bind(String(b.withdrawalAddress).trim(),now(),s.user_id).run();
  if(b.withdrawalPin!==undefined){ if(!/^\d{4}$/.test(String(b.withdrawalPin))) return fail('Withdrawal PIN must be exactly 4 digits.'); await env.DB.prepare('UPDATE profiles SET withdrawal_pin_hash=?,updated_at=? WHERE user_id=?').bind(await hash(String(b.withdrawalPin)),now(),s.user_id).run(); }
  return ok({saved:true});
}

async function adminSummary(req,env){await requireAdmin(req,env); const [u,d,w,t,b]=await Promise.all([
  env.DB.prepare('SELECT COUNT(*) n FROM users').first(),env.DB.prepare("SELECT COUNT(*) n FROM deposits WHERE status IN ('submitted','reviewing')").first(),env.DB.prepare("SELECT COUNT(*) n FROM withdrawals WHERE status IN ('pending','approved','processing')").first(),env.DB.prepare('SELECT COUNT(*) n FROM trades').first(),env.DB.prepare('SELECT COALESCE(SUM(amount_minor),0) n FROM bonuses').first()]);
 return ok({summary:{clients:Number(u.n),pendingDeposits:Number(d.n),pendingWithdrawals:Number(w.n),trades:Number(t.n),bonuses:displayMoney(b.n)}});}

async function adminList(req,env,type){const s=await requireAdmin(req,env); let rows=[];
 if(type==='deposits') rows=(await env.DB.prepare(`SELECT d.*,u.full_name,u.email FROM deposits d JOIN users u ON u.id=d.user_id ORDER BY d.submitted_at DESC LIMIT 200`).all()).results||[];
 if(type==='withdrawals') rows=(await env.DB.prepare(`SELECT w.*,u.full_name,u.email FROM withdrawals w JOIN users u ON u.id=w.user_id ORDER BY w.requested_at DESC LIMIT 200`).all()).results||[];
 if(type==='users') rows=(await env.DB.prepare(`SELECT u.id,u.email,u.full_name,u.phone,u.country,u.created_at,u.account_status,w.available_minor,w.reserved_minor,p.withdrawal_address FROM users u JOIN wallets w ON w.user_id=u.id LEFT JOIN profiles p ON p.user_id=u.id ORDER BY u.created_at DESC LIMIT 500`).all()).results||[];
 return ok({rows});}

async function adminReviewDeposit(req,env){const s=await requireAdmin(req,env), b=await body(req); const d=await env.DB.prepare('SELECT * FROM deposits WHERE id=?').bind(b.id).first(); if(!d||d.status==='approved') return fail('Deposit not found or already approved.',404); if(!['approved','rejected'].includes(b.status)) return fail('Invalid status.');
 if(b.status==='rejected'){await env.DB.prepare('UPDATE deposits SET status=?,admin_note=?,reviewed_at=? WHERE id=?').bind('rejected',b.note||null,now(),d.id).run(); await audit(env.DB,'admin',s.admin_id,'deposit_rejected','deposit',d.id,{}); return ok({status:'rejected'});}
 const w=await wallet(env.DB,d.user_id), credit=Number(d.amount_minor), bonusMin=Number(await setting(env.DB,'deposit_bonus_min_minor','0')), bonusBps=Number(await setting(env.DB,'deposit_bonus_bps','0'));
 const bonus=credit>=bonusMin && bonusBps>0 ? Math.floor(credit*bonusBps/10000) : 0; const total=credit+bonus; const avail=Number(w.available_minor)+total;
 const txs=[env.DB.prepare('UPDATE deposits SET status="approved",admin_note=?,reviewed_at=? WHERE id=?').bind(b.note||null,now(),d.id),env.DB.prepare('UPDATE wallets SET available_minor=?,updated_at=? WHERE user_id=?').bind(avail,now(),d.user_id),env.DB.prepare('INSERT INTO wallet_transactions(id,user_id,type,amount_minor,available_after_minor,reserved_after_minor,reference_type,reference_id,reason) VALUES(?,?,?,?,?,?,?,?,?)').bind(id(),d.user_id,'deposit',credit,avail,w.reserved_minor,'deposit',d.id,'Approved deposit')];
 if(bonus){txs.push(env.DB.prepare('INSERT INTO bonuses(id,user_id,type,amount_minor,reason,reference_id) VALUES(?,?,?,?,?,?)').bind(id(),d.user_id,'deposit',bonus,'Deposit bonus',d.id));txs.push(env.DB.prepare('INSERT INTO wallet_transactions(id,user_id,type,amount_minor,available_after_minor,reserved_after_minor,reference_type,reference_id,reason) VALUES(?,?,?,?,?,?,?,?,?)').bind(id(),d.user_id,'bonus',bonus,avail,w.reserved_minor,'bonus',d.id,'Deposit bonus'));}
 txs.push(env.DB.prepare('INSERT INTO notifications(id,user_id,type,title,body) VALUES(?,?,?,?,?)').bind(id(),d.user_id,'deposit','Deposit approved',`Your deposit of ${displayMoney(credit)} USDT was credited.`)); await env.DB.batch(txs); await audit(env.DB,'admin',s.admin_id,'deposit_approved','deposit',d.id,{credit,bonus}); return ok({status:'approved',credited:displayMoney(total)});
}

async function adminWithdrawal(req,env){const s=await requireAdmin(req,env),b=await body(req),w=await env.DB.prepare('SELECT * FROM withdrawals WHERE id=?').bind(b.id).first(); if(!w) return fail('Withdrawal not found.',404);
 if(!['approved','processing','completed','rejected'].includes(b.status)) return fail('Invalid status.');
 const current=w.status;
 if(b.status==='rejected' && !['completed','rejected'].includes(current)) { const wal=await wallet(env.DB,w.user_id); const avail=Number(wal.available_minor)+Number(w.amount_minor), reserved=Math.max(0,Number(wal.reserved_minor)-Number(w.amount_minor)); await env.DB.batch([env.DB.prepare('UPDATE withdrawals SET status=?,admin_note=? WHERE id=?').bind('rejected',b.note||null,w.id),env.DB.prepare('UPDATE wallets SET available_minor=?,reserved_minor=?,updated_at=? WHERE user_id=?').bind(avail,reserved,now(),w.user_id),env.DB.prepare('INSERT INTO wallet_transactions(id,user_id,type,amount_minor,available_after_minor,reserved_after_minor,reference_type,reference_id,reason) VALUES(?,?,?,?,?,?,?,?,?)').bind(id(),w.user_id,'withdrawal_release',w.amount_minor,avail,reserved,'withdrawal',w.id,'Rejected withdrawal released')]); }
 else { await env.DB.prepare('UPDATE withdrawals SET status=?,admin_note=?,completed_at=? WHERE id=?').bind(b.status,b.note||null,b.status==='completed'?now():null,w.id).run(); if(b.status==='completed'){const wal=await wallet(env.DB,w.user_id), reserved=Math.max(0,Number(wal.reserved_minor)-Number(w.amount_minor)); await env.DB.prepare('UPDATE wallets SET reserved_minor=?,updated_at=? WHERE user_id=?').bind(reserved,now(),w.user_id).run(); await env.DB.prepare('INSERT INTO wallet_transactions(id,user_id,type,amount_minor,available_after_minor,reserved_after_minor,reference_type,reference_id,reason) VALUES(?,?,?,?,?,?,?,?,?)').bind(id(),w.user_id,'withdrawal_completed',-w.amount_minor,wal.available_minor,reserved,'withdrawal',w.id,'Withdrawal completed').run(); }}
 await env.DB.prepare('INSERT INTO notifications(id,user_id,type,title,body) VALUES(?,?,?,?,?)').bind(id(),w.user_id,'withdrawal','Withdrawal update',`Your withdrawal is now ${b.status}.`).run(); await audit(env.DB,'admin',s.admin_id,'withdrawal_status','withdrawal',w.id,{from:current,to:b.status}); return ok({status:b.status});
}

async function adminAdjustBalance(req,env){const s=await requireAdmin(req,env),b=await body(req),amount=money(b.amount); if(!b.userId||!amount||!b.type) return fail('Client, amount and adjustment type are required.'); if(!['credit','debit'].includes(b.type)) return fail('Invalid adjustment type.'); const w=await wallet(env.DB,b.userId); if(!w) return fail('Client not found.',404); const delta=b.type==='credit'?amount:-amount; if(b.type==='debit'&&Number(w.available_minor)<amount) return fail('Insufficient client balance.',409); const avail=Number(w.available_minor)+delta; await env.DB.batch([env.DB.prepare('UPDATE wallets SET available_minor=?,updated_at=? WHERE user_id=?').bind(avail,now(),b.userId),env.DB.prepare('INSERT INTO wallet_transactions(id,user_id,type,amount_minor,available_after_minor,reserved_after_minor,reason) VALUES(?,?,?,?,?,?,?)').bind(id(),b.userId,b.type==='credit'?'admin_credit':'admin_debit',delta,avail,w.reserved_minor,b.reason||'Admin balance adjustment')]); await audit(env.DB,'admin',s.admin_id,b.type==='credit'?'balance_credit':'balance_debit','user',b.userId,{amount,reason:b.reason||''}); return ok({balance:displayMoney(avail)});}

async function settings(req,env){const s=await requireAdmin(req,env),b=await body(req); const allowed=['minimum_deposit_minor','minimum_withdrawal_minor','deposit_bonus_min_minor','deposit_bonus_bps','referral_reward_minor','trc20_deposit_address','erc20_deposit_address','preferred_network','whatsapp_1','whatsapp_2','whatsapp_3']; const stm=[]; for(const k of allowed) if(b[k]!==undefined) stm.push(env.DB.prepare('INSERT INTO admin_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(k,String(b[k]),now())); if(stm.length) await env.DB.batch(stm); await audit(env.DB,'admin',s.admin_id,'settings_update','settings','',b); return ok({saved:true});}
async function getSettings(req,env){await requireAdmin(req,env); const r=await env.DB.prepare('SELECT key,value FROM admin_settings').all(); return ok({settings:Object.fromEntries((r.results||[]).map(x=>[x.key,x.value]))});}

async function adminCreateUser(req,env){const s=await requireAdmin(req,env),b=await body(req); if(!b.username||!b.password) return fail('Username and password required.'); const exists=await env.DB.prepare('SELECT id FROM admin_users WHERE lower(username)=lower(?)').bind(b.username.trim()).first(); if(exists) return fail('Username already exists.',409); const aid=id(); await env.DB.prepare('INSERT INTO admin_users(id,username,password_hash,role,enabled,is_primary) VALUES(?,?,?,?,0,0)').bind(aid,b.username.trim(),await hash(b.password),b.role||'admin').run(); await audit(env.DB,'admin',s.admin_id,'admin_user_created','admin',aid,{username:b.username}); return ok({id:aid});}

async function route(req,env){const u=new URL(req.url), p=u.pathname;
 try{
  if(req.method==='OPTIONS') return new Response('',{status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'Content-Type','access-control-allow-credentials':'true'}});
  if(p==='/api/health') return ok({service:'crypto-trading-api',time:now()});
  if(p==='/api/auth/signup'&&req.method==='POST') return signup(req,env);
  if(p==='/api/auth/login'&&req.method==='POST') return login(req,env);
  if(p==='/api/auth/admin-login'&&req.method==='POST') return adminLogin(req,env);
  if(p==='/api/auth/bootstrap-admin'&&req.method==='POST') return bootstrapAdmin(req,env);
  if(p==='/api/auth/logout'){const s=await session(req,env); if(s) await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(s.id).run(); return new Response(null,{status:204,headers:{'Set-Cookie':clearCookie('ct_session')}});}
  if(p==='/api/client/me') return clientMe(req,env);
  if(p==='/api/client/deposit'&&req.method==='POST') return deposit(req,env);
  if(p==='/api/client/withdraw'&&req.method==='POST') return withdrawal(req,env);
  if(p==='/api/client/wallet-settings'&&req.method==='POST') return walletSettings(req,env);
  if(p==='/api/admin/summary') return adminSummary(req,env);
  if(p==='/api/admin/deposits'&&req.method==='GET') return adminList(req,env,'deposits');
  if(p==='/api/admin/withdrawals'&&req.method==='GET') return adminList(req,env,'withdrawals');
  if(p==='/api/admin/users'&&req.method==='GET') return adminList(req,env,'users');
  if(p==='/api/admin/deposit-review'&&req.method==='POST') return adminReviewDeposit(req,env);
  if(p==='/api/admin/withdrawal-status'&&req.method==='POST') return adminWithdrawal(req,env);
  if(p==='/api/admin/balance-adjust'&&req.method==='POST') return adminAdjustBalance(req,env);
  if(p==='/api/admin/settings'&&req.method==='GET') return getSettings(req,env);
  if(p==='/api/admin/settings'&&req.method==='POST') return settings(req,env);
  if(p==='/api/admin/users'&&req.method==='POST') return adminCreateUser(req,env);
  return fail('Not found',404);
 }catch(e){ if(e.message==='AUTH_REQUIRED') return fail('Authentication required.',401); if(e.message==='ADMIN_REQUIRED') return fail('Administrator authentication required.',403); return fail('Server error.',500); }
}
export default { fetch: route };
