/* popup.js — Codebase Explainer Chrome Extension
   Calls FastAPI backend at localhost:8000
   POST /analyze  → full architectural map JSON
   POST /ask      → LLM answer grounded in the map */

const API_BASE = 'http://localhost:8000';

const LOADING_STEPS = ['ls-clone', 'ls-parse', 'ls-graph', 'ls-arch', 'ls-flow'];

const ROLE_DOT_COLORS = {
  entry:  'var(--dot-entry)',
  core:   'var(--dot-core)',
  data:   'var(--dot-data)',
  config: 'var(--dot-config)'
};

const ROLE_BADGE_CLASS = {
  entry:  'badge-entry',
  core:   'badge-core',
  data:   'badge-data',
  config: 'badge-cfg'
};

const FLOW_CHIP_COLORS = [
  { bg: 'var(--blue-bg)',  txt: 'var(--blue-text)'  },
  { bg: 'var(--teal-bg)',  txt: 'var(--teal-text)'  },
  { bg: 'var(--amber-bg)', txt: 'var(--amber-text)' },
  { bg: 'var(--gray-bg)',  txt: 'var(--gray-text)'  }
];

const LANG_BADGE_CLASSES = ['badge-entry', 'badge-core', 'badge-data', 'badge-cfg'];

let currentRepo = null;
let archData    = null;


/* init */

document.addEventListener('DOMContentLoaded', async () => {

  /* 1. Load saved theme first so there is no flash of wrong theme */
  await loadTheme();

  /* 2. Wire up theme button — done here not inline onclick
        so it works correctly inside the extension context     */
  document.getElementById('themeBtn').addEventListener('click', toggleTheme);

  /* 3. Check which repo the user is currently on */
  const stored = await chrome.storage.session.get('currentRepo');
  currentRepo  = stored.currentRepo || null;

  if (currentRepo) {
    document.getElementById('o-repo').textContent =
      currentRepo.fullName.replace('/', ' / ');

    /* Check for cached analysis result */
    const cacheKey = `arch_${currentRepo.fullName}`;
    const cached   = await chrome.storage.session.get(cacheKey);

    if (cached[cacheKey]) {
      archData = cached[cacheKey];
      renderAll(archData);
      showState('done');
      resetChat();
    } else {
      showState('ready');
    }
  } else {
    showState('no-repo');
  }
});


/* THEME
   Chrome extensions cannot rely on prefers-color-scheme for
   toggling — we store the preference in chrome.storage.local
   and apply it manually to <html data-theme="...">*/

async function loadTheme() {
  return new Promise((resolve) => {
    chrome.storage.local.get('theme', ({ theme }) => {
      applyTheme(theme || 'light');
      resolve();
    });
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('themeBtn').textContent = theme === 'dark' ? '🌙' : '☀️';
}

function toggleTheme() {
  const current  = document.documentElement.getAttribute('data-theme');
  const newTheme = current === 'dark' ? 'light' : 'dark';
  applyTheme(newTheme);
  chrome.storage.local.set({ theme: newTheme });
}


/* STATE MACHINE
   Controls which section of the popup is visible*/

function showState(state) {
  document.getElementById('state-no-repo').style.display = state === 'no-repo' ? 'flex'  : 'none';
  document.getElementById('state-ready').style.display   = state === 'ready'   ? 'block' : 'none';
  document.getElementById('state-loading').style.display = state === 'loading' ? 'block' : 'none';
  document.getElementById('state-done').style.display    = state === 'done'    ? 'block' : 'none';
  document.getElementById('reAnalyzeBtn').style.display  = state === 'done'    ? 'inline-block' : 'none';
}

function setStatus(text, type) {
  const badge     = document.getElementById('statusBadge');
  badge.textContent = text;
  badge.className   = 'live-badge' + (type ? ' ' + type : '');
}


/* ANALYSIS
   Sends repo info to the FastAPI backend and renders the result */

async function startAnalysis() {
  if (!currentRepo) return;

  showState('loading');
  setStatus('analyzing', 'analyzing');

  /* Animate loading steps one at a time */
  let i = 0;
  const timer = setInterval(() => {
    if (i > 0) {
      document.getElementById(LOADING_STEPS[i - 1]).className = 'loading-step done';
    }
    if (i < LOADING_STEPS.length) {
      document.getElementById(LOADING_STEPS[i]).className = 'loading-step active';
      i++;
    } else {
      clearInterval(timer);
    }
  }, 800);

  try {
    const res = await fetch(`${API_BASE}/analyze`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        owner: currentRepo.owner,
        repo:  currentRepo.repo
      })
    });

    clearInterval(timer);

    if (!res.ok) throw new Error(`Backend responded with ${res.status}`);

    archData = await res.json();

    /* Cache so re-opening popup doesn't re-analyze */
    await chrome.storage.session.set({
      [`arch_${currentRepo.fullName}`]: archData
    });

    renderAll(archData);
    setStatus('live');
    showState('done');
    resetChat();

  } catch (err) {
    clearInterval(timer);
    setStatus('error', 'error');

    /* Show error message in the no-repo box */
    document.getElementById('state-no-repo').querySelector('.state-title').textContent =
      'Could not connect to backend';
    document.getElementById('state-no-repo').querySelector('.state-desc').textContent =
      'Make sure the FastAPI server is running: poetry run uvicorn api.main:app --reload';
    showState('no-repo');
    console.error('Codebase Explainer:', err);
  }
}


