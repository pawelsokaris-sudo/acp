const API = '';

// --- Fetch helpers ---

async function fetchJson(path) {
  const res = await fetch(API + path, { credentials: 'include' });
  if (res.status === 401) {
    showLogin();
    throw new Error('Unauthorized');
  }
  return res.json();
}

async function postJson(path, body) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  return res.json();
}

// --- Formatting ---

function fmtTime(ts) {
  if (!ts) return '--';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function esc(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

function badgeClass(type) {
  if (type === 'session_start' || type === 'session_end') return 'badge-session';
  return 'badge-' + (type || 'session');
}

// --- Toast ---

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

// --- Auth & screens ---

async function checkAuth() {
  try {
    const stats = await fetchJson('/panel/stats');
    showApp(stats);
  } catch (e) {
    if (e.message !== 'Unauthorized') {
      showLogin();
    }
  }
}

function showLogin() {
  document.getElementById('login-screen').style.display = '';
  document.getElementById('app').style.display = 'none';
}

function showApp(stats) {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = '';
  loadDashboard(stats);
}

async function login(email) {
  const msgEl = document.getElementById('login-message');
  msgEl.className = 'login-message';
  msgEl.textContent = 'Sending...';
  try {
    const data = await postJson('/panel/auth/request', { email });
    if (data.ok) {
      msgEl.className = 'login-message success';
      msgEl.textContent = data.message || 'Check your email for the login link.';
    } else {
      msgEl.className = 'login-message error';
      msgEl.textContent = data.message || 'Request failed.';
    }
  } catch (e) {
    msgEl.className = 'login-message error';
    msgEl.textContent = 'Network error. Try again.';
  }
}

// --- Dashboard ---

async function loadDashboard(stats) {
  const grid = document.getElementById('stats-grid');
  const agents = (stats.agents || []).join(', ') || '--';
  grid.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Sessions</div>
      <div class="stat-value">${esc(stats.sessions_count)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Total Entries</div>
      <div class="stat-value">${esc(stats.total_entries)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Active Blockers</div>
      <div class="stat-value" style="color:${stats.blockers_count > 0 ? '#f44336' : '#4caf50'}">${esc(stats.blockers_count)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Agents</div>
      <div class="stat-value small">${esc(agents)}</div>
    </div>
  `;

  // Last session
  const lsCard = document.getElementById('last-session-card');
  const ls = stats.last_session;
  if (ls) {
    const resultClass = ls.result === 'success' ? 'result-success' : ls.result === 'failure' ? 'result-failure' : 'result-partial';
    lsCard.innerHTML = `
      <div class="last-session-label">Last Session</div>
      <div><strong>${esc(ls.agent)}</strong> <span class="${resultClass}">${esc(ls.result)}</span></div>
      <div class="last-session-meta">${fmtTime(ls.ended_at)}</div>
      <div class="last-session-summary">${esc(ls.summary)}</div>
    `;
  } else {
    lsCard.innerHTML = '<div class="empty-state">No sessions yet.</div>';
  }

  // Blockers
  try {
    const ctx = await fetchJson('/panel/context');
    renderBlockers(ctx.memory && ctx.memory.blockers);
  } catch (e) {
    renderBlockers(null);
  }
}

function renderBlockers(blockers) {
  const el = document.getElementById('blockers-list');
  if (!blockers || blockers.length === 0) {
    el.innerHTML = '<div class="empty-state">No active blockers.</div>';
    return;
  }
  el.innerHTML = blockers.map((b) => `
    <div class="blocker-card">
      <div class="blocker-text">${esc(b.text)}</div>
      <div class="blocker-meta">${esc(b.agent || '')} ${fmtTime(b.ts)}</div>
    </div>
  `).join('');
}

// --- Rules ---

async function loadRules() {
  const el = document.getElementById('rules-content');
  el.innerHTML = '<div class="empty-state">Loading...</div>';
  try {
    const ctx = await fetchJson('/panel/context');
    const rules = ctx.rules || {};
    el.innerHTML = renderRuleGroup('Frozen', rules.frozen)
      + renderRuleGroup('Never', rules.never)
      + renderRuleGroup('Always', rules.always);
    el.querySelectorAll('.rule-group-header').forEach((header) => {
      header.addEventListener('click', () => {
        header.classList.toggle('collapsed');
        header.nextElementSibling.classList.toggle('hidden');
      });
    });
  } catch (e) {
    el.innerHTML = '<div class="empty-state">Failed to load rules.</div>';
  }
}

function renderRuleGroup(title, rules) {
  if (!rules || rules.length === 0) {
    return `<div class="rule-group">
      <div class="rule-group-header">${esc(title)} (0) <span class="chevron">&#9660;</span></div>
      <div class="rule-group-body"><div class="empty-state">No ${title.toLowerCase()} rules.</div></div>
    </div>`;
  }
  const items = rules.map((r) => `
    <div class="rule-item">
      <span class="rule-id">${esc(r.id || '')}</span>
      <span class="rule-text">${esc(r.text)}</span>
      <span class="rule-source">${esc(r.source || '')}</span>
    </div>
  `).join('');
  return `<div class="rule-group">
    <div class="rule-group-header">${esc(title)} (${rules.length}) <span class="chevron">&#9660;</span></div>
    <div class="rule-group-body">${items}</div>
  </div>`;
}

// --- Journal ---

let journalAgentsPopulated = false;

async function loadJournal() {
  const timeline = document.getElementById('journal-timeline');
  timeline.innerHTML = '<div class="empty-state">Loading...</div>';

  const type = document.getElementById('filter-type').value;
  const agent = document.getElementById('filter-agent').value;
  let qs = '?limit=100';
  if (type) qs += '&type=' + encodeURIComponent(type);
  if (agent) qs += '&agent=' + encodeURIComponent(agent);

  try {
    const data = await fetchJson('/panel/journal' + qs);
    const entries = data.entries || [];

    if (!journalAgentsPopulated) {
      populateAgentFilter(entries);
      journalAgentsPopulated = true;
    }

    if (entries.length === 0) {
      timeline.innerHTML = '<div class="empty-state">No journal entries.</div>';
      return;
    }

    timeline.innerHTML = entries.map((e) => `
      <div class="journal-entry">
        <span class="badge ${badgeClass(e.type)}">${esc(e.type)}</span>
        <span class="entry-text">${esc(e.text)}</span>
        <span class="entry-meta">by ${esc(e.agent)} at ${fmtTime(e.ts)}</span>
      </div>
    `).join('');
  } catch (e) {
    timeline.innerHTML = '<div class="empty-state">Failed to load journal.</div>';
  }
}

function populateAgentFilter(entries) {
  const sel = document.getElementById('filter-agent');
  const agents = [...new Set(entries.map((e) => e.agent).filter(Boolean))];
  agents.forEach((a) => {
    const opt = document.createElement('option');
    opt.value = a;
    opt.textContent = a;
    sel.appendChild(opt);
  });
}

// --- Environment ---

async function loadEnvironment() {
  const el = document.getElementById('env-content');
  el.innerHTML = '<div class="empty-state">Loading...</div>';
  try {
    const ctx = await fetchJson('/panel/context');
    const env = ctx.environment || {};

    let html = '<h3 class="section-title">Services</h3>';
    if (env.services && env.services.length) {
      html += '<table class="env-table"><thead><tr><th>Name</th><th>Host:Port</th><th>Notes</th></tr></thead><tbody>';
      html += env.services.map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(s.host || '')}</td><td>${esc(s.notes || '')}</td></tr>`).join('');
      html += '</tbody></table>';
    } else {
      html += '<div class="empty-state">No services registered.</div>';
    }

    html += '<h3 class="section-title">Important Files</h3>';
    if (env.important_files && env.important_files.length) {
      html += '<ul class="file-list">' + env.important_files.map((f) => `<li>${esc(f)}</li>`).join('') + '</ul>';
    } else {
      html += '<div class="empty-state">None.</div>';
    }

    html += '<h3 class="section-title">Do Not Touch</h3>';
    if (env.do_not_touch && env.do_not_touch.length) {
      html += '<ul class="file-list do-not-touch">' + env.do_not_touch.map((f) => `<li>${esc(f)}</li>`).join('') + '</ul>';
    } else {
      html += '<div class="empty-state">None.</div>';
    }

    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = '<div class="empty-state">Failed to load environment.</div>';
  }
}

// --- Onboarding: Context Prompt ---

async function generateContextPrompt() {
  const ta = document.getElementById('prompt-output');
  const copyBtn = document.getElementById('btn-copy-prompt');
  ta.value = 'Loading context...';
  copyBtn.style.display = 'none';

  try {
    const ctx = await fetchJson('/panel/context');
    let prompt = '# ACP Context Restore\n\n';

    // Rules
    prompt += '## Rules\n\n';
    const ruleSection = (label, rules) => {
      if (!rules || !rules.length) return '';
      let s = `### ${label}\n`;
      rules.forEach((r) => { s += `- [${r.id || ''}] ${r.text}\n`; });
      return s + '\n';
    };
    prompt += ruleSection('Frozen (immutable)', ctx.rules && ctx.rules.frozen);
    prompt += ruleSection('Never', ctx.rules && ctx.rules.never);
    prompt += ruleSection('Always', ctx.rules && ctx.rules.always);

    // Memory
    prompt += '## Memory\n\n';
    if (ctx.memory) {
      if (ctx.memory.blockers && ctx.memory.blockers.length) {
        prompt += '### Active Blockers\n';
        ctx.memory.blockers.forEach((b) => { prompt += `- [BLOCKER] ${b.text}\n`; });
        prompt += '\n';
      }
      if (ctx.memory.recent && ctx.memory.recent.length) {
        prompt += '### Recent Entries\n';
        ctx.memory.recent.forEach((e) => { prompt += `- [${e.type}] ${e.text}\n`; });
        prompt += '\n';
      }
      if (ctx.memory.last_session) {
        const ls = ctx.memory.last_session;
        prompt += `### Last Session\n- Agent: ${ls.agent}\n- Result: ${ls.result}\n- Summary: ${ls.summary}\n\n`;
      }
    }

    // Environment
    prompt += '## Environment\n\n';
    if (ctx.environment) {
      if (ctx.environment.services && ctx.environment.services.length) {
        prompt += '### Services\n';
        ctx.environment.services.forEach((s) => { prompt += `- ${s.name}: ${s.host || ''} ${s.notes ? '(' + s.notes + ')' : ''}\n`; });
        prompt += '\n';
      }
      if (ctx.environment.important_files && ctx.environment.important_files.length) {
        prompt += '### Important Files\n';
        ctx.environment.important_files.forEach((f) => { prompt += `- ${f}\n`; });
        prompt += '\n';
      }
      if (ctx.environment.do_not_touch && ctx.environment.do_not_touch.length) {
        prompt += '### Do Not Touch\n';
        ctx.environment.do_not_touch.forEach((f) => { prompt += `- ${f}\n`; });
        prompt += '\n';
      }
    }

    // Agent instructions
    prompt += `## Your ACP Responsibilities

1. RESPECT rules absolutely (frozen > never > always)
2. PUBLISH discoveries and decisions during your session (POST /publish)
3. PROACTIVELY PROPOSE new rules when you find constraints:
   - Say: "I discovered [frozen/never/always] -- [text]. Should I add to rules?"
   - Auto-publish discoveries without asking (POST /publish)
   - Only ask confirmation for permanent rules
4. END your session with a summary (POST /session/end)
5. CHECK blockers before starting work
6. NEVER publish sensitive data (passwords, tokens, client NIPs)
`;

    ta.value = prompt;
    copyBtn.style.display = '';
  } catch (e) {
    ta.value = 'Failed to load context.';
  }
}

// --- Onboarding: Token ---

async function generateToken(agentId) {
  const out = document.getElementById('token-output');
  if (!agentId || !agentId.trim()) {
    out.style.display = '';
    out.textContent = 'Please enter an agent name.';
    return;
  }
  out.style.display = '';
  out.textContent = 'Generating...';
  try {
    const data = await postJson('/panel/tokens', { agent_id: agentId.trim() });
    out.textContent = `Token: ${data.token || '--'}

Agent: ${data.agent_id || agentId}

Env line:
${data.env_line || '--'}

Instruction:
${data.instruction || '--'}`;
  } catch (e) {
    out.textContent = 'Failed to generate token.';
  }
}

// --- Clipboard ---

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    toast('Copied!');
  }).catch(() => {
    toast('Copy failed');
  });
}

// --- Navigation ---

function switchScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => s.style.display = 'none');
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
  const target = document.getElementById(name);
  if (target) target.style.display = '';
  document.querySelector(`.nav-btn[data-screen="${name}"]`).classList.add('active');

  if (name === 'context') {
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab) switchTab(activeTab.dataset.tab);
  }
}

function switchTab(name) {
  document.querySelectorAll('.tab-panel').forEach((p) => p.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  const target = document.getElementById('tab-' + name);
  if (target) target.style.display = '';
  document.querySelector(`.tab-btn[data-tab="${name}"]`).classList.add('active');

  if (name === 'rules') loadRules();
  if (name === 'journal') loadJournal();
  if (name === 'environment') loadEnvironment();
}

// --- Init ---

document.addEventListener('DOMContentLoaded', () => {
  // Login form
  document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    login(document.getElementById('login-email').value);
  });

  // Nav buttons
  document.querySelector('.header-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-btn');
    if (btn) switchScreen(btn.dataset.screen);
  });

  // Tab buttons
  document.querySelector('.tab-bar').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (btn) switchTab(btn.dataset.tab);
  });

  // Journal filters
  document.getElementById('filter-type').addEventListener('change', () => loadJournal());
  document.getElementById('filter-agent').addEventListener('change', () => loadJournal());

  // Onboarding: Generate Prompt
  document.getElementById('btn-gen-prompt').addEventListener('click', generateContextPrompt);

  // Onboarding: Copy Prompt
  document.getElementById('btn-copy-prompt').addEventListener('click', () => {
    copyToClipboard(document.getElementById('prompt-output').value);
  });

  // Onboarding: Generate Token
  document.getElementById('btn-gen-token').addEventListener('click', () => {
    generateToken(document.getElementById('agent-name').value);
  });

  // Start
  checkAuth();
});
