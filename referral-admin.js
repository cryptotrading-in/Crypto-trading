// Admin-side referral system management
async function adminReferrals() {
  try {
    const data = await api('/admin/referrals');
    const settings = data.settings || {};
    const referrals_list = data.referrals || [];
    
    const enabled = settings.referral_enabled === '1' ? 'checked' : '';
    const reward = Number(settings.referral_reward_minor || 0) / 100;
    const minDeposit = Number(settings.referral_min_deposit_minor || 0) / 100;
    
    const html = `
      <div class="section">
        <h1>Referral System Management</h1>
        <button class="btn" onclick="adminReferrals()">Refresh</button>
      </div>
      
      <div class="card form">
        <h2>Settings</h2>
        <label>
          <input type="checkbox" id="refEnabled" ${enabled} onchange="saveReferralSettings()"> 
          Enable Referral System
        </label>
        
        <label>Reward per Referral (USDT)
          <input type="number" id="refReward" value="${reward}" step="0.01" min="0" onchange="saveReferralSettings()">
        </label>
        
        <label>Minimum Deposit to Qualify (USDT)
          <input type="number" id="refMinDeposit" value="${minDeposit}" step="0.01" min="0" onchange="saveReferralSettings()">
        </label>
        
        <div id="refMsg" class="muted" style="margin-top: 10px;"></div>
      </div>
      
      <div class="section" style="margin-top: 20px;">
        <h2>All Referrals (${referrals_list.length})</h2>
        <div class="card">
          ${referrals_list.length > 0 ? `
            <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
              <thead>
                <tr style="border-bottom: 2px solid #444;">
                  <th style="text-align: left; padding: 8px;">Referrer</th>
                  <th style="text-align: left; padding: 8px;">Referred</th>
                  <th style="text-align: left; padding: 8px;">Status</th>
                  <th style="text-align: right; padding: 8px;">Reward</th>
                  <th style="text-align: left; padding: 8px;">Date</th>
                </tr>
              </thead>
              <tbody>
                ${referrals_list.map(r => `
                  <tr style="border-bottom: 1px solid #333;">
                    <td style="padding: 8px;">
                      <strong>${esc(r.referrer_name || 'N/A')}</strong><br>
                      <span class="muted" style="font-size: 0.85em;">${esc(r.referrer_email || 'N/A')}</span>
                    </td>
                    <td style="padding: 8px;">
                      <strong>${esc(r.referred_name || 'N/A')}</strong><br>
                      <span class="muted" style="font-size: 0.85em;">${esc(r.referred_email || 'N/A')}</span>
                    </td>
                    <td style="padding: 8px;">
                      <span class="badge ${r.status === 'approved' ? 'green' : (r.status === 'pending' ? 'amber' : 'red')}">${r.status}</span>
                    </td>
                    <td style="padding: 8px; text-align: right;">${money(r.reward_minor || 0)}</td>
                    <td style="padding: 8px; font-size: 0.85em;">${new Date(r.created_at).toLocaleDateString()}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : `<p class="muted">No referrals yet.</p>`}
        </div>
      </div>
    `;
    
    $('main').innerHTML = html;
  } catch (err) {
    console.error('Error loading admin referrals:', err);
    $('main').innerHTML = `<h1>Referral System</h1><div class="card"><p class="error">Error loading referrals. ${err.message}</p></div>`;
  }
}

async function saveReferralSettings() {
  try {
    const enabled = document.getElementById('refEnabled')?.checked || false;
    const reward = Number(document.getElementById('refReward')?.value || 0);
    const minDeposit = Number(document.getElementById('refMinDeposit')?.value || 0);
    
    await api('/admin/referrals', {
      method: 'POST',
      body: JSON.stringify({
        enabled,
        reward,
        minDeposit
      })
    });
    
    const msg = document.getElementById('refMsg');
    if (msg) {
      msg.textContent = '✓ Settings saved!';
      msg.style.color = '#0f0';
      setTimeout(() => {
        msg.textContent = '';
      }, 3000);
    }
  } catch (err) {
    console.error('Error saving referral settings:', err);
    const msg = document.getElementById('refMsg');
    if (msg) {
      msg.textContent = '✗ Error: ' + (err.message || 'Unknown error');
      msg.style.color = '#f00';
    }
  }
}
