/* popup.js — Codebase Explainer Chrome Extension
   Extension Lead
   All event listeners are registered here via addEventListener.
   No inline onclick/onkeydown handlers exist in the HTML.
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


/* UTILITY — HTML escape
   Prevents any backend-provided string from injecting markup
   when it must be used in an innerHTML context.*/
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


/* INIT — runs once when popup opens */
document.addEventListener('DOMContentLoaded', async () => {

  /* 1. Apply saved theme before anything renders */
  await loadTheme();

  /* 2. Wire ALL event listeners here — no inline handlers in HTML */
  wireListeners();

  /* 3. Detect which repo the user is currently on */
  const stored = await chrome.storage.session.get('currentRepo');
  currentRepo  = stored.currentRepo || null;

  if (currentRepo) {
    document.getElementById('o-repo').textContent =
      currentRepo.fullName.replace('/', ' / ');

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

/* EVENT WIRING
   All handlers live here — MV3 CSP blocks inline onclick/onkeydown */
function wireListeners() {

  /* Theme toggle */
  document.getElementById('themeBtn')
    .addEventListener('click', toggleTheme);

  /* Analyze button */
  document.getElementById('analyzeBtn')
    .addEventListener('click', startAnalysis);

  /* Re-analyze button */
  document.getElementById('reAnalyzeBtn')
    .addEventListener('click', startAnalysis);

  /* Tab buttons — uses data-tab attribute set in HTML */
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel, .ask-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
    });
  });

  /* Quick question buttons — uses data-question attribute set in HTML */
  document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('chatIn').value = btn.dataset.question;
      sendChat();
    });
  });

  /* Chat send button */
  document.getElementById('chatSendBtn')
    .addEventListener('click', sendChat);

  /* Enter key in chat input */
  document.getElementById('chatIn')
    .addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendChat();
    });
}


/* theme */
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


/* state machine */
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


/* analysis */
async function startAnalysis() {
  if (!currentRepo) return;

  showState('loading');
  setStatus('analyzing', 'analyzing');

  /* Reset all loading steps to initial state before animating.
     Fixes inconsistent display when Re-analyze is clicked.     */
  LOADING_STEPS.forEach(id => {
    document.getElementById(id).className = 'loading-step';
  });

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
    document.getElementById('state-no-repo').querySelector('.state-title').textContent =
      'Could not connect to backend';
    document.getElementById('state-no-repo').querySelector('.state-desc').textContent =
      'Make sure the FastAPI server is running: poetry run uvicorn api.main:app --reload';
    showState('no-repo');
    console.error('Codebase Explainer:', err);
  }
}


/* RENDER FUNCTIONS
   All use DOM APIs (createElement + textContent) instead of
   innerHTML with interpolated strings, preventing markup injection. */

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
  const files     = (data.top_files || []).slice(0, 6);
  const container = document.getElementById('o-files-list');
  container.textContent = '';

  files.forEach(f => {
    const row  = document.createElement('div');
    row.className = 'file-row';

    const dot  = document.createElement('div');
    dot.className = 'file-dot';
    dot.style.background = ROLE_DOT_COLORS[f.role] || 'var(--text-tertiary)';

    const name = document.createElement('span');
    name.className   = 'file-nm';
    name.textContent = f.name;
    name.title       = f.name;

    const badge = document.createElement('span');
    badge.className   = 'badge ' + (ROLE_BADGE_CLASS[f.role] || 'badge-cfg');
    badge.textContent = f.role;

    row.appendChild(dot);
    row.appendChild(name);
    row.appendChild(badge);
    container.appendChild(row);
  });
}