/* RENDER FUNCTIONS
   Each function handles one section of the Overview/Walkthrough*/

function renderAll(data) {
  renderRepoBar(data);
  renderArchCards(data);
  renderFileList(data);
  renderFlowPath(data);
  renderHealth(data);
  renderLanguages(data);
  renderWalkthrough(data);
  renderReadingTime(data);
}

function renderRepoBar(data) {
  const lang  = (data.languages || [])[0] || '';
  const total = data.total_files || 0;

  const langEl  = document.getElementById('o-lang');
  const filesEl = document.getElementById('o-files-badge');

  if (lang)  { langEl.textContent  = lang;             langEl.style.display  = ''; }
  if (total) { filesEl.textContent = `${total} files`; filesEl.style.display = ''; }
}

function renderArchCards(data) {
  const entry = data.entry_points || [];
  const core  = data.core_logic   || [];
  const dl    = data.data_layer   || [];
  const cfg   = data.config       || [];

  document.getElementById('o-c-entry').textContent = entry.length;
  document.getElementById('o-s-entry').textContent = entry.slice(0, 3).map(shortName).join(', ') || '—';
  document.getElementById('o-c-core').textContent  = core.length;
  document.getElementById('o-s-core').textContent  = core.slice(0, 3).map(shortName).join(', ')  || '—';
  document.getElementById('o-c-data').textContent  = dl.length;
  document.getElementById('o-s-data').textContent  = dl.slice(0, 3).map(shortName).join(', ')    || '—';
  document.getElementById('o-c-cfg').textContent   = cfg.length;
  document.getElementById('o-s-cfg').textContent   = cfg.slice(0, 3).map(shortName).join(', ')   || '—';
}

function renderFileList(data) {
  const files = data.top_files || [];
  document.getElementById('o-files-list').innerHTML = files.slice(0, 6).map(f => `
    <div class="file-row">
      <div class="file-dot" style="background:${ROLE_DOT_COLORS[f.role] || 'var(--text-tertiary)'}"></div>
      <span class="file-nm" title="${f.name}">${f.name}</span>
      <span class="badge ${ROLE_BADGE_CLASS[f.role] || 'badge-cfg'}">${f.role}</span>
    </div>
  `).join('');
}

function renderFlowPath(data) {
  const parts = (data.flow_path || '').split('→').map(s => s.trim()).filter(Boolean);
  document.getElementById('o-flow').innerHTML = parts.map((p, i) => {
    const c = FLOW_CHIP_COLORS[i % FLOW_CHIP_COLORS.length];
    const arrow = i < parts.length - 1 ? '<span class="flow-arrow">→</span>' : '';
    return `<span class="flow-chip" style="background:${c.bg};color:${c.txt}">${p}</span>${arrow}`;
  }).join('');
}

function renderHealth(data) {
  document.getElementById('h-depth').textContent = data.max_depth     ?? '—';
  document.getElementById('h-cov').textContent   = data.test_coverage ?? '—';
  document.getElementById('h-deps').textContent  = data.external_deps ?? '—';
}

function renderLanguages(data) {
  const langs = data.languages || [];
  document.getElementById('o-langs').innerHTML = langs.map((l, i) =>
    `<span class="badge ${LANG_BADGE_CLASSES[i % LANG_BADGE_CLASSES.length]}">${l}</span>`
  ).join('');
}

function renderWalkthrough(data) {
  const steps = data.walkthrough || [];
  document.getElementById('o-steps').innerHTML = steps.map((s, i) => {
    const cls   = i === 0 ? 'done' : i === 1 ? 'active' : 'todo';
    const label = i === 0 ? '✓' : i + 1;
    return `
      <div class="step-row">
        <div class="step-num ${cls}">${label}</div>
        <div>
          <div class="step-title">${s.title || s.file || ''}</div>
          <div class="step-desc">${s.description || s.desc || ''}</div>
        </div>
      </div>`;
  }).join('');
}

function renderReadingTime(data) {
  document.getElementById('t-quick').textContent =
    data.quick_scan_min  ? `~${data.quick_scan_min}m`  : '—';
  document.getElementById('t-deep').textContent  =
    data.deep_read_hours ? `~${data.deep_read_hours}h` : '—';
}


/* tabs */

function switchTab(name, el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel, .ask-panel').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('panel-' + name).classList.add('active');
}


/*  CHAT / ASK TAB
   Tries the backend /ask endpoint first.
   Falls back to localAnswer() if backend is unavailable. */

