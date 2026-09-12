// Client-side referral system
async function referrals() {
  try {
    const data = await api('/referrals');
    const state_data = await refresh();
    
    const referralCode = data.referralCode || state_data.user?.referral_code || 'LOADING...';
    const referralLink = `${window.location.origin}?ref=${referralCode}`;
    const referrals_list = data.referrals || [];
    const minDeposit = data.minimumDeposit || 100;
    const reward = data.reward || 0;
    const totalReferralReward = data.totalReferralReward || 0;
    
    const html = `
      <h1>Refer & Earn</h1>
      <div class="grid">
        <div class="card">
          <span class="muted">Your Referral Code</span>
          <div style="font-size: 1.8em; font-weight: bold; margin: 10px 0; font-family: monospace; word-break: break-all;">${esc(referralCode)}</div>
          <button class="btn primary" onclick="copyReferralLink()">Copy Referral Link</button>
          <div id="copyRefMsg" class="muted" style="margin-top: 8px; font-size: 0.9em;"></div>
        </div>
        
        <div class="card">
          <span class="muted">Total Referral Rewards</span>
          <div class="num">${money(totalReferralReward)} USDT</div>
        </div>
        
        <div class="card">
          <span class="muted">Reward per Referral</span>
          <div class="num">${money(reward)} USDT</div>
          <p class="muted" style="font-size: 0.85em; margin-top: 8px;">When referred friend deposits minimum ${money(minDeposit)} USDT</p>
        </div>
      </div>
      
      <div class="section" style="margin-top: 20px;">
        <h2>Your Referrals</h2>
        <div class="card">
          ${referrals_list.length > 0 ? `
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="border-bottom: 2px solid #444;">
                  <th style="text-align: left; padding: 10px;">Name</th>
                  <th style="text-align: left; padding: 10px;">Email</th>
                  <th style="text-align: left; padding: 10px;">Status</th>
                  <th style="text-align: right; padding: 10px;">Reward</th>
                </tr>
              </thead>
              <tbody>
                ${referrals_list.map(r => `
                  <tr style="border-bottom: 1px solid #333;">
                    <td style="padding: 10px;">${esc(r.referred_name || 'N/A')}</td>
                    <td style="padding: 10px;">${esc(r.referred_email || 'N/A')}</td>
                    <td style="padding: 10px;"><span class="badge ${r.status === 'approved' ? 'green' : (r.status === 'pending' ? 'amber' : 'muted')}">${r.status}</span></td>
                    <td style="padding: 10px; text-align: right;">${money(r.reward_minor || 0)} USDT</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : `<p class="muted">No referrals yet. Share your code to start earning!</p>`}
        </div>
      </div>
      
      <div class="section" style="margin-top: 20px;">
        <h2>How It Works</h2>
        <div class="card">
          <ol style="padding-left: 20px;">
            <li>Share your referral code or link with friends</li>
            <li>When they sign up and make a deposit of ${money(minDeposit)} or more</li>
            <li>You'll receive ${money(reward)} USDT as a reward</li>
            <li>Track all your referrals and earnings here</li>
          </ol>
        </div>
      </div>
    `;
    
    $('main').innerHTML = html;
  } catch (err) {
    console.error('Error loading referrals:', err);
    $('main').innerHTML = `<h1>Refer & Earn</h1><div class="card"><p class="error">Error loading referrals. ${err.message}</p><button class="btn" onclick="referrals()">Retry</button></div>`;
  }
}

function copyReferralLink() {
  const code = document.querySelector('div[style*="monospace"]')?.textContent || '';
  if (!code) return alert('Could not find referral code');
  
  const link = `${window.location.origin}?ref=${code}`;
  navigator.clipboard?.writeText(link)
    .then(() => {
      document.getElementById('copyRefMsg').textContent = '✓ Link copied to clipboard!';
      setTimeout(() => {
        document.getElementById('copyRefMsg').textContent = '';
      }, 3000);
    })
    .catch(() => {
      alert('Referral Link: ' + link);
    });
}