function renderFlowPath(data) {
  const parts     = (data.flow_path || '').split('→').map(s => s.trim()).filter(Boolean);
  const container = document.getElementById('o-flow');
  container.textContent = '';

  parts.forEach((p, i) => {
    const c    = FLOW_CHIP_COLORS[i % FLOW_CHIP_COLORS.length];
    const chip = document.createElement('span');
    chip.className        = 'flow-chip';
    chip.style.background = c.bg;
    chip.style.color      = c.txt;
    chip.textContent      = p;
    container.appendChild(chip);

    if (i < parts.length - 1) {
      const arrow = document.createElement('span');
      arrow.className   = 'flow-arrow';
      arrow.textContent = '→';
      container.appendChild(arrow);
    }
  });
}

function renderHealth(data) {
  document.getElementById('h-depth').textContent = data.max_depth     ?? '—';
  document.getElementById('h-cov').textContent   = data.test_coverage ?? '—';
  document.getElementById('h-deps').textContent  = data.external_deps ?? '—';
}

function renderLanguages(data) {
  const langs     = data.languages || [];
  const container = document.getElementById('o-langs');
  container.textContent = '';

  langs.forEach((l, i) => {
    const span = document.createElement('span');
    span.className   = 'badge ' + LANG_BADGE_CLASSES[i % LANG_BADGE_CLASSES.length];
    span.textContent = l;
    container.appendChild(span);
  });
}

function renderWalkthrough(data) {
  const steps     = data.walkthrough || [];
  const container = document.getElementById('o-steps');
  container.textContent = '';

  steps.forEach((s, i) => {
    const cls   = i === 0 ? 'done' : i === 1 ? 'active' : 'todo';
    const label = i === 0 ? '✓' : String(i + 1);

    const row = document.createElement('div');
    row.className = 'step-row';

    const num = document.createElement('div');
    num.className   = 'step-num ' + cls;
    num.textContent = label;

    const textWrapper = document.createElement('div');

    const titleEl = document.createElement('div');
    titleEl.className   = 'step-title';
    titleEl.textContent = s.title || s.file || '';

    const descEl = document.createElement('div');
    descEl.className   = 'step-desc';
    descEl.textContent = s.description || s.desc || '';

    textWrapper.appendChild(titleEl);
    textWrapper.appendChild(descEl);
    row.appendChild(num);
    row.appendChild(textWrapper);
    container.appendChild(row);
  });
}

function renderReadingTime(data) {
  document.getElementById('t-quick').textContent =
    data.quick_scan_min  ? `~${data.quick_scan_min}m`  : '—';
  document.getElementById('t-deep').textContent  =
    data.deep_read_hours ? `~${data.deep_read_hours}h` : '—';
}


/* chat/ask tab */
function resetChat() {
  const chatArea = document.getElementById('chatArea');
  if (!chatArea) return;

  /* Clear with textContent — safer than innerHTML = '' */
  chatArea.textContent = '';

  const senderDiv = document.createElement('div');
  senderDiv.className   = 'chat-sender sender-ai';
  senderDiv.textContent = 'Codebase Explainer';

  const bubbleDiv = document.createElement('div');
  bubbleDiv.className = 'bubble bubble-ai';

  /* Build bubble content with DOM nodes — no innerHTML */
  const repo   = currentRepo ? currentRepo.fullName : 'this repo';
  bubbleDiv.appendChild(document.createTextNode("I've mapped "));
  const strong = document.createElement('strong');
  strong.textContent = repo;
  bubbleDiv.appendChild(strong);
  bubbleDiv.appendChild(document.createTextNode(
    '. Ask me anything — entry points, core files, data flow, or where to start reading.'
  ));

  chatArea.appendChild(senderDiv);
  chatArea.appendChild(bubbleDiv);
}

async function sendChat() {
  const input    = document.getElementById('chatIn');
  const question = input.value.trim();
  if (!question) return;
  input.value = '';

  const area = document.getElementById('chatArea');
  appendBubble(area, 'user', question);

  /* Typing indicator — safe static string, no user input injected */
  const typingDiv = document.createElement('div');
  typingDiv.style.marginTop = '10px';
  typingDiv.id = 'typing-indicator';

  const typingSender = document.createElement('div');
  typingSender.className   = 'chat-sender sender-ai';
  typingSender.textContent = 'Codebase Explainer';

  const typingBubble = document.createElement('div');
  typingBubble.className   = 'bubble bubble-ai';
  typingBubble.style.color = 'var(--text-tertiary)';
  typingBubble.textContent = 'thinking...';

  typingDiv.appendChild(typingSender);
  typingDiv.appendChild(typingBubble);
  area.appendChild(typingDiv);
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

    document.getElementById('typing-indicator')?.remove();
    if (!res.ok) throw new Error('Backend error');

    const result = await res.json();
    /* Backend answer rendered as plain text — no HTML injection */
    appendBubble(area, 'ai', result.answer || result.response || 'No answer returned.', false);

  } catch {
    document.getElementById('typing-indicator')?.remove();
    /* Local fallback — answers built from cached JSON, not raw strings */
    appendBubble(area, 'ai', localAnswer(question), false);
  }

  area.scrollTop = area.scrollHeight;
}

/* appendBubble — builds chat messages using DOM APIs.
  allowHTML flag is false by default (plain text).
  Set to true only for localAnswer which builds its own
  safe DOM fragments internally. */

function appendBubble(area, role, text, allowHTML = false) {
  const wrapper = document.createElement('div');
  wrapper.style.marginTop = '10px';

  const sender = document.createElement('div');
  sender.className   = role === 'user' ? 'chat-sender sender-user' : 'chat-sender sender-ai';
  sender.textContent = role === 'user' ? 'You' : 'Codebase Explainer';

  const bubble = document.createElement('div');
  bubble.className = role === 'user' ? 'bubble bubble-user' : 'bubble bubble-ai';

  if (allowHTML) {
    /* Only used by localAnswer which builds safe DOM itself */
    if (text instanceof Node) {
      bubble.appendChild(text);
    } else {
      bubble.textContent = text;
    }
  } else {
    bubble.textContent = text;
  }
  wrapper.appendChild(sender);
  wrapper.appendChild(bubble);
  area.appendChild(wrapper);
}


/* LOCAL FALLBACK ANSWERS
   Builds DOM fragments — never injects raw strings via innerHTML */