function resetChat() {
  const repo = currentRepo ? currentRepo.fullName : 'this repo';
  document.getElementById('chatArea').innerHTML = `
    <div class="chat-sender sender-ai">Codebase Explainer</div>
    <div class="bubble bubble-ai">
      I've mapped <strong>${repo}</strong>. Ask me anything — entry points, core files, data flow, or where to start reading.
    </div>
  `;
}

function sendQ(question) {
  document.getElementById('chatIn').value = question;
  sendChat();
}

async function sendChat() {
  const input    = document.getElementById('chatIn');
  const question = input.value.trim();
  if (!question) return;
  input.value = '';

  const area = document.getElementById('chatArea');
  appendBubble(area, 'user', question);

  /* Typing indicator */
  const typingId = 'typing-' + Date.now();
  area.insertAdjacentHTML('beforeend', `
    <div id="${typingId}" style="margin-top:10px">
      <div class="chat-sender sender-ai">Codebase Explainer</div>
      <div class="bubble bubble-ai" style="color:var(--text-tertiary)">thinking...</div>
    </div>
  `);
  area.scrollTop = area.scrollHeight;

  try {
    const res = await fetch(`${API_BASE}/ask`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        question,
        repo:      currentRepo?.fullName,
        arch_data: archData
      })
    });

    document.getElementById(typingId)?.remove();

    if (!res.ok) throw new Error('Backend error');

    const result = await res.json();
    appendBubble(area, 'ai', result.answer || result.response || 'No answer returned.');

  } catch {
    /* Backend unavailable — answer locally from cached JSON */
    document.getElementById(typingId)?.remove();
    appendBubble(area, 'ai', localAnswer(question));
  }

  area.scrollTop = area.scrollHeight;
}

function appendBubble(area, role, text) {
  const div = document.createElement('div');
  div.style.marginTop = '10px';
  div.innerHTML = role === 'user'
    ? `<div class="chat-sender sender-user">You</div>
       <div class="bubble bubble-user">${text}</div>`
    : `<div class="chat-sender sender-ai">Codebase Explainer</div>
       <div class="bubble bubble-ai">${text}</div>`;
  area.appendChild(div);
}


/* LOCAL FALLBACK ANSWERS
   Reads from cached archData so answers are still accurate
   even when the backend /ask endpoint is not running */

function localAnswer(question) {
  if (!archData) return 'Please analyze the repo first.';

  const q     = question.toLowerCase();
  const ic    = s => `<span class="inline-code">${s}</span>`;

  const entry = archData.entry_points || [];
  const core  = archData.core_logic   || [];
  const dl    = archData.data_layer   || [];
  const cfg   = archData.config       || [];
  const flow  = archData.flow_path    || '';
  const langs = archData.languages    || [];
  const total = archData.total_files  || 0;

  if (/how many entry|number of entry|entry.*count/.test(q))
    return `There are <strong>${entry.length}</strong> entry point${entry.length === 1 ? '' : 's'}${entry.length ? ': ' + entry.slice(0,3).map(ic).join(', ') : ''}.`;

  if (/how many core|count.*core/.test(q))
    return `There are <strong>${core.length}</strong> core logic files${core.length ? ': ' + core.slice(0,3).map(ic).join(', ') : ''}.`;

  if (/how many data|count.*data/.test(q))
    return `There are <strong>${dl.length}</strong> data layer files${dl.length ? ': ' + dl.slice(0,3).map(ic).join(', ') : ''}.`;

  if (/how many file|total file|file count/.test(q))
    return `This repo has <strong>${total}</strong> files — ${entry.length} entry, ${core.length} core, ${dl.length} data, ${cfg.length} config.`;

  if (/entry.*file|what.*entry|list.*entry/.test(q))
    return entry.length
      ? `Entry points: ${entry.slice(0,5).map(ic).join(', ')}.`
      : 'No entry points detected.';

  if (/core.*file|what.*core/.test(q))
    return core.length
      ? `Core files: ${core.slice(0,5).map(ic).join(', ')}.`
      : 'No core files detected.';

  if (/data.*file|what.*data|orm|model/.test(q))
    return dl.length
      ? `Data layer: ${dl.slice(0,5).map(ic).join(', ')}.`
      : 'No data layer files detected.';

  if (/flow|how.*data.*move/.test(q))
    return flow
      ? `Data flow: ${flow.split('→').map(s => ic(s.trim())).join(' → ')}.`
      : 'Flow path not detected yet.';

  if (/language|what.*lang/.test(q))
    return langs.length
      ? `Languages: ${langs.map(ic).join(', ')}.`
      : 'Language info not available.';

  if (/start|read first|onboard|where.*begin/.test(q)) {
    const steps = archData.walkthrough || [];
    return steps.length
      ? `Start with <strong>${steps[0].title || steps[0].file}</strong> — ${steps[0].description || steps[0].desc || ''}`
      : 'Check the Walkthrough tab for the guided reading order.';
  }

  return `I can answer questions about entry points, core files, data flow, or reading order for <strong>${currentRepo?.fullName}</strong>.`;
}


/* utility */

function shortName(path) {
  return path.split('/').pop();
}