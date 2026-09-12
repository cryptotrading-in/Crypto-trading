(()=>{
  const esc=x=>String(x??'').replace(/[&<>"']/g,m=>({'&':'&','<':'<','>':'>','"':'"',"'":'&#39;'}[m]));
  const $=id=>document.getElementById(id);
  const api=async(p,o={},attempt=0)=>{
    let r;
    try{r=await fetch('/api'+p,{...o,credentials:'include',cache:'no-store',headers:{'content-type':'application/json',...(o.headers||{})}})}
    catch(e){if(attempt<2){await new Promise(x=>setTimeout(x,350*(attempt+1)));return api(p,o,attempt+1)}throw e}
    let d={};try{d=await r.json()}catch{}
    if(!r.ok||d.ok===false){if(attempt<2&&r.status>=500){await new Promise(x=>setTimeout(x,350*(attempt+1)));return api(p,o,attempt+1)}const e=Error(d.error||'Request failed');e.status=r.status;throw e}
    return d;
  };
  const fmt=x=>(Number(x||0)/100).toFixed(2);
  const toPkt=x=>{const t=new Date(x||Date.now());return new Date(t.getTime()+(5*60+t.getTimezoneOffset())*60000)};
  const date=x=>{if(!x)return'—';const d=toPkt(x);return String(d.getDate()).padStart(2,'0')+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+d.getFullYear()};
  const isAdmin=/\/admin(?:\.html)?$/.test(location.pathname);

  if(isAdmin){
    window.referrals=async function(){
      try{
        const d=await api('/admin/referrals'),s=d.settings;
        $('main').innerHTML='<div class="section"><h1>Referral Management</h1><button class="btn" onclick="referrals()">Refresh</button></div><div class="grid"><div class="card">Total Referrals<div class="num">'+d.stats.total+'</div></div><div class="card">Qualified<div class="num">'+d.stats.qualified+'</div></div><div class="card">Pending<div class="num">'+d.stats.pending+'</div></div><div class="card">Rewards Paid<div class="num">'+d.stats.rewardsPaid+' USDT</div></div></div><div class="card" style="margin-top:13px"><h2>Referral Settings</h2><div class="form"><select id="re"><option value="1" '+(s.enabled?'selected':'')+'>Referral Enabled</option><option value="0" '+(!s.enabled?'selected':'')+'>Referral Disabled</option></select><input id="rr" type="number" step="0.01" value="'+esc(s.reward)+'" placeholder="Reward USDT"><input id="rm" type="number" step="0.01" value="'+esc(s.minimumDeposit)+'" placeholder="Min deposit USDT"><input id="rh" type="number" min="0" value="'+esc(s.holdHours)+'" placeholder="Hold hours"><button class="btn primary" onclick="saveReferralSettings()">Save</button><p id="rmsg" class="muted"></p></div></div><div class="card" style="margin-top:13px"><h2>Referral Activity</h2><div class="tablewrap"><table class="table"><tr><th>Referrer</th><th>Referred</th><th>Status</th><th>Deposit</th><th>Reward</th><th>Date</th></tr>'+d.rows.map(v=>'<tr><td>'+esc(v.referrer_name)+'<br><small>'+esc(v.referrer_email)+'</small></td><td>'+esc(v.referred_name)+'<br><small>'+esc(v.referred_email)+'</small></td><td><span class="pill">'+esc(v.status)+'</span></td><td>'+fmt(v.deposit_amount||0)+' USDT</td><td>'+fmt(v.reward_amount||0)+' USDT</td><td>'+date(v.created_at)+'</td></tr>').join('')+'</table></div></div>';
      }catch(e){$('main').innerHTML='<div class="notice">'+esc(e.message)+'</div>'}
    };
    window.saveReferralSettings=async function(){
      try{
        await api('/admin/referral-settings',{method:'POST',body:JSON.stringify({enabled:$('re').value==='1',reward:$('rr').value,minimumDeposit:$('rm').value,holdHours:$('rh').value})});
        $('rmsg').textContent='Saved.';referrals();
      }catch(e){$('rmsg').textContent=e.message}
    };
  } else {
    window.referrals=async function(){
      try{
        const d=await api('/referrals');
        if(!d.enabled){$('main').innerHTML='<div class="notice">Referral program is currently disabled.</div>';return}
        const rows=(d.rows||[]).map(v=>'<div class="priceLine"><span><b>'+esc(v.full_name)+'</b><br><small class="muted">'+esc(v.email)+'</small></span><b class="'+(v.status==='qualified'?'green':'amber')+'">'+esc(v.status)+'</b></div>').join('')||'<p class="muted">No referrals yet.</p>';
        $('main').innerHTML='<h1>Refer & Earn</h1><div class="card"><h2>Invite friends</h2><p class="muted">Earn <b>'+esc(d.settings.reward)+' USDT</b> when a referred client makes an approved qualifying deposit of at least <b>'+esc(d.settings.minimumDeposit)+' USDT</b>.</p><input id="refLink" readonly value="'+esc(d.referralLink)+'"><div class="row" style="margin-top:9px"><button class="btn primary" onclick="copyReferralLink()">Copy Link</button><button class="btn" onclick="shareReferralLink()">Share</button><button class="btn" onclick="whatsappReferral()">WhatsApp</button></div><p id="refActionMsg" class="muted small"></p><p class="muted small">Your code: <b>'+esc(d.referralCode)+'</b></p></div><div class="grid" style="margin-top:13px"><div class="card">Total Referrals<div class="num">'+d.stats.total+'</div></div><div class="card">Qualified<div class="num">'+d.stats.qualified+'</div></div><div class="card">Pending<div class="num">'+d.stats.pending+'</div></div><div class="card">Earned<div class="num">'+esc(d.stats.totalEarned)+' USDT</div></div></div><div class="card" style="margin-top:13px"><h2>Referral Activity</h2>'+rows+'</div>';
      }catch(e){$('main').innerHTML='<div class="notice">'+esc(e.message)+'</div>'}
    };
    window.copyReferralLink=async function(){
      const v=$('refLink')?.value;if(!v)return;
      try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(v);else{const x=$('refLink');x.focus();x.select();document.execCommand('copy')}
        if($('refActionMsg'))$('refActionMsg').textContent='Referral link copied.';
      }catch{if($('refActionMsg'))$('refActionMsg').textContent='Copy failed. Long-press the link.';}
    };
    window.shareReferralLink=async function(){
      const v=$('refLink')?.value;if(!v)return;
      try{if(navigator.share)await navigator.share({title:'CryptoTrade Referral',text:'Join CryptoTrade using my referral link:',url:v});else await copyReferralLink()}catch{}
    };
    window.whatsappReferral=function(){
      const v=$('refLink')?.value;if(v)location.href='https://wa.me/?text='+encodeURIComponent('Join CryptoTrade using my referral link: '+v);
    };
  }

  function bindMenu(){
    document.querySelectorAll('#side button, #menu button').forEach(btn=>{
      const oc=btn.getAttribute('onclick')||'';
      if(oc.includes("page('referrals'")||oc.includes('page("referrals"')){
        btn.removeAttribute('onclick');
        btn.addEventListener('click',e=>{e.preventDefault();if(typeof window.closeMenu==='function')window.closeMenu();window.referrals();});
      }
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindMenu);
  else bindMenu();
  setTimeout(bindMenu,500);
  setTimeout(bindMenu,1500);
})();