function localAnswer(question) {
  if (!archData) return 'Please analyze the repo first.';

  const q     = question.toLowerCase();
  const entry = archData.entry_points || [];
  const core  = archData.core_logic   || [];
  const dl    = archData.data_layer   || [];
  const cfg   = archData.config       || [];
  const flow  = archData.flow_path    || '';
  const langs = archData.languages    || [];
  const total = archData.total_files  || 0;

  /* Helper — builds a <span class="inline-code"> safely */
  function ic(text) {
    const span = document.createElement('span');
    span.className   = 'inline-code';
    span.textContent = text;
    return span;
  }

  /* Helper — builds a text fragment with optional inline-code spans */
  function buildAnswer(...parts) {
    const frag = document.createDocumentFragment();
    parts.forEach(p => {
      if (typeof p === 'string') {
        frag.appendChild(document.createTextNode(p));
      } else {
        frag.appendChild(p);
      }
    });
    return frag;
  }

  /* Helper — bold text node */
  function bold(text) {
    const b = document.createElement('strong');
    b.textContent = text;
    return b;
  }

  if (/how many entry|number of entry|entry.*count/.test(q)) {
    const frag = buildAnswer('There are ');
    frag.appendChild(bold(String(entry.length)));
    frag.appendChild(document.createTextNode(
      ` entry point${entry.length === 1 ? '' : 's'}${entry.length ? ': ' : '.'}`
    ));
    entry.slice(0, 3).forEach((f, i) => {
      if (i > 0) frag.appendChild(document.createTextNode(', '));
      frag.appendChild(ic(shortName(f)));
    });
    if (entry.length) frag.appendChild(document.createTextNode('.'));
    return frag;
  }

  if (/how many core|count.*core/.test(q)) {
    const frag = buildAnswer('There are ');
    frag.appendChild(bold(String(core.length)));
    frag.appendChild(document.createTextNode(' core logic files.'));
    return frag;
  }

  if (/how many data|count.*data/.test(q)) {
    const frag = buildAnswer('There are ');
    frag.appendChild(bold(String(dl.length)));
    frag.appendChild(document.createTextNode(' data layer files.'));
    return frag;
  }

  if (/how many file|total file|file count/.test(q)) {
    const frag = buildAnswer('This repo has ');
    frag.appendChild(bold(String(total)));
    frag.appendChild(document.createTextNode(
      ` files — ${entry.length} entry, ${core.length} core, ${dl.length} data, ${cfg.length} config.`
    ));
    return frag;
  }

  if (/entry.*file|what.*entry|list.*entry/.test(q)) {
    if (!entry.length) return 'No entry points detected.';
    const frag = document.createDocumentFragment();
    frag.appendChild(document.createTextNode('Entry points: '));
    entry.slice(0, 5).forEach((f, i) => {
      if (i > 0) frag.appendChild(document.createTextNode(', '));
      frag.appendChild(ic(shortName(f)));
    });
    frag.appendChild(document.createTextNode('. Skim for system shape.'));
    return frag;
  }

  if (/core.*file|what.*core/.test(q)) {
    if (!core.length) return 'No core files detected.';
    const frag = document.createDocumentFragment();
    frag.appendChild(document.createTextNode('Core files: '));
    core.slice(0, 5).forEach((f, i) => {
      if (i > 0) frag.appendChild(document.createTextNode(', '));
      frag.appendChild(ic(shortName(f)));
    });
    frag.appendChild(document.createTextNode('. Read these carefully.'));
    return frag;
  }

  if (/data.*file|what.*data|orm|model/.test(q)) {
    if (!dl.length) return 'No data layer files detected.';
    const frag = document.createDocumentFragment();
    frag.appendChild(document.createTextNode('Data layer: '));
    dl.slice(0, 5).forEach((f, i) => {
      if (i > 0) frag.appendChild(document.createTextNode(', '));
      frag.appendChild(ic(shortName(f)));
    });
    frag.appendChild(document.createTextNode('.'));
    return frag;
  }

  if (/flow|how.*data.*move/.test(q)) {
    if (!flow) return 'Flow path not detected yet.';
    const frag = document.createDocumentFragment();
    frag.appendChild(document.createTextNode('Data flow: '));
    flow.split('→').map(s => s.trim()).forEach((p, i) => {
      if (i > 0) frag.appendChild(document.createTextNode(' → '));
      frag.appendChild(ic(p));
    });
    frag.appendChild(document.createTextNode('.'));
    return frag;
  }

  if (/language|what.*lang/.test(q)) {
    if (!langs.length) return 'Language info not available.';
    const frag = document.createDocumentFragment();
    frag.appendChild(document.createTextNode('Languages: '));
    langs.forEach((l, i) => {
      if (i > 0) frag.appendChild(document.createTextNode(', '));
      frag.appendChild(ic(l));
    });
    frag.appendChild(document.createTextNode('.'));
    return frag;
  }

  if (/start|read first|onboard|where.*begin/.test(q)) {
    const steps = archData.walkthrough || [];
    if (!steps.length) return 'Check the Walkthrough tab for the guided reading order.';
    const frag = document.createDocumentFragment();
    frag.appendChild(document.createTextNode('Start with '));
    frag.appendChild(bold(steps[0].title || steps[0].file || ''));
    frag.appendChild(document.createTextNode(
      ' — ' + (steps[0].description || steps[0].desc || '')
    ));
    return frag;
  }
  return `I can answer questions about entry points, core files, data flow, or reading order for ${currentRepo?.fullName}.`;
}

/* utilities */
function shortName(path) {
  return path.split('/').pop();
}