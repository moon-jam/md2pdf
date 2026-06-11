// ============================================================
//  md2pdf  —  browser editor
// ============================================================

const fileInput      = document.getElementById('file-input');
const imageInput     = document.getElementById('image-input');
const folderInput    = document.getElementById('folder-input');
const folderLabel    = document.getElementById('folder-label');
const uploadLabel    = document.getElementById('upload-label');
const uploadArea     = document.getElementById('upload-area');
const editorTextarea = document.getElementById('editor');
const editorPane     = document.getElementById('editor-pane');
const previewFrameA  = document.getElementById('preview-frame-a');
const previewFrameB  = document.getElementById('preview-frame-b');
const pageSizeSelect = document.getElementById('page-size');
const pageNumToggle  = document.getElementById('page-numbers-toggle');
const customCssArea  = document.getElementById('custom-css');
const applyCssBtn    = document.getElementById('apply-css');
const printBtn       = document.getElementById('print-btn');
const printZone      = document.getElementById('print-zone');
const statusEl       = document.getElementById('status');
const resizerEl      = document.getElementById('resizer');
const previewPane    = document.getElementById('preview-pane');
const zoomInBtn      = document.getElementById('zoom-in');
const zoomOutBtn     = document.getElementById('zoom-out');
const zoomLevelTxt   = document.getElementById('zoom-level');
const themeToggle    = document.getElementById('theme-toggle');

const infoBtn        = document.getElementById('info-btn');
const infoModal      = document.getElementById('info-modal-overlay');
const infoCloseBtn   = document.getElementById('info-close-btn');
const infoDontShowChx = document.getElementById('info-dont-show');
const loadExampleBtn = document.getElementById('load-example-btn');
const draftSelect    = document.getElementById('draft-select');
const draftNameInput = document.getElementById('draft-name');
const draftSaveBtn   = document.getElementById('draft-save-btn');
const draftNewBtn    = document.getElementById('draft-new-btn');
const draftDeleteBtn = document.getElementById('draft-delete-btn');

const sidebarResizer = document.getElementById('sidebar-resizer');
const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
const docTitle = document.getElementById('doc-title');

const explorerResizer = document.getElementById('explorer-resizer');
const fileExplorer    = document.getElementById('file-explorer');
const fileTree        = document.getElementById('file-tree');
const explorerClose   = document.getElementById('explorer-close');
const explorerToggle  = document.getElementById('explorer-toggle');

let activePreviewFrame = previewFrameA;
let stagingPreviewFrame = previewFrameB;
let pendingPagedDoneHandler = null;
let renderFallbackTimer = null;
let currentRenderId = 0;

function setPreviewPointerEvents(value) {
  previewFrameA.style.pointerEvents = value;
  previewFrameB.style.pointerEvents = value;
}

function getActivePreviewFrame() {
  return activePreviewFrame;
}

function swapPreviewFrames() {
  const prevActive = activePreviewFrame;
  activePreviewFrame = stagingPreviewFrame;
  stagingPreviewFrame = prevActive;
  activePreviewFrame.classList.add('is-active');
  stagingPreviewFrame.classList.remove('is-active');
}

function postToPreviewFrames(message) {
  previewFrameA.contentWindow?.postMessage(message, '*');
  previewFrameB.contentWindow?.postMessage(message, '*');
}

function clearRenderWaiters() {
  if (pendingPagedDoneHandler) {
    window.removeEventListener('message', pendingPagedDoneHandler);
    pendingPagedDoneHandler = null;
  }
  if (renderFallbackTimer) {
    clearTimeout(renderFallbackTimer);
    renderFallbackTimer = null;
  }
}

// ============================================================
//  Toast notifications — non-blocking replacement for alert()
// ============================================================
let toastContainer = null;

function showToast(message, { type = 'info', duration = 4000, action = null } = {}) {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  if (action) {
    const actionBtn = document.createElement('button');
    actionBtn.className = 'toast-action';
    actionBtn.textContent = action.label;
    actionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toast.remove();
      action.onClick();
    });
    toast.appendChild(actionBtn);
  }
  toastContainer.appendChild(toast);
  // Force layout so the enter transition runs
  void toast.offsetHeight;
  toast.classList.add('toast-show');

  const remove = () => {
    toast.classList.remove('toast-show');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    // Fallback removal if transitionend never fires (e.g. tab hidden)
    setTimeout(() => toast.remove(), 600);
  };
  toast.addEventListener('click', remove);
  setTimeout(remove, duration);
}

// ============================================================
//  Status bar — word count + page count
// ============================================================
let lastPageCount = 0;
let isRendering   = false;

// ── Mascot ──────────────────────────────────────────────────────
let mascotMoverEl = null;
let mascotGuyEl   = null;
let mascotBodyEl  = null;
let mascotX       = 40; // % — persists across re-renders
let mascotMoveTimer = null;
let mascotIdleTimer = null;
let mascotLastScurryAt = 0;
let mascotPointerRaf = 0;
let mascotPointerClientX = 0;

function clampMascotX(x) {
  return Math.max(4, Math.min(86, x));
}

function mascotAlive() {
  return mascotMoverEl && statusEl.contains(mascotMoverEl);
}

function clearMascotTimers() {
  clearTimeout(mascotMoveTimer);
  clearTimeout(mascotIdleTimer);
}

function setMascotRendering(rendering) {
  if (rendering) {
    if (!mascotAlive()) buildMascot(lastPageCount || '?');
    if (!mascotAlive()) return;
    clearMascotTimers();
    statusEl.classList.add('is-rendering');
    mascotGuyEl.classList.remove('walking');
    mascotGuyEl.classList.add('running', 'loading');
    return;
  }

  statusEl.classList.remove('is-rendering');
  if (!mascotAlive()) return;
  mascotGuyEl.classList.remove('walking', 'running', 'loading');
  scheduleMascotMove();
  scheduleMascotIdle();
}

function buildMascot(n) {
  clearMascotTimers();
  statusEl.innerHTML = '';

  const stage = document.createElement('div');
  stage.className = 'mascot-stage';

  const mover = document.createElement('div');
  mover.className = 'mascot-mover';
  mover.style.left = `${mascotX}%`;
  mover.addEventListener('click', () => mascotDo('spin'));

  const guy = document.createElement('div');
  guy.className = 'mascot-guy';

  const body = document.createElement('div');
  body.className = 'mascot-body';
  body.textContent = n;

  const legs = document.createElement('div');
  legs.className = 'mascot-legs';
  legs.innerHTML = '<div class="mascot-leg"></div><div class="mascot-leg"></div>';

  guy.append(body, legs);
  mover.appendChild(guy);
  stage.appendChild(mover);
  statusEl.appendChild(stage);

  mascotMoverEl = mover;
  mascotGuyEl   = guy;
  mascotBodyEl  = body;

  scheduleMascotMove();
  scheduleMascotIdle();
}

function updateMascotCount(n) {
  if (mascotAlive()) {
    if (mascotBodyEl && mascotBodyEl.textContent !== String(n)) {
      mascotBodyEl.textContent = n;
      mascotDo('celebrate');
    }
  } else {
    buildMascot(n);
  }
}

function mascotMoveTo(newX, { duration = 850, walk = true, fast = false } = {}) {
  if (!mascotAlive()) return;
  const clamped = clampMascotX(newX);
  const goRight = clamped > mascotX;
  mascotMoverEl.classList.toggle('flipped', goRight);
  mascotMoverEl.style.transitionDuration = `${duration}ms`;
  mascotX = clamped;
  mascotMoverEl.style.left = `${clamped}%`;

  if (walk) {
    mascotGuyEl.classList.add(fast ? 'running' : 'walking');
    setTimeout(() => {
      if (!mascotGuyEl) return;
      mascotGuyEl.classList.remove('walking', 'running');
    }, Math.max(160, duration - 60));
  }
}

function scheduleMascotMove() {
  clearTimeout(mascotMoveTimer);
  mascotMoveTimer = setTimeout(() => {
    if (!mascotAlive()) return;
    const newX = 8 + Math.random() * 74;
    mascotMoveTo(newX);
    scheduleMascotMove();
  }, 1800 + Math.random() * 3000);
}

function scheduleMascotIdle() {
  clearTimeout(mascotIdleTimer);
  mascotIdleTimer = setTimeout(() => {
    if (!mascotAlive()) return;
    const actions = ['jump', 'jump', 'wiggle', 'spin', 'twirl', 'peek'];
    mascotDo(actions[Math.floor(Math.random() * actions.length)]);
    scheduleMascotIdle();
  }, 2500 + Math.random() * 4500);
}

function mascotDo(action) {
  if (!mascotAlive()) return;
  mascotGuyEl.classList.remove('jump', 'wiggle', 'spin', 'twirl', 'peek', 'celebrate', 'flying');
  // Force reflow so re-adding same class restarts animation
  void mascotGuyEl.offsetWidth;
  mascotGuyEl.classList.add(action);
  const duration = action === 'celebrate' ? 900 : action === 'peek' ? 650 : action === 'flying' ? 620 : 550;
  setTimeout(() => mascotGuyEl && mascotGuyEl.classList.remove(action), duration);
}

function mascotRunAwayFromButton() {
  if (!mascotAlive()) return;
  const now = Date.now();
  if (now - mascotLastScurryAt < 900) return;
  mascotLastScurryAt = now;

  const targetX = mascotX < 50 ? (68 + Math.random() * 14) : (8 + Math.random() * 14);
  mascotDo('jump');
  mascotMoveTo(targetX, { duration: 360, walk: true, fast: true });
  setTimeout(() => mascotDo('peek'), 420);
}

function mascotReactToPointer(clientX) {
  if (!mascotAlive() || isRendering || !printZone) return;

  const rect = printZone.getBoundingClientRect();
  if (!rect.width) return;

  const pointerX = clampMascotX(((clientX - rect.left) / rect.width) * 100);
  const delta = pointerX - mascotX;
  const distance = Math.abs(delta);
  const now = Date.now();

  // Close to mascot -> it dashes away like a mini chase game.
  if (distance < 13) {
    if (now - mascotLastScurryAt < 180) return;
    mascotLastScurryAt = now;
    const awayDir = delta >= 0 ? -1 : 1;
    const jumpStep = 14 + Math.random() * 10;
    mascotDo('jump');
    mascotMoveTo(mascotX + awayDir * jumpStep, { duration: 250, walk: true, fast: true });
    return;
  }

  // Cursor is far -> mascot sometimes hops toward it playfully.
  if (distance > 24 && now - mascotLastScurryAt > 520 && Math.random() < 0.35) {
    mascotLastScurryAt = now;
    const towardDir = delta > 0 ? 1 : -1;
    const hop = 8 + Math.random() * 8;
    mascotMoveTo(mascotX + towardDir * hop, { duration: 330, walk: true, fast: false });
    if (Math.random() < 0.35) mascotDo('wiggle');
  }
}

function mascotFlyAwayAndReturn() {
  if (!mascotAlive()) return;

  const edgeX = Math.random() > 0.5 ? 84 : 6;
  mascotDo('flying');
  mascotMoveTo(edgeX, { duration: 300, walk: true, fast: true });

  setTimeout(() => {
    if (!mascotAlive()) return;
    mascotMoveTo(12 + Math.random() * 68, { duration: 430, walk: true, fast: true });
    mascotDo('jump');
    setTimeout(() => mascotDo('celebrate'), 170);
  }, 340);
}

function updateStatusInfo() {
  if (isRendering) return;
  if (!cm.getValue().trim()) {
    statusEl.classList.remove('is-rendering');
    clearMascotTimers();
    mascotMoverEl = mascotGuyEl = mascotBodyEl = null;
    statusEl.innerHTML = '';
    return;
  }
  if (lastPageCount) {
    updateMascotCount(lastPageCount);
  } else {
    statusEl.innerHTML = '';
  }
}

// ============================================================
//  Marked & Syntax Highlighting
// ============================================================
const { Marked } = window.marked;
const { markedHighlight } = window.markedHighlight;

const markedObj = new Marked(
  markedHighlight({
    highlight(code, lang) {
      if (Prism.languages[lang]) {
        return Prism.highlight(code, Prism.languages[lang], lang);
      } else {
        return code;
      }
    }
  })
);

// ============================================================
//  Document Title  (auto from H1, or manually named)
// ============================================================
let titleEditedByUser = false;

function extractH1(md) {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].replace(/[*_~`]/g, '').trim() : '';
}

function updateTitleFromH1(md) {
  if (titleEditedByUser) return;
  const h1 = extractH1(md);
  if (h1) docTitle.value = h1;
}

let titleFromH1Timer = null;
function scheduleTitleFromH1Update() {
  if (titleEditedByUser) return;
  clearTimeout(titleFromH1Timer);
  titleFromH1Timer = setTimeout(() => {
    titleFromH1Timer = null;
    updateTitleFromH1(cm.getValue());
    syncDraftNameToTitle();
  }, 200);
}

docTitle.addEventListener('input', () => {
  titleEditedByUser = true;
  syncDraftNameToTitle();
  scheduleTextStateSave();
});

// The "?" info dot sits inside the Open Folder <label>; block its clicks so
// hovering/clicking it never opens the directory picker.
const folderInfoDot = document.getElementById('folder-info');
if (folderInfoDot) {
  folderInfoDot.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
}

// ============================================================
//  CodeMirror
// ============================================================
const cm = CodeMirror.fromTextArea(editorTextarea, {
  mode: 'gfm',
  lineNumbers: false,
  lineWrapping: true,
  dragDrop: false,
});

// ============================================================
//  Editor toolbar (HackMD-style formatting shortcuts)
// ============================================================

// Wrap the selection with before/after; with no selection, insert a
// placeholder and select it so the user can type straight over it.
function tbWrap(before, after, placeholder) {
  const doc = cm.getDoc();
  const sel = doc.getSelection();
  if (sel) {
    doc.replaceSelection(before + sel + after, 'around');
  } else {
    const cur = doc.getCursor();
    doc.replaceRange(before + placeholder + after, cur);
    doc.setSelection(
      { line: cur.line, ch: cur.ch + before.length },
      { line: cur.line, ch: cur.ch + before.length + placeholder.length }
    );
  }
  cm.focus();
}

// Toggle a prefix on every selected line (lists, quotes, tasks).
function tbToggleLinePrefix(prefix, { numbered = false } = {}) {
  const doc = cm.getDoc();
  const from = doc.getCursor('from');
  const to = doc.getCursor('to');
  const stripRe = /^(\s*)(?:[-*+]\s\[[ x]\]\s|[-*+]\s|\d+\.\s|>\s)?/;

  const allPrefixed = (() => {
    for (let l = from.line; l <= to.line; l++) {
      const text = doc.getLine(l);
      if (!text.trim()) continue;
      const expected = numbered ? /^\s*\d+\.\s/ : null;
      if (numbered ? !expected.test(text) : !text.trimStart().startsWith(prefix)) return false;
    }
    return true;
  })();

  cm.operation(() => {
    let n = 1;
    for (let l = from.line; l <= to.line; l++) {
      const text = doc.getLine(l);
      if (!text.trim()) continue;
      const m = text.match(stripRe);
      const indent = m[1] || '';
      const rest = text.slice(m[0].length);
      const newPrefix = allPrefixed ? '' : (numbered ? `${n}. ` : prefix);
      doc.replaceRange(indent + newPrefix + rest,
        { line: l, ch: 0 }, { line: l, ch: text.length });
      n++;
    }
  });
  cm.focus();
}

// Set a heading level on every selected line (replaces any existing #'s).
function tbSetHeading(level) {
  const doc = cm.getDoc();
  const from = doc.getCursor('from');
  const to = doc.getCursor('to');
  cm.operation(() => {
    for (let l = from.line; l <= to.line; l++) {
      const text = doc.getLine(l);
      if (!text.trim()) continue;
      const rest = text.replace(/^\s*#{1,6}\s+/, '').replace(/^\s+/, '');
      doc.replaceRange('#'.repeat(level) + ' ' + rest,
        { line: l, ch: 0 }, { line: l, ch: text.length });
    }
  });
  cm.focus();
}

// Insert a standalone block (table, pagebreak) after the current line,
// padded with blank lines so it doesn't glue onto surrounding text.
function tbInsertBlock(text) {
  const doc = cm.getDoc();
  const cur = doc.getCursor();
  const line = doc.getLine(cur.line);
  const lead = line.trim() === '' ? '\n' : '\n\n';
  doc.replaceRange(lead + text + '\n', { line: cur.line, ch: line.length });
  cm.focus();
}

function tbCode() {
  const doc = cm.getDoc();
  const sel = doc.getSelection();
  if (sel.includes('\n')) {
    doc.replaceSelection('```\n' + sel + '\n```', 'around');
    cm.focus();
  } else {
    tbWrap('`', '`', 'code');
  }
}

// ---- Image width via toolbar ----
const TB_IMG_RE = /(!\[[^\]]*\]\([^)\s]+(?:\s+"[^"]*")?\))(\{[^{}]*\})?/g;

function tbApplyImageWidth(width) {
  const doc = cm.getDoc();
  const cur = doc.getCursor();
  const lineText = doc.getLine(cur.line);
  TB_IMG_RE.lastIndex = 0;
  let m, best = null;
  while ((m = TB_IMG_RE.exec(lineText)) !== null) {
    if (!best) best = m;
    // Prefer the image the cursor is actually inside
    if (cur.ch >= m.index && cur.ch <= m.index + m[0].length) { best = m; break; }
  }
  if (!best) {
    showToast('Place the cursor on a line containing a Markdown image first.', { type: 'info' });
    return;
  }
  const replacement = width ? `${best[1]}{width=${width}}` : best[1];
  doc.replaceRange(replacement,
    { line: cur.line, ch: best.index },
    { line: cur.line, ch: best.index + best[0].length });
  cm.focus();
}

const TB_TABLE_SNIPPET =
  '| Column 1 | Column 2 | Column 3 |\n' +
  '| -------- | -------- | -------- |\n' +
  '|          |          |          |';

const tbActions = {
  bold:   () => tbWrap('**', '**', 'bold'),
  italic: () => tbWrap('*', '*', 'italic'),
  strike: () => tbWrap('~~', '~~', 'strikethrough'),
  code:   tbCode,
  quote:  () => tbToggleLinePrefix('> '),
  ul:     () => tbToggleLinePrefix('- '),
  ol:     () => tbToggleLinePrefix('', { numbered: true }),
  task:   () => tbToggleLinePrefix('- [ ] '),
  link:   () => tbWrap('[', '](url)', 'text'),
  image:  () => imageInput.click(),
  table:  () => tbInsertBlock(TB_TABLE_SNIPPET),
  pagebreak: () => tbInsertBlock('<!-- pagebreak -->'),
  heading: (btn) => {
    const r = btn.getBoundingClientRect();
    showContextMenu(r.left, r.bottom + 4, [
      { icon: 'H1', label: 'Heading 1', action: () => tbSetHeading(1) },
      { icon: 'H2', label: 'Heading 2', action: () => tbSetHeading(2) },
      { icon: 'H3', label: 'Heading 3', action: () => tbSetHeading(3) },
    ]);
  },
  imgsize: (btn) => {
    const r = btn.getBoundingClientRect();
    showContextMenu(r.left, r.bottom + 4, [
      { icon: '◔', label: 'Width 25%',  action: () => tbApplyImageWidth('25%') },
      { icon: '◑', label: 'Width 50%',  action: () => tbApplyImageWidth('50%') },
      { icon: '◕', label: 'Width 75%',  action: () => tbApplyImageWidth('75%') },
      { icon: '●', label: 'Width 100%', action: () => tbApplyImageWidth('100%') },
      { icon: '✏️', label: 'Custom…', action: () => {
        const v = prompt('Image width (e.g. 300, 50%, 10em):');
        if (!v) return;
        const width = /^\d+(\.\d+)?$/.test(v.trim()) ? v.trim() + 'px' : v.trim();
        tbApplyImageWidth(width);
      }},
      { icon: '🗑️', label: 'Remove size', action: () => tbApplyImageWidth(null) },
    ]);
  },
};

document.querySelectorAll('#editor-toolbar .tb-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const action = tbActions[btn.dataset.cmd];
    if (action) action(btn);
  });
});

// ============================================================
//  Theme toggle & System Theme Detection
// ============================================================
function getPreviewBackgroundColor() {
  const paneBg = getComputedStyle(previewPane).backgroundColor;
  if (paneBg && paneBg !== 'rgba(0, 0, 0, 0)') return paneBg;
  const fallback = getComputedStyle(document.documentElement)
    .getPropertyValue('--preview-bg')
    .trim();
  return fallback || '#e8eaed';
}

function applyTheme(isDark) {
  themeToggle.checked = isDark;
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  const previewBg = getPreviewBackgroundColor();
  // Notify the iframe so it can update its background without a full re-render
  postToPreviewFrames({
    type: 'theme-change',
    dark: isDark,
    bg: previewBg,
  });
}

// 1. Detect System Theme on load
const systemDarkMode = window.matchMedia('(prefers-color-scheme: dark)');
applyTheme(systemDarkMode.matches);

// 2. Listen for System Theme changes
systemDarkMode.addEventListener('change', (e) => {
  applyTheme(e.matches);
});

// 3. Manual Toggle override
themeToggle.addEventListener('change', (e) => {
  applyTheme(e.target.checked);
});

// ============================================================
//  Resizers (Horizontal)
// ============================================================
let isResizing = false;
let isSidebarResizing = false;

// 1. Editor <-> Preview Resizer
resizerEl.addEventListener('mousedown', () => {
  isResizing = true;
  document.body.classList.add('is-resizing');
  document.body.style.cursor = 'col-resize';
  resizerEl.classList.add('resizing');
  setPreviewPointerEvents('none');
});

// 2. Sidebar <-> Editor Resizer
if (sidebarResizer) {
  sidebarResizer.addEventListener('mousedown', () => {
    isSidebarResizing = true;
    document.body.classList.add('is-resizing');
    document.body.style.cursor = 'col-resize';
    sidebarResizer.classList.add('resizing');
    setPreviewPointerEvents('none');
  });
}

function getSidebarW() {
  if (document.body.classList.contains('sidebar-collapsed')) return 0;
  return parseFloat(getComputedStyle(document.body).getPropertyValue('--sidebar-w')) || 240;
}

document.addEventListener('mousemove', (e) => {
  if (isResizing) {
    const sw = getSidebarW();
    const editorLeft = sw > 0 ? sw + 6 : 0;
    const mid = e.clientX - editorLeft;
    if (mid > 150 && window.innerWidth - e.clientX > 150) {
      document.body.style.setProperty('--editor-w', mid + 'px');
    }
  } else if (isSidebarResizing) {
    let newW = e.clientX;
    if (newW < 80) {
      document.body.classList.add('sidebar-collapsed');
    } else {
      if (newW > window.innerWidth / 2.5) newW = window.innerWidth / 2.5; // max sidebar width
      document.body.classList.remove('sidebar-collapsed');
      document.body.style.setProperty('--sidebar-w', newW + 'px');
    }
  }
});

document.addEventListener('mouseup', () => {
  if (isResizing || isSidebarResizing) {
    isResizing = false;
    isSidebarResizing = false;
    document.body.classList.remove('is-resizing');
    document.body.style.cursor = '';
    resizerEl.classList.remove('resizing');
    if (sidebarResizer) sidebarResizer.classList.remove('resizing');
    setPreviewPointerEvents('');
  }
});

if (sidebarToggleBtn) {
  sidebarToggleBtn.addEventListener('click', () => {
    if (document.body.classList.contains('sidebar-collapsed')) {
      document.body.classList.remove('sidebar-collapsed');
      document.body.style.setProperty('--sidebar-w', '240px');
    } else {
      document.body.classList.add('sidebar-collapsed');
    }
  });
}

// ============================================================
//  Info Modal
// ============================================================
if (infoBtn && infoModal && infoCloseBtn) {
  const closeInfoModal = () => { infoModal.hidden = true; };
  infoBtn.addEventListener('click', () => { infoModal.hidden = false; });
  infoCloseBtn.addEventListener('click', closeInfoModal);
  infoModal.addEventListener('click', (e) => {
    if (e.target === infoModal) closeInfoModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !infoModal.hidden) closeInfoModal();
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (!printBtn.disabled) printBtn.click();
    }
  });
  
  if (infoDontShowChx) {
    infoDontShowChx.addEventListener('change', (e) => {
      localStorage.setItem('md2pdf_hide_info', e.target.checked ? 'true' : 'false');
    });
  }
}

// ============================================================
//  Load Example Button
// ============================================================
async function fetchExample() {
  try {
    const response = await fetch('./example.md');
    return await response.text();
  } catch (err) {
    console.error('Failed to load example.md', err);
    return '';
  }
}

if (loadExampleBtn) {
  loadExampleBtn.addEventListener('click', async () => {
    if (cm.getValue().trim()) {
      if (!confirm('This will replace your current content with the example. Continue?')) return;
    }
    const example = await fetchExample();
    if (example) {
      titleEditedByUser = false;
      cm.setValue(example);
      scheduleRender();
      saveLocalTextState();
    }
  });
}

if (draftSelect) {
  draftSelect.addEventListener('change', (e) => {
    switchToDraft(e.target.value);
  });
}

if (draftSaveBtn) {
  draftSaveBtn.addEventListener('click', () => {
    saveActiveDraftSnapshot({ syncUi: true });
  });
}

if (draftNewBtn) {
  draftNewBtn.addEventListener('click', () => {
    createNewDraft();
  });
}

if (draftDeleteBtn) {
  draftDeleteBtn.addEventListener('click', () => {
    deleteCurrentDraft();
  });
}

if (draftNameInput) {
  draftNameInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    saveActiveDraftSnapshot({ syncUi: true });
  });

  draftNameInput.addEventListener('blur', () => {
    saveActiveDraftSnapshot({ syncUi: true });
  });
}

// ============================================================
//  File Explorer Resizer (Vertical)
// ============================================================
let isExpResizing = false;
let expStartY = 0;
let expStartHeight = 0;

if (explorerResizer) {
  explorerResizer.addEventListener('mousedown', (e) => {
    isExpResizing = true;
    expStartY = e.clientY;
    expStartHeight = fileExplorer.offsetHeight;
    document.body.style.cursor = 'ns-resize';
    explorerResizer.classList.add('dragging');
  });

  document.addEventListener('mousemove', (e) => {
    if (!isExpResizing) return;
    const dy = expStartY - e.clientY; // dragged up = positive dy
    let newHeight = expStartHeight + dy;
    if (newHeight < 60) newHeight = 60;
    if (newHeight > window.innerHeight * 0.8) newHeight = window.innerHeight * 0.8;
    fileExplorer.style.height = newHeight + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!isExpResizing) return;
    isExpResizing = false;
    document.body.style.cursor = '';
    explorerResizer.classList.remove('dragging');
  });
}

// ============================================================
//  Zoom  (applied after each render via CSS var)
// ============================================================
let currentZoom = 0.5;

function applyZoom() {
  zoomLevelTxt.textContent = Math.round(currentZoom * 100) + '%';
  try {
    const doc = getActivePreviewFrame().contentDocument;
    if (doc) {
      // Zooming the inner container instead of body fixes flex centering issues in Webkit
      const pagesContainer = doc.querySelector('.pagedjs_pages');
      if (pagesContainer) {
        pagesContainer.style.zoom = currentZoom;
      } else {
        doc.body.style.zoom = currentZoom; // Fallback during initial load
      }
    }
  } catch (_) {}
}

zoomInBtn.addEventListener('click', () => {
  currentZoom = Math.min(4, +(currentZoom + 0.25).toFixed(2));
  applyZoom();
});
zoomOutBtn.addEventListener('click', () => {
  currentZoom = Math.max(0.25, +(currentZoom - 0.25).toFixed(2));
  applyZoom();
});

// ============================================================
//  Pinch-to-zoom (trackpad on Mac = ctrlKey + wheel from iframe)
//  The iframe script intercepts ctrlKey+wheel and postMessages to us.
// ============================================================
window.addEventListener('message', (e) => {
  if (e.data?.type === 'pinch-zoom') {
    if (e.source !== getActivePreviewFrame().contentWindow) return;
    const factor = 1 - e.data.delta * 0.005;
    currentZoom = Math.max(0.25, Math.min(4, +(currentZoom * factor).toFixed(3)));
    applyZoom();
  }
});


// ============================================================
//  File upload
// ============================================================
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  openFileIntoDraft(file.name, await file.text());
  e.target.value = '';
});

uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
uploadArea.addEventListener('drop', async (e) => {
  e.preventDefault();
  uploadArea.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (!file) return;
  openFileIntoDraft(file.name, await file.text());
});

imageInput.addEventListener('change', async (e) => {
  const files = e.target.files;
  if (!files || files.length === 0) return;
  for (let i = 0; i < files.length; i++) {
    await insertImageAtCursor(files[i]);
  }
  // reset input so the same file could be selected again if needed
  e.target.value = '';
});

// ============================================================
//  State Persistence (IndexedDB + localStorage)
// ============================================================
const DB_NAME = 'md2pdf_db';
const STORE_NAME = 'state';
const DRAFTS_STORAGE_KEY = 'md2pdf_drafts_v1';
const ACTIVE_DRAFT_STORAGE_KEY = 'md2pdf_active_draft_v1';

let drafts = [];
let activeDraftId = '';

function initDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, val) {
  try {
    const db = await initDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(val, key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch (e) {
    console.warn('IDB save failed:', e);
  }
}

async function idbGet(key) {
  try {
    const db = await initDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  } catch (e) {
    console.warn('IDB load failed:', e);
    return null;
  }
}

function saveLocalTextState() {
  localStorage.setItem('md2pdf_editor', cm.getValue());
  localStorage.setItem('md2pdf_pageSize', pageSizeSelect.value);
  localStorage.setItem('md2pdf_pageNum', pageNumToggle.checked ? 'true' : 'false');
  localStorage.setItem('md2pdf_css', customCssArea.value);
  localStorage.setItem('md2pdf_zoom', currentZoom);
  localStorage.setItem('md2pdf_title', docTitle.value);
  localStorage.setItem('md2pdf_title_edited', titleEditedByUser ? 'true' : 'false');
  saveActiveDraftSnapshot();
}

// Trailing-debounced wrapper so high-frequency events (keystroke, title typing)
// don't issue 7+ synchronous localStorage writes per character.
let textStateSaveTimer = null;
const TEXT_STATE_SAVE_DEBOUNCE_MS = 400;

function scheduleTextStateSave() {
  clearTimeout(textStateSaveTimer);
  textStateSaveTimer = setTimeout(() => {
    textStateSaveTimer = null;
    saveLocalTextState();
  }, TEXT_STATE_SAVE_DEBOUNCE_MS);
}

function flushTextStateSave() {
  if (textStateSaveTimer === null) return;
  clearTimeout(textStateSaveTimer);
  textStateSaveTimer = null;
  saveLocalTextState();
}

function createDraftId() {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeDefaultDraftName() {
  const usedNames = new Set(drafts.map((d) => d.name));
  let n = 1;
  while (usedNames.has(`Draft ${n}`)) n++;
  return `Draft ${n}`;
}

// When the user opens a .md file, the active draft adopts the filename
// (without extension) so the draft list mirrors what is actually loaded.
function renameActiveDraftToFile(filename) {
  const draft = getDraftById(activeDraftId);
  if (!draft) return;
  const base = draftNameFromFilename(filename);
  let name = base;
  let n = 2;
  while (drafts.some((d) => d.id !== draft.id && d.name === name)) {
    name = `${base} ${n}`;
    n++;
  }
  draft.name = name;
  // Filename naming is automatic; let later H1/title changes keep syncing.
  draft.nameEditedByUser = false;
  if (draftNameInput) draftNameInput.value = name;
  persistDrafts();
  refreshDraftControls();
}

function draftNameFromFilename(filename) {
  return filename.replace(/\.(md|markdown)$/i, '').trim() || filename;
}

// Keep the draft name in lockstep with the document title (the PDF
// filename, usually auto-derived from the H1). Stops once the user
// manually renames the draft (draft.nameEditedByUser).
function syncDraftNameToTitle() {
  const draft = getDraftById(activeDraftId);
  if (!draft || draft.nameEditedByUser) return;
  const title = docTitle.value.trim();
  if (!title || title === 'Untitled Document') return;
  if (draft.name === title) return;
  let name = title;
  let n = 2;
  while (drafts.some((d) => d.id !== draft.id && d.name === name)) {
    name = `${title} ${n}`;
    n++;
  }
  if (draft.name === name) return;
  draft.name = name;
  if (draftNameInput) draftNameInput.value = name;
  persistDrafts();
  refreshDraftControls();
}

// Opening a .md file lands in its own draft instead of overwriting the
// current one:
//   - a draft with the same name already exists -> reuse it (re-opening the
//     same file just refreshes that draft)
//   - the current draft is empty -> reuse it (no point leaving a blank one)
//   - otherwise -> create a fresh draft, like pressing "New"
function openFileIntoDraft(filename, text) {
  saveActiveDraftSnapshot();

  const base = draftNameFromFilename(filename);
  let target = drafts.find((d) => d.name === base);
  if (!target) {
    const current = getDraftById(activeDraftId);
    if (current && !(current.text || '').trim()) target = current;
  }
  if (!target) {
    target = {
      id: createDraftId(),
      name: base,
      text: '',
      title: 'Untitled Document',
      titleEditedByUser: false,
      updatedAt: Date.now(),
    };
    drafts.unshift(target);
  }

  activeDraftId = target.id;
  titleEditedByUser = false;
  docTitle.value = 'Untitled Document';
  cm.setValue(text);
  renameActiveDraftToFile(filename);
  uploadLabel.textContent = filename;
  persistDrafts();
  refreshDraftControls();
  scheduleRender();
}

function getDraftById(id) {
  return drafts.find((d) => d.id === id) || null;
}

function persistDrafts() {
  localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  if (activeDraftId) localStorage.setItem(ACTIVE_DRAFT_STORAGE_KEY, activeDraftId);
}

function refreshDraftControls() {
  if (!draftSelect) return;

  draftSelect.innerHTML = '';
  for (const draft of drafts) {
    const opt = document.createElement('option');
    opt.value = draft.id;
    opt.textContent = draft.name;
    if (draft.id === activeDraftId) opt.selected = true;
    draftSelect.appendChild(opt);
  }

  const activeDraft = getDraftById(activeDraftId);
  if (draftNameInput) draftNameInput.value = activeDraft?.name || '';
  if (draftDeleteBtn) draftDeleteBtn.disabled = drafts.length <= 1;
}

function loadDraftIntoEditor(draft) {
  if (!draft) return;
  titleEditedByUser = !!draft.titleEditedByUser;
  docTitle.value = draft.title || 'Untitled Document';
  if (draftNameInput) draftNameInput.value = draft.name || '';
  cm.setValue(draft.text || '');
}

function saveActiveDraftSnapshot({ syncUi = false } = {}) {
  const draft = getDraftById(activeDraftId);
  if (!draft) return;

  draft.text = cm.getValue();
  draft.title = docTitle.value;
  draft.titleEditedByUser = !!titleEditedByUser;
  draft.updatedAt = Date.now();

  const nameFromInput = draftNameInput?.value?.trim();
  if (nameFromInput && nameFromInput !== draft.name) {
    const conflict = drafts.some((d) => d.id !== draft.id && d.name === nameFromInput);
    if (conflict) {
      if (draftNameInput) draftNameInput.value = draft.name;
      showToast(`Draft name "${nameFromInput}" already exists.`, { type: 'warning' });
      return;
    }
    draft.name = nameFromInput;
    // A hand-typed name wins over automatic title sync from now on.
    draft.nameEditedByUser = true;
  }

  persistDrafts();
  if (syncUi) refreshDraftControls();
}

function switchToDraft(nextId) {
  if (!nextId || nextId === activeDraftId) return;

  saveActiveDraftSnapshot();
  const nextDraft = getDraftById(nextId);
  if (!nextDraft) return;

  activeDraftId = nextDraft.id;
  persistDrafts();
  refreshDraftControls();
  loadDraftIntoEditor(nextDraft);
}

function createNewDraft() {
  saveActiveDraftSnapshot();

  const newDraft = {
    id: createDraftId(),
    name: makeDefaultDraftName(),
    text: '',
    title: 'Untitled Document',
    titleEditedByUser: false,
    updatedAt: Date.now(),
  };

  drafts.unshift(newDraft);
  activeDraftId = newDraft.id;
  persistDrafts();
  refreshDraftControls();
  uploadLabel.textContent = 'Open .md file';
  loadDraftIntoEditor(newDraft);
}

function deleteCurrentDraft() {
  if (drafts.length <= 1) {
    showToast('At least one draft is required.', { type: 'warning' });
    return;
  }

  const activeDraft = getDraftById(activeDraftId);
  if (!activeDraft) return;
  if (!confirm(`Delete draft "${activeDraft.name}"?`)) return;

  const idx = drafts.findIndex((d) => d.id === activeDraftId);
  if (idx < 0) return;

  drafts.splice(idx, 1);
  const nextDraft = drafts[Math.max(0, idx - 1)] || drafts[0] || null;
  if (!nextDraft) return;

  activeDraftId = nextDraft.id;
  persistDrafts();
  refreshDraftControls();
  uploadLabel.textContent = 'Open .md file';
  loadDraftIntoEditor(nextDraft);
}

function hydrateDraftsFromStorage() {
  let parsedDrafts = [];
  try {
    const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsedDrafts = parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to parse drafts from storage', e);
  }

  const seenIds = new Set();
  drafts = parsedDrafts
    .map((item, idx) => {
      if (!item || typeof item !== 'object') return null;
      const draft = {
        id: typeof item.id === 'string' && item.id ? item.id : createDraftId(),
        name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : `Draft ${idx + 1}`,
        text: typeof item.text === 'string' ? item.text : '',
        title: typeof item.title === 'string' && item.title ? item.title : 'Untitled Document',
        titleEditedByUser: !!item.titleEditedByUser,
        updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : Date.now(),
      };
      if (seenIds.has(draft.id)) draft.id = createDraftId();
      seenIds.add(draft.id);
      return draft;
    })
    .filter(Boolean);

  if (!drafts.length) {
    const legacyText = localStorage.getItem('md2pdf_editor') || '';
    const legacyTitle = localStorage.getItem('md2pdf_title') || 'Untitled Document';
    const legacyTitleEdited = localStorage.getItem('md2pdf_title_edited') === 'true';
    drafts = [{
      id: createDraftId(),
      name: 'Draft 1',
      text: legacyText,
      title: legacyTitle,
      titleEditedByUser: legacyTitleEdited,
      updatedAt: Date.now(),
    }];
  }

  const storedActiveId = localStorage.getItem(ACTIVE_DRAFT_STORAGE_KEY);
  activeDraftId = drafts.some((d) => d.id === storedActiveId)
    ? storedActiveId
    : drafts[0].id;

  persistDrafts();
  refreshDraftControls();
}

// ============================================================
//  Image Store  — keep base64 out of the editor text
//  Editor shows:  ![alt]({{img:1}})   or   <img src="{{img:2}}">
//  At render time we swap {{img:N}} → real data URL.
// ============================================================
let imageStore = {};  // { '{{img:1}}': 'data:image/png;base64,...', ... }
let imageCounter = 0;

function storeImage(dataUrl, label) {
  let baseTag = label;
  if (!baseTag) {
    do {
      imageCounter++;
      baseTag = `img:${imageCounter}`;
    } while (Object.prototype.hasOwnProperty.call(imageStore, `{{${baseTag}}}`));
  }

  let tag = baseTag;
  let suffix = 2;
  while (Object.prototype.hasOwnProperty.call(imageStore, `{{${tag}}}`)) {
    tag = `${baseTag}-${suffix}`;
    suffix++;
  }

  const placeholder = `{{${tag}}}`;

  imageStore[placeholder] = dataUrl;

  scheduleImageStoreSave();

  return placeholder;
}

let imageStoreSaveTimer = null;
const IMAGE_STORE_SAVE_DEBOUNCE_MS = 300;

function scheduleImageStoreSave() {
  clearTimeout(imageStoreSaveTimer);
  imageStoreSaveTimer = setTimeout(() => {
    imageStoreSaveTimer = null;
    idbSet('imageStore', imageStore);
    idbSet('imageCounter', imageCounter);
  }, IMAGE_STORE_SAVE_DEBOUNCE_MS);
}

function flushImageStoreSave() {
  if (imageStoreSaveTimer === null) return;
  clearTimeout(imageStoreSaveTimer);
  imageStoreSaveTimer = null;
  idbSet('imageStore', imageStore);
  idbSet('imageCounter', imageCounter);
}

// ---- Blob URL cache ----
// Embedding base64 directly into the iframe HTML makes the document string
// huge (a few photos → tens of MB per render). Instead we convert each stored
// data URL to a Blob once, cache the object URL, and embed the short blob:
// URL. srcdoc iframes share the parent origin, so blob: URLs resolve fine in
// the preview and survive into the print dialog (we never revoke while the
// image is still stored).
const imageBlobUrlCache = new Map();  // placeholder -> blob: URL

function dataUrlToBlob(dataUrl) {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return null;
  const header = dataUrl.slice(0, comma);
  const mime = (header.match(/^data:([^;,]+)/) || [])[1] || 'application/octet-stream';
  const body = dataUrl.slice(comma + 1);
  if (/;base64$/i.test(header)) {
    const bin = atob(body);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }
  return new Blob([decodeURIComponent(body)], { type: mime });
}

function getImageRenderUrl(placeholder) {
  const cached = imageBlobUrlCache.get(placeholder);
  if (cached) return cached;
  const dataUrl = imageStore[placeholder];
  if (!dataUrl) return null;
  try {
    const blob = dataUrlToBlob(dataUrl);
    if (!blob) return dataUrl;
    const url = URL.createObjectURL(blob);
    imageBlobUrlCache.set(placeholder, url);
    return url;
  } catch {
    return dataUrl; // fall back to inline base64 on any decode hiccup
  }
}

function revokeImageBlobUrl(placeholder) {
  const url = imageBlobUrlCache.get(placeholder);
  if (url) {
    URL.revokeObjectURL(url);
    imageBlobUrlCache.delete(placeholder);
  }
}

/** Replace all {{img:N}} placeholders in a string with short blob: URLs. */
function resolveImages(text) {
  if (!imageStore || Object.keys(imageStore).length === 0) return text;
  return text.replace(/\{\{[^}]+\}\}/g, (m) => getImageRenderUrl(m) || m);
}

// ============================================================
//  Image Manager — explorer-style panel listing stored images
//  grouped per draft (like the folder tree), with used/unused
//  badges, click-to-preview and per-image / bulk cleanup.
// ============================================================
const imageManagerEl       = document.getElementById('image-manager');
const imageManagerBtn      = document.getElementById('image-manager-btn');
const imageManagerClose    = document.getElementById('image-manager-close');
const imageCleanUnusedBtn  = document.getElementById('image-clean-unused-btn');
const imageTreeEl          = document.getElementById('image-tree');

function scanPlaceholders(text) {
  const found = new Set();
  if (text) {
    for (const m of text.matchAll(/\{\{[^}]+\}\}/g)) found.add(m[0]);
  }
  return found;
}

// Placeholder usage across all documents. The active draft uses the live
// editor text so unsaved edits count.
function computeImageUsage() {
  const perDraft = [];
  const usedAnywhere = new Set();
  for (const draft of drafts) {
    const text = draft.id === activeDraftId ? cm.getValue() : draft.text;
    const refs = scanPlaceholders(text);
    const stored = [...refs].filter((p) => imageStore[p]);
    if (stored.length) perDraft.push({ draft, placeholders: stored });
    for (const p of stored) usedAnywhere.add(p);
  }
  const unused = Object.keys(imageStore).filter((p) => !usedAnywhere.has(p));
  return { perDraft, unused };
}

function imageDisplayName(placeholder) {
  // '{{img:photo.png}}' -> 'photo.png', '{{img:3}}' -> 'img:3'
  const inner = placeholder.slice(2, -2);
  const stripped = inner.replace(/^img:/, '');
  return /^\d+(-\d+)?$/.test(stripped) ? inner : stripped;
}

// Feather-style download icon (tray + arrow), matches the sidebar icons.
const DOWNLOAD_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

const MIME_TO_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/x-icon': 'ico',
  'image/avif': 'avif',
};

function downloadImage(dataUrl, name) {
  try {
    const blob = dataUrlToBlob(dataUrl);
    if (!blob) throw new Error('invalid image data');
    let filename = (name || 'image').replace(/[/\\:*?"<>|]/g, '_');
    if (!/\.[a-z0-9]+$/i.test(filename)) {
      filename += '.' + (MIME_TO_EXT[blob.type] || 'png');
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    showToast('Download failed: ' + (e.message || e), { type: 'error' });
  }
}

function deleteStoredImage(placeholder) {
  delete imageStore[placeholder];
  revokeImageBlobUrl(placeholder);
  // Write through immediately — flushImageStoreSave() is a no-op unless a
  // debounced save is already pending.
  clearTimeout(imageStoreSaveTimer);
  imageStoreSaveTimer = null;
  idbSet('imageStore', imageStore);
  idbSet('imageCounter', imageCounter);
}

function makeImageTreeItem(placeholder, used) {
  const item = document.createElement('div');
  item.className = 'tree-item';
  const name = imageDisplayName(placeholder);
  const thumbUrl = getImageRenderUrl(placeholder);

  const thumb = document.createElement('img');
  thumb.className = 'img-thumb';
  thumb.loading = 'lazy';
  if (thumbUrl) thumb.src = thumbUrl;

  const label = document.createElement('span');
  label.className = 'tree-name';
  label.textContent = name;
  item.title = name + ' — click to preview';

  const badge = document.createElement('span');
  badge.className = 'tree-badge ' + (used ? 'badge-used' : 'badge-unused');
  badge.textContent = used ? 'used' : 'unused';

  item.appendChild(thumb);
  item.appendChild(label);
  item.appendChild(badge);

  // Swaps in where the used/unused badge sits while the row is hovered.
  const dl = document.createElement('button');
  dl.className = 'icon-btn img-dl-btn';
  dl.title = 'Download this image';
  dl.innerHTML = DOWNLOAD_ICON_SVG;
  dl.addEventListener('click', (e) => {
    e.stopPropagation();
    downloadImage(imageStore[placeholder], name);
  });
  item.appendChild(dl);

  if (!used) {
    const del = document.createElement('button');
    del.className = 'icon-btn img-action-btn img-delete-btn';
    del.title = 'Delete this image';
    del.textContent = '\u2715';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteStoredImage(placeholder);
      renderImageManager();
      showToast('Removed "' + name + '".', { type: 'success' });
    });
    item.appendChild(del);
  }

  item.addEventListener('click', () => {
    const dataUrl = imageStore[placeholder];
    if (dataUrl) showImagePreview(dataUrl, name);
  });

  return item;
}

function makeImageTreeFolder(title, icon, count) {
  const toggle = document.createElement('div');
  toggle.className = 'tree-folder-toggle';
  toggle.innerHTML = '<span class="chevron">\u25bc</span><span class="tree-icon">' + icon + '</span>';
  const titleEl = document.createElement('span');
  titleEl.textContent = title + ' (' + count + ')';
  toggle.appendChild(titleEl);

  const children = document.createElement('div');
  children.className = 'tree-children';

  toggle.addEventListener('click', () => {
    toggle.classList.toggle('collapsed');
    children.classList.toggle('collapsed');
  });
  return { toggle, children };
}

// Folder open/closed state survives live refreshes (keyed by draft id / 'unused')
const imageManagerCollapsed = new Set();

function addImageManagerFolder(key, title, icon, placeholders, used) {
  const { toggle, children } = makeImageTreeFolder(title, icon, placeholders.length);
  if (imageManagerCollapsed.has(key)) {
    toggle.classList.add('collapsed');
    children.classList.add('collapsed');
  }
  toggle.addEventListener('click', () => {
    if (toggle.classList.contains('collapsed')) imageManagerCollapsed.add(key);
    else imageManagerCollapsed.delete(key);
  });
  imageTreeEl.appendChild(toggle);
  imageTreeEl.appendChild(children);
  for (const p of placeholders) children.appendChild(makeImageTreeItem(p, used));
}

function renderImageManager() {
  if (!imageTreeEl) return;
  imageTreeEl.innerHTML = '';

  const { perDraft, unused } = computeImageUsage();

  if (!perDraft.length && !unused.length) {
    const empty = document.createElement('div');
    empty.className = 'image-tree-empty';
    empty.textContent = 'No stored images yet. Paste or insert an image to see it here.';
    imageTreeEl.appendChild(empty);
    if (imageCleanUnusedBtn) imageCleanUnusedBtn.disabled = true;
    return;
  }

  for (const { draft, placeholders } of perDraft) {
    addImageManagerFolder(draft.id, draft.name, '\ud83d\udcdd', placeholders, true);
  }

  if (unused.length) {
    addImageManagerFolder('unused', 'Unused', '\ud83d\uddd1\ufe0f', unused, false);
  }

  if (imageCleanUnusedBtn) {
    imageCleanUnusedBtn.disabled = !unused.length;
    imageCleanUnusedBtn.title = unused.length
      ? 'Clean all ' + unused.length + ' unused image(s)'
      : 'No unused images to clean';
  }
}

// Live refresh while the panel is open \u2014 debounced so fast typing only
// rebuilds the tree once. computeImageUsage() reads the live editor text for
// the active draft, so no draft snapshot is needed here.
let imageManagerRefreshTimer = null;
function scheduleImageManagerRefresh() {
  if (!imageManagerEl || imageManagerEl.hidden) return;
  clearTimeout(imageManagerRefreshTimer);
  imageManagerRefreshTimer = setTimeout(() => {
    imageManagerRefreshTimer = null;
    if (!imageManagerEl.hidden) renderImageManager();
  }, 400);
}

if (imageManagerBtn) {
  imageManagerBtn.addEventListener('click', () => {
    const opening = imageManagerEl.hidden;
    imageManagerEl.hidden = !opening;
    if (opening) {
      // Snapshot once on open so other drafts' texts are current too.
      saveActiveDraftSnapshot();
      renderImageManager();
    }
  });
}

if (imageManagerClose) {
  imageManagerClose.addEventListener('click', () => { imageManagerEl.hidden = true; });
}

if (imageCleanUnusedBtn) {
  imageCleanUnusedBtn.addEventListener('click', () => {
    saveActiveDraftSnapshot();
    const { unused } = computeImageUsage();
    if (!unused.length) {
      showToast('No unused images to clean.', { type: 'info' });
      return;
    }
    if (!confirm('Remove ' + unused.length + ' image(s) not referenced by any draft? This cannot be undone.')) return;
    for (const p of unused) deleteStoredImage(p);
    renderImageManager();
    showToast('Removed ' + unused.length + ' unused image(s).', { type: 'success' });
  });
}

// ============================================================
//  Folder upload — file explorer + resolve local image paths
// ============================================================

// Stored folder state
let folderFiles = [];      // All File objects from the folder
let folderRoot  = '';      // The top-level folder name
let folderMdDir = '';      // The directory containing the active .md file

explorerClose.addEventListener('click', () => {
  fileExplorer.hidden = true;
  if (folderFiles.length) explorerToggle.hidden = false;
});

explorerToggle.addEventListener('click', () => {
  fileExplorer.hidden = false;
  explorerToggle.hidden = true;
});

/** Build a nested tree structure from a flat file list. */
function buildTree(files) {
  const root = { name: '', children: {}, files: [] };
  for (const f of files) {
    const parts = f.webkitRelativePath.split('/');
    // Skip the root folder name (parts[0])
    let node = root;
    for (let i = 1; i < parts.length - 1; i++) {
      if (!node.children[parts[i]]) {
        node.children[parts[i]] = { name: parts[i], children: {}, files: [] };
      }
      node = node.children[parts[i]];
    }
    node.files.push({ name: parts[parts.length - 1], file: f });
  }
  return root;
}

/** Get an icon emoji for a file based on extension. */
function fileIcon(name) {
  if (/\.(md|markdown)$/i.test(name)) return '📝';
  if (/\.(png|jpe?g|gif|svg|webp|bmp|ico|avif)$/i.test(name)) return '🖼️';
  if (/\.(css)$/i.test(name)) return '🎨';
  if (/\.(js|ts)$/i.test(name)) return '⚙️';
  if (/\.(json|ya?ml|toml)$/i.test(name)) return '📋';
  return '📄';
}

const IMAGE_EXTS = /\.(png|jpe?g|gif|svg|webp|bmp|ico|avif)$/i;

/** Render a tree node into the DOM. */
function renderTreeNode(node, container) {
  // Sort: folders first, then files alphabetically
  const folderNames = Object.keys(node.children).sort();
  const sortedFiles = [...node.files].sort((a, b) => a.name.localeCompare(b.name));

  for (const fname of folderNames) {
    const child = node.children[fname];

    const toggle = document.createElement('div');
    toggle.className = 'tree-folder-toggle';
    toggle.innerHTML = `<span class="chevron">▼</span><span class="tree-icon">📁</span><span>${fname}</span>`;

    const childContainer = document.createElement('div');
    childContainer.className = 'tree-children';

    toggle.addEventListener('click', () => {
      toggle.classList.toggle('collapsed');
      childContainer.classList.toggle('collapsed');
    });

    container.appendChild(toggle);
    container.appendChild(childContainer);
    renderTreeNode(child, childContainer);
  }

  for (const { name, file } of sortedFiles) {
    const item = document.createElement('div');
    item.className = 'tree-item';

    const ext = name.match(/\.(\w+)$/)?.[1]?.toUpperCase() || '';
    const isImage = IMAGE_EXTS.test(name);
    const badgeHtml = isImage ? `<span class="tree-badge">${ext}</span>` : '';

    item.innerHTML = `<span class="tree-icon">${fileIcon(name)}</span><span class="tree-name">${name}</span>${badgeHtml}`;
    item.title = file.webkitRelativePath;

    // Markdown files: click to load
    if (/\.(md|markdown)$/i.test(name)) {
      item.addEventListener('click', () => loadMdFromFolder(file));
    }
    // Image files: click to preview, right-click to insert
    else if (isImage) {
      const relPath = file.webkitRelativePath;
      const relToMd = relPath.startsWith(folderRoot + '/')
        ? relPath.substring(folderRoot.length + 1)
        : relPath;

      // Click → full preview
      item.addEventListener('click', async () => {
        const dataUrl = await readFileAsDataURL(file);
        storeImage(dataUrl, 'img:' + relToMd);
        showImagePreview(dataUrl, name);
      });

      // Right-click → context menu
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, [
          { icon: '📋', label: 'Insert at cursor', action: async () => {
            const dataUrl = await readFileAsDataURL(file);
            const placeholder = storeImage(dataUrl, 'img:' + relToMd);
            const alt = name.replace(/\.[^.]+$/, '');
            cm.getDoc().replaceRange(`\n![${alt}](${placeholder})\n`, cm.getDoc().getCursor());
            scheduleRender();
          }},
          { icon: '👁️', label: 'Preview', action: async () => {
            const dataUrl = await readFileAsDataURL(file);
            storeImage(dataUrl, 'img:' + relToMd);
            showImagePreview(dataUrl, name);
          }},
        ]);
      });
    }

    container.appendChild(item);
  }
}

// ---- Context Menu ----
function showContextMenu(x, y, items) {
  closeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'ctx-menu';

  for (const item of items) {
    const el = document.createElement('div');
    el.className = 'ctx-menu-item';
    el.innerHTML = `<span class="ctx-icon">${item.icon}</span>${item.label}`;
    el.addEventListener('click', () => {
      closeContextMenu();
      item.action();
    });
    menu.appendChild(el);
  }

  // Position: keep on screen
  menu.style.left = Math.min(x, window.innerWidth - 180) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - 120) + 'px';
  document.body.appendChild(menu);

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', closeContextMenu, { once: true });
    document.addEventListener('contextmenu', closeContextMenu, { once: true });
  }, 10);
}

function closeContextMenu() {
  document.querySelectorAll('.ctx-menu').forEach(el => el.remove());
}

// ---- Image Preview Lightbox ----
function showImagePreview(dataUrl, filename) {
  closeImagePreview();
  const overlay = document.createElement('div');
  overlay.className = 'img-preview-overlay';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'preview-close';
  closeBtn.innerHTML = '✕';
  closeBtn.title = 'Close (Esc)';
  closeBtn.addEventListener('click', closeImagePreview);

  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'preview-download';
  downloadBtn.innerHTML = DOWNLOAD_ICON_SVG.replace('width="12" height="12"', 'width="16" height="16"');
  downloadBtn.title = 'Download image';
  downloadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    downloadImage(dataUrl, filename);
  });

  const container = document.createElement('div');
  container.className = 'preview-container';

  const img = document.createElement('img');
  img.src = dataUrl;
  img.alt = filename;

  const label = document.createElement('div');
  label.className = 'preview-filename';
  label.textContent = filename;

  container.appendChild(img);
  container.appendChild(label);
  overlay.appendChild(closeBtn);
  overlay.appendChild(downloadBtn);
  overlay.appendChild(container);

  // Click backdrop (outside image) to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeImagePreview();
  });

  // Esc to close — handler is deregistered in closeImagePreview() so it can't
  // leak when the preview is closed by button/backdrop click instead of Esc.
  imagePreviewEscHandler = (e) => {
    if (e.key === 'Escape') closeImagePreview();
  };
  document.addEventListener('keydown', imagePreviewEscHandler);

  document.body.appendChild(overlay);
}

let imagePreviewEscHandler = null;

function closeImagePreview() {
  document.querySelectorAll('.img-preview-overlay').forEach(el => el.remove());
  if (imagePreviewEscHandler) {
    document.removeEventListener('keydown', imagePreviewEscHandler);
    imagePreviewEscHandler = null;
  }
}

/** Highlight the active .md file in the tree. */
function setActiveFile(filePath) {
  fileTree.querySelectorAll('.tree-item.active').forEach(el => el.classList.remove('active'));
  fileTree.querySelectorAll('.tree-item').forEach(el => {
    if (el.title === filePath) el.classList.add('active');
  });
}

async function loadMdFromFolder(file) {
  const text = await file.text();
  
  // Keep mdDir for image path resolution matching
  const mdRelPath = file.webkitRelativePath || file.name;
  const mdDir = mdRelPath.includes('/') ? mdRelPath.substring(0, mdRelPath.lastIndexOf('/') + 1) : '';
  folderMdDir = mdDir;
  
  titleEditedByUser = false;
  
  const imageFiles = folderFiles.filter(f => IMAGE_EXTS.test(f.name));
  const pathToPlaceholder = {};

  await Promise.all(imageFiles.map(async (imgFile) => {
    const imgRelPath = imgFile.webkitRelativePath;
    const relToMd = imgRelPath.startsWith(mdDir)
      ? imgRelPath.substring(mdDir.length)
      : imgRelPath;
    
    // Label is relative to root if possible, or just the filename
    const label = 'img:' + (imgRelPath.startsWith(folderRoot + '/')
      ? imgRelPath.substring(folderRoot.length + 1)
      : imgRelPath);

    const dataUrl = await readFileAsDataURL(imgFile);
    const placeholder = storeImage(dataUrl, label);

    pathToPlaceholder[relToMd] = placeholder;
    pathToPlaceholder['./' + relToMd] = placeholder;
  }));

  // Transform markdown relative image paths to placeholders
  let mdText = text;
  mdText = mdText.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
    if (/^(https?:\/\/|data:)/i.test(src)) return match;
    const normalized = src.replace(/^\.\//, '');
    const ph = pathToPlaceholder[normalized] || pathToPlaceholder['./' + normalized];
    return ph ? `![${alt}](${ph})` : match;
  });

  mdText = mdText.replace(/<img\s([^>]*?)src=["']([^"']+)["']/gi, (match, before, src) => {
    if (/^(https?:\/\/|data:)/i.test(src)) return match;
    const normalized = src.replace(/^\.\//, '');
    const ph = pathToPlaceholder[normalized] || pathToPlaceholder['./' + normalized];
    return ph ? `<img ${before}src="${ph}"` : match;
  });

  // Final editor update
  openFileIntoDraft(file.name, mdText);
  setActiveFile(file.webkitRelativePath);
}

folderInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  folderFiles = files;
  folderRoot = files[0].webkitRelativePath.split('/')[0];
  folderLabel.textContent = folderRoot;

  // Build and render file tree
  const tree = buildTree(files);
  fileTree.innerHTML = '';
  renderTreeNode(tree, fileTree);
  fileExplorer.hidden = false;
  explorerToggle.hidden = true;

  // Auto-load the first .md file
  const mdFile = files.find(f => /\.(md|markdown)$/i.test(f.name));
  if (mdFile) {
    await loadMdFromFolder(mdFile);
  } else {
    showToast('No .md file found in the selected folder.', { type: 'warning' });
  }

  e.target.value = '';
});

// ============================================================
//  Live edit & Scroll Sync
// ============================================================
cm.on('change', () => {
  scheduleRender();
  scheduleTitleFromH1Update();
  scheduleTextStateSave();
  scheduleImageManagerRefresh();
});

let lastScrollPercent = 0;

function clampScrollPercent(percent) {
  const n = Number(percent);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function applyScrollPercentToFrame(frame, percent) {
  const win = frame?.contentWindow;
  const doc = frame?.contentDocument;
  if (!win || !doc) return;

  const safePercent = clampScrollPercent(percent);
  const scrollRoot = doc.scrollingElement || doc.documentElement;
  if (!scrollRoot) return;

  const maxScroll = Math.max(0, scrollRoot.scrollHeight - win.innerHeight);
  win.scrollTo(0, safePercent * maxScroll);
}

function afterFramePaint(frame, callback) {
  const win = frame?.contentWindow;
  const raf = (fn) => {
    if (win && typeof win.requestAnimationFrame === 'function') {
      win.requestAnimationFrame(fn);
    } else {
      requestAnimationFrame(fn);
    }
  };

  // Double RAF gives the browser one full paint cycle to settle layout/scroll.
  raf(() => raf(callback));
}

window.addEventListener('message', (e) => {
  if (e.data?.type === 'preview-scroll') {
    if (e.source !== getActivePreviewFrame().contentWindow) return;
    lastScrollPercent = clampScrollPercent(e.data.percent);
  }
});

// ============================================================
//  Paste / drop images into editor  →  base64 data URL
// ============================================================
cm.on('paste', async (_, e) => {
  const items = Array.from(e.clipboardData?.items ?? []);
  const imgItem = items.find(i => i.type.startsWith('image/'));
  if (!imgItem) return;
  e.preventDefault();
  await insertImageAtCursor(imgItem.getAsFile());
});

editorPane.addEventListener('dragover', (e) => {
  const hasImage = Array.from(e.dataTransfer.items).some(i => i.type.startsWith('image/'));
  if (hasImage) { e.preventDefault(); editorPane.classList.add('drag-over'); }
});
editorPane.addEventListener('dragleave', () => editorPane.classList.remove('drag-over'));
editorPane.addEventListener('drop', async (e) => {
  const images = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  if (!images.length) return;
  e.preventDefault();
  editorPane.classList.remove('drag-over');
  for (const img of images) await insertImageAtCursor(img);
});

async function insertImageAtCursor(file) {
  const dataUrl = await readFileAsDataURL(file);
  const alt = file.name.replace(/\.[^.]+$/, '') || 'image';
  const placeholder = storeImage(dataUrl, 'img:' + file.name);
  cm.getDoc().replaceRange(`\n![${alt}](${placeholder})\n`, cm.getDoc().getCursor());
  scheduleRender();
}

function readFileAsDataURL(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
}

// ============================================================
//  Settings
// ============================================================
applyCssBtn.addEventListener('click', () => { queueRender(true); saveLocalTextState(); });
pageNumToggle.addEventListener('change', () => { if (cm.getValue().trim()) queueRender(true); saveLocalTextState(); });
pageSizeSelect.addEventListener('change', () => { if (cm.getValue().trim()) queueRender(true); saveLocalTextState(); });
printBtn.addEventListener('click', () => {
  mascotFlyAwayAndReturn();

  const activeFrame = getActivePreviewFrame();
  const win = activeFrame.contentWindow;
  const doc = activeFrame.contentDocument;
  if (!win || !doc) return;

  const filename = docTitle.value.trim() || 'document';

  // 1. Set both parent and iframe title so the browser's Save-as-PDF dialog
  //    picks up the right filename regardless of which it reads.
  const prevParentTitle = document.title;
  document.title = filename;
  if (doc.title !== undefined) doc.title = filename;

  // 2. Temporarily strip zoom so PDF is printed at 100% scale
  const pagesContainer = doc.querySelector('.pagedjs_pages');
  if (pagesContainer) pagesContainer.style.zoom = 1;
  else doc.body.style.zoom = 1;

  // 3. Browser print dialog (blocks thread in most browsers)
  win.print();

  // 4. Restore everything
  document.title = prevParentTitle;
  if (pagesContainer) pagesContainer.style.zoom = currentZoom;
  else doc.body.style.zoom = currentZoom;
});

printBtn.addEventListener('mouseenter', () => {
  if (isRendering) return;
  mascotRunAwayFromButton();
});

if (printZone) {
  printZone.addEventListener('pointermove', (e) => {
    mascotPointerClientX = e.clientX;
    if (mascotPointerRaf) return;
    mascotPointerRaf = requestAnimationFrame(() => {
      mascotPointerRaf = 0;
      mascotReactToPointer(mascotPointerClientX);
    });
  });

  printZone.addEventListener('pointerdown', (e) => {
    if (e.target === printBtn || isRendering || !mascotAlive()) return;
    mascotDo('spin');
    mascotReactToPointer(e.clientX);
  });
}

// ============================================================
//  Render pipeline
// ============================================================
let bundledCSS  = null;
let renderTimer = null;
let renderInFlight = false;
let renderQueued = false;
let lastRenderKey = '';

const RENDER_DEBOUNCE_MS = 500;
const RENDER_AFTER_INFLIGHT_MS = 80;

async function getBundledCSS() {
  if (bundledCSS) return bundledCSS;
  const r = await fetch('./style.css');
  bundledCSS = await r.text();
  return bundledCSS;
}

// FNV-1a 32-bit — cheap O(n) fingerprint; combined with length to make
// collisions on real-world documents effectively impossible.
function cheapHash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(36);
}

function getRenderKey(rawMd) {
  const css = customCssArea.value;
  return cheapHash(rawMd) + ':' + rawMd.length + '|' +
         pageSizeSelect.value + '|' +
         (pageNumToggle.checked ? '1' : '0') + '|' +
         cheapHash(css) + ':' + css.length;
}

function flushQueuedRender() {
  if (!renderQueued) return;
  renderQueued = false;
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    if (renderInFlight) {
      renderQueued = true;
      return;
    }
    render();
  }, RENDER_AFTER_INFLIGHT_MS);
}

function finishRenderCycle() {
  renderInFlight = false;
  flushQueuedRender();
}

function queueRender(immediate = false) {
  clearTimeout(renderTimer);
  if (renderInFlight) {
    renderQueued = true;
    return;
  }
  if (immediate) {
    render();
    return;
  }
  renderTimer = setTimeout(render, RENDER_DEBOUNCE_MS);
}

function scheduleRender() {
  queueRender(false);
}

// (EXAMPLE_MD constant removed, content now in example.md)


const PAGE_NUMBERS_CSS = `
@page {
  @bottom-center {
    content: counter(page) " / " counter(pages);
    font-family: 'Noto Sans TC', sans-serif;
    font-size: 9pt;
    color: #57606a;
  }
}`;

// ------------------------------------------------------------------
//  Pagebreak preprocessing  (mirrors bin/md2pdf.js exactly)
//
//  We run this on the raw Markdown source BEFORE passing to marked,
//  so that code blocks are protected and <!-- pagebreak --> inside
//  triple-backtick blocks is never substituted.
// ------------------------------------------------------------------
const PAGEBREAK_MD_RE = /<!--\s*pagebreak\s*-->/gi;
// A sentinel we embed in the markdown so marked leaves it alone.
// We use a raw HTML block that Paged.js will parse as a page break.
const PAGEBREAK_HTML_SENTINEL = '<div class="md2pdf-pagebreak"></div>';

// Pandoc-style sizing on Markdown images:
//   ![alt](url){width=300}
//   ![alt](url){width=50%}
//   ![alt](url){width=300 height=200}
//   ![alt](url){w=300}            (shorthand)
// Numbers without units default to px; % stays %; px/em/rem/vw/vh are passed through.
const MD_IMG_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)(\{[^{}]+\})?/g;

function parseImgSizeAttrs(attrStr) {
  const out = {};
  const re = /(width|height|w|h)\s*=\s*("([^"]*)"|'([^']*)'|([^\s,;]+))/gi;
  let m;
  while ((m = re.exec(attrStr)) !== null) {
    const key = m[1].toLowerCase().startsWith('w') ? 'width' : 'height';
    const rawVal = m[3] || m[4] || m[5] || '';
    if (!rawVal) continue;
    out[key] = /^\d+(\.\d+)?$/.test(rawVal) ? rawVal + 'px' : rawVal;
  }
  return out;
}

function escapeHtmlAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// A markdown image src that is a plain relative path can't render in the
// browser: it lives on the user's disk and only resolves after they mount
// the containing folder (which rewrites it to a {{img:…}} placeholder).
function isUnresolvedRelativeImageSrc(src) {
  if (!src || src.startsWith('{{')) return false;
  if (/^(https?:|data:|blob:|file:|mailto:|\/|#)/i.test(src)) return false;
  return true;
}

// Collected during preprocessMarkdown; render() turns these into a hint toast.
let missingImagePaths = [];

function transformMarkdownImages(text) {
  if (text.indexOf('![') === -1) return text;
  return text.replace(MD_IMG_RE, (match, alt, src, title, attrs) => {
    if (isUnresolvedRelativeImageSrc(src)) {
      missingImagePaths.push(src);
      // span (not div) so marked keeps it as inline HTML even inside a
      // paragraph; CSS turns it into a block placeholder card.
      return '<span class="md2pdf-missing-img">🖼️ Image not found: <code>' + escapeHtmlAttr(src) + '</code>' +
        '<span class="md2pdf-missing-img-hint">Use 📁 Open Folder to load the folder containing it, or add the image with Insert Image / paste it into the editor.</span></span>';
    }
    if (!attrs) return match;
    const size = parseImgSizeAttrs(attrs.slice(1, -1));
    if (!size.width && !size.height) return match;
    const style = ['width', 'height']
      .filter((k) => size[k])
      .map((k) => `${k}:${size[k]}`)
      .join(';');
    const titleAttr = title ? ` title="${escapeHtmlAttr(title)}"` : '';
    return `<img src="${escapeHtmlAttr(src)}" alt="${escapeHtmlAttr(alt)}"${titleAttr} style="${style}">`;
  });
}

function preprocessMarkdown(raw) {
  // Step 0 — Transform Markdown images: honour {width=…}/{height=…} sizing
  // and swap unresolved relative paths for a visible placeholder card.
  // Done first so the resulting HTML is opaque to all later passes.
  // Fenced code / inline code is protected via the parts-split below; we
  // additionally guard inline code here so backtick spans on the same line
  // don't get matched as image syntax.
  missingImagePaths = [];
  const sizeParts = raw.split(/(^```[\s\S]*?^```|^~~~[\s\S]*?^~~~)/m);
  const sized = sizeParts.map((part, i) => {
    if (i % 2 !== 0) return part;
    const inlines = [];
    const safe = part.replace(/`[^`]*`/g, (m) => {
      inlines.push(m);
      return `\x01${inlines.length - 1}\x01`;
    });
    const replaced = transformMarkdownImages(safe);
    return replaced.replace(/\x01(\d+)\x01/g, (_, idx) => inlines[idx]);
  }).join('');

  // Step 1 — Resolve markdown inside HTML wrapper blocks (e.g. <div align="center">)
  // so that *italic*, [links](), **bold** etc. are rendered correctly.
  // We do this BEFORE splitting on fenced code blocks so we can skip code fences safely.
  //
  // Cheap precheck: only run the (potentially expensive) regex if the doc has at
  // least one wrapper open AND one wrapper close. While the user is mid-typing a
  // tag (e.g. `<div style="`) no close exists yet, so we skip entirely and avoid
  // any backtracking risk.
  const WRAPPER_OPEN_RE = /<(div|p|span|section|article|header|footer|blockquote)\b/i;
  const WRAPPER_CLOSE_RE = /<\/(div|p|span|section|article|header|footer|blockquote)>/i;
  let withInlineHtml = sized;
  if (WRAPPER_OPEN_RE.test(sized) && WRAPPER_CLOSE_RE.test(sized)) {
    withInlineHtml = sized.replace(
      /(<(div|p|span|section|article|header|footer|blockquote)[^>]*>)([\s\S]*?)(<\/\2>)/gi,
      (match, openTag, _tag, inner, closeTag) => {
        // Skip if inner content looks like raw HTML (contains <tags>), leave it alone
        if (/<[a-zA-Z]/.test(inner)) return match;
        // Process each non-empty line as inline markdown. parseInline can be slow
        // or throw on partially-typed content; guard it so a half-typed line never
        // freezes the editor.
        const processed = inner
          .split('\n')
          .map(line => {
            const trimmed = line.trim();
            if (!trimmed) return line;
            // Lines containing `<` are likely partial HTML the user is still
            // typing — pass through untouched.
            if (trimmed.indexOf('<') !== -1) return line;
            try {
              const parsed = markedObj.parseInline(trimmed);
              return line.replace(trimmed, parsed);
            } catch {
              return line;
            }
          })
          .join('\n');
        return openTag + processed + closeTag;
      }
    );
  }

  // Step 2 — Split on fenced code blocks; protect them from further processing.
  const parts = withInlineHtml.split(/(^```[\s\S]*?^```|^~~~[\s\S]*?^~~~)/m);
  return parts.map((part, i) => {
    if (i % 2 !== 0) return part; // inside fenced code — leave alone
    // Protect inline code spans before replacing pagebreak tokens
    const inlines = [];
    const safe = part.replace(/`[^`]*`/g, (m) => {
      inlines.push(m);
      return `\x00${inlines.length - 1}\x00`;
    });
    const replaced = safe.replace(PAGEBREAK_MD_RE, PAGEBREAK_HTML_SENTINEL);
    return replaced.replace(/\x00(\d+)\x00/g, (_, idx) => inlines[idx]);
  }).join('');
}

// CSS that powers the page-break sentinel AND the Paged.js visual layout.
// isDark is passed in at render time so the iframe background matches the theme.
function getPagedScreenCss(isDark, viewerBg) {
  // Use inset box-shadow as border — actual `border:1px` disappears at 50% zoom.
  // Inset shadow renders properly at any zoom level.
  const pageBoxShadow = isDark
    ? 'inset 0 0 0 2px rgba(255,255,255,0.12), 0 6px 30px rgba(255,255,255,0.08)'
    : 'inset 0 0 0 2px rgba(0,0,0,0.22), 0 4px 20px rgba(0,0,0,0.18)';


  return `
  /* ---- pagebreak element ---- */
  .md2pdf-pagebreak {
    break-before: page;
    page-break-before: always;
  }

  /* ---- unresolved local image placeholder ---- */
  .md2pdf-missing-img {
    display: block;
    border: 2px dashed #d4a017;
    border-radius: 6px;
    padding: 12px 16px;
    margin: 0.8em 0;
    background: rgba(212, 160, 23, 0.07);
    color: #8a6d00;
    font-size: 0.85em;
    line-height: 1.6;
    text-align: center;
    break-inside: avoid;
  }
  .md2pdf-missing-img code {
    background: rgba(212, 160, 23, 0.15);
    padding: 1px 6px;
    border-radius: 3px;
    color: inherit;
  }
  .md2pdf-missing-img-hint {
    display: block;
    font-size: 0.85em;
    opacity: 0.85;
    margin-top: 4px;
  }

  /* ---- screen-only PDF layout ---- */
  @media screen {
    html { background: ${viewerBg} !important; }
    body {
      background: transparent !important;
      padding: 40px 0 80px;
      margin: 0;
      width: 100%;
      text-align: center;
    }
    .pagedjs_pages {
      display: block;
      width: 100%;
      margin: 0 auto;
    }
    .pagedjs_page {
      /* spacing between pages & centering */
      margin: 0 auto 32px auto !important;
      background: transparent !important;
    }
    /* .pagedjs_pagebox is the actual white paper box inside each page */
    .pagedjs_pagebox {
      background: white !important;
      box-shadow: ${pageBoxShadow} !important;
      border-radius: 2px;
      outline: none !important;
      outline-offset: 0 !important;
    }
  }

  /* ---- print: strip all decorations ---- */
  @media print {
    html, body { background: white !important; padding: 0 !important; }
    .pagedjs_pagebox { box-shadow: none !important; border-radius: 0 !important; }
    .pagedjs_page { margin: 0 !important; }
  }
  `;
}

// ------------------------------------------------------------------
//  Persistent preview shell
//
//  Each preview iframe is initialised ONCE with this shell document:
//  it loads Paged.js a single time and then waits for `paged-render`
//  messages carrying { html, css, zoom, isDark, title }. Re-renders
//  re-run Paged.Previewer in place instead of reloading the whole
//  iframe, which skips polyfill re-download/re-parse/re-exec on every
//  keystroke. CSS/HTML travel via postMessage, so no string-escaping
//  into srcdoc is needed either.
// ------------------------------------------------------------------
const PREVIEW_SHELL_DOC = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>document</title>
<style>html, body { background: transparent; margin: 0; }</style>
<script>
  window.PagedConfig = { auto: false };

  var _renderBusy = false;
  var _pendingRender = null;

  function pageBoxShadow(isDark) {
    return isDark
      ? 'inset 0 0 0 1px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.1), 0 6px 30px rgba(255,255,255,0.05)'
      : 'inset 0 0 0 1px rgba(0,0,0,0.15), 0 4px 20px rgba(0,0,0,0.15)';
  }

  // Paged.js sets some styles inline (outline, background); inline beats
  // CSS !important, so we re-apply ours inline after every layout pass.
  function applyPageDecorations(isDark, zoom) {
    var container = document.querySelector('.pagedjs_pages');
    if (container) container.style.zoom = zoom;
    else document.body.style.zoom = zoom;

    var pageBoxes = document.querySelectorAll('.pagedjs_pagebox');
    for (var i = 0; i < pageBoxes.length; i++) {
      var pb = pageBoxes[i];
      pb.style.setProperty('background', 'white', 'important');
      pb.style.removeProperty('outline');
      pb.style.removeProperty('outline-offset');
      pb.style.setProperty('box-shadow', pageBoxShadow(isDark), 'important');
    }
    var pages = document.querySelectorAll('.pagedjs_page');
    for (var j = 0; j < pages.length; j++) {
      pages[j].style.setProperty('margin', '0 auto 32px auto', 'important');
    }
  }

  async function runRender(msg) {
    if (_renderBusy) { _pendingRender = msg; return; }
    _renderBusy = true;
    try {
      document.title = msg.title || 'document';

      // Drop styles Paged.js injected during the previous run, then clear
      // the previous page tree.
      var stale = document.head.querySelectorAll('style[data-pagedjs-inserted-styles]');
      for (var i = 0; i < stale.length; i++) stale[i].remove();
      document.body.innerHTML = '';

      var previewer = new Paged.Previewer();
      var flow = await previewer.preview(
        msg.html,
        [{ 'md2pdf-inline.css': msg.css }],
        document.body
      );
      applyPageDecorations(msg.isDark, msg.zoom);
      var pageCount = (flow && flow.total) || document.querySelectorAll('.pagedjs_page').length;
      window.parent.postMessage({ type: 'pagedjs-done', pages: pageCount, renderId: msg.renderId }, '*');
    } catch (err) {
      window.parent.postMessage({
        type: 'pagedjs-error',
        message: String((err && err.message) || err),
        renderId: msg.renderId,
      }, '*');
    } finally {
      _renderBusy = false;
      if (_pendingRender) { var next = _pendingRender; _pendingRender = null; runRender(next); }
    }
  }

  document.addEventListener('wheel', function(e) {
    if (e.ctrlKey) {
      e.preventDefault();
      window.parent.postMessage({ type: 'pinch-zoom', delta: e.deltaY }, '*');
    }
  }, { passive: false });

  // Report scroll position to the parent for state persistence
  window.addEventListener('scroll', function() {
    var maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    var percent = maxScroll > 0 ? window.scrollY / maxScroll : 0;
    window.parent.postMessage({ type: 'preview-scroll', percent: percent }, '*');
  }, { passive: true });

  window.addEventListener('message', function(e) {
    var d = e.data;
    if (!d) return;
    if (d.type === 'paged-render') {
      runRender(d);
    } else if (d.type === 'paged-clear') {
      document.body.innerHTML = '';
    } else if (d.type === 'theme-change') {
      document.documentElement.style.setProperty('background-color', d.bg, 'important');
      var pageBoxes = document.querySelectorAll('.pagedjs_pagebox');
      for (var i = 0; i < pageBoxes.length; i++) {
        pageBoxes[i].style.setProperty('background', 'white', 'important');
        pageBoxes[i].style.removeProperty('outline');
        pageBoxes[i].style.setProperty('box-shadow', pageBoxShadow(d.dark), 'important');
      }
    } else if (d.type === 'editor-scroll') {
      var maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, d.percent * maxScroll);
    }
  });
<\/script>
<script src="https://unpkg.com/pagedjs@0.4.3/dist/paged.polyfill.js"><\/script>
<script>window.parent.postMessage({ type: 'paged-shell-ready' }, '*');<\/script>
</head>
<body></body>
</html>`;

const shellReadyFrames = new WeakSet();
const shellReadyWaiters = new Map();  // frame -> resolve callbacks

window.addEventListener('message', (e) => {
  if (e.data?.type !== 'paged-shell-ready') return;
  const frame = [previewFrameA, previewFrameB].find((f) => f.contentWindow === e.source);
  if (!frame) return;
  shellReadyFrames.add(frame);
  const waiters = shellReadyWaiters.get(frame) || [];
  shellReadyWaiters.delete(frame);
  waiters.forEach((fn) => fn(true));
});

function ensureShellReady(frame, timeoutMs = 10000) {
  if (shellReadyFrames.has(frame)) return Promise.resolve(true);
  if (!frame.dataset.shellLoading) {
    frame.dataset.shellLoading = '1';
    frame.srcdoc = PREVIEW_SHELL_DOC;
  }
  return new Promise((resolve) => {
    const list = shellReadyWaiters.get(frame) || [];
    list.push(resolve);
    shellReadyWaiters.set(frame, list);
    setTimeout(() => {
      if (!shellReadyFrames.has(frame)) {
        // Allow a srcdoc retry on the next render attempt (e.g. CDN hiccup)
        delete frame.dataset.shellLoading;
        resolve(false);
      }
    }, timeoutMs);
  });
}

// One hint per draft per session — re-renders of the same document while the
// user types shouldn't nag, but switching to another draft with its own
// missing images should still inform them.
const missingImgHintShownDrafts = new Set();

function notifyMissingImages() {
  if (!missingImagePaths.length) return;
  const key = activeDraftId || 'no-draft';
  if (missingImgHintShownDrafts.has(key)) return;
  missingImgHintShownDrafts.add(key);
  const unique = [...new Set(missingImagePaths)];
  const sample = unique.slice(0, 2).join('", "');
  showToast(
    `This document references ${unique.length} local image(s) ("${sample}"${unique.length > 2 ? ', …' : ''}). Open its folder so they can render.`,
    { type: 'info', duration: 12000, action: { label: '📁 Open Folder', onClick: () => folderInput.click() } }
  );
}

async function render() {
  if (renderInFlight) {
    renderQueued = true;
    return;
  }

  renderInFlight = true;

  const rawMd = cm.getValue();
  const mdSrc = rawMd.trim();
  const renderKey = getRenderKey(rawMd);
  clearRenderWaiters();
  const renderId = ++currentRenderId;

  // Empty editor → clear preview, hide everything
  if (!mdSrc) {
    postToPreviewFrames({ type: 'paged-clear' });
    printBtn.disabled = true;
    previewPane.classList.add('is-empty');
    isRendering = false;
    lastPageCount = 0;
    lastRenderKey = '';
    statusEl.classList.remove('is-rendering');
    statusEl.innerHTML = '';
    finishRenderCycle();
    return;
  }

  if (renderKey === lastRenderKey) {
    finishRenderCycle();
    return;
  }

  try {
    previewPane.classList.remove('is-empty');
    printBtn.disabled = true;
    isRendering = true;
    setMascotRendering(true);

    const preprocessed  = preprocessMarkdown(mdSrc);
    notifyMissingImages();
    const withImages    = resolveImages(preprocessed);
    const bodyHtml      = markedObj.parse(withImages);

    const pageSize   = pageSizeSelect.value;
    const baseCss    = await getBundledCSS();
    const pageAtRule = `@page { size: ${pageSize}; margin: 20mm 22mm 20mm 22mm; }`;
    const extraCss   = customCssArea.value.trim();
    const pageNumCss = pageNumToggle.checked ? PAGE_NUMBERS_CSS : '';

    const isDark    = document.documentElement.getAttribute('data-theme') === 'dark';
    const viewerBg  = getPreviewBackgroundColor();
    const pagedCss  = getPagedScreenCss(isDark, viewerBg);

    const targetFrame = stagingPreviewFrame;

    function finishRender(pageCount) {
      if (renderId !== currentRenderId) return;
      clearRenderWaiters();
      const targetScrollPercent = clampScrollPercent(lastScrollPercent);
      applyScrollPercentToFrame(targetFrame, targetScrollPercent);

      afterFramePaint(targetFrame, () => {
        if (renderId !== currentRenderId) return;

        swapPreviewFrames();
        printBtn.disabled = false;
        isRendering = false;
        setMascotRendering(false);
        if (typeof pageCount === 'number' && pageCount > 0) {
          lastPageCount = pageCount;
        }
        lastRenderKey = renderKey;
        lastScrollPercent = targetScrollPercent;
        updateStatusInfo();
        mascotDo('celebrate');
        finishRenderCycle();
      });
    }

    // Hide loading when the shell signals Paged.js finished (or errored).
    pendingPagedDoneHandler = function onPagedDone(e) {
      if (renderId !== currentRenderId) return;
      if (e.source !== targetFrame.contentWindow) return;
      if (e.data?.type === 'pagedjs-done') {
        finishRender(e.data.pages || 0);
      } else if (e.data?.type === 'pagedjs-error') {
        console.error('Paged.js render error:', e.data.message);
        showToast(`Preview render failed: ${e.data.message}`, { type: 'error', duration: 6000 });
        finishRender(lastPageCount || 0);
      }
    };
    window.addEventListener('message', pendingPagedDoneHandler);

    // One-time shell boot per frame; subsequent renders reuse the live iframe.
    const shellOk = await ensureShellReady(targetFrame);
    if (renderId !== currentRenderId) {
      finishRenderCycle();
      return;
    }
    if (!shellOk) {
      throw new Error('preview engine failed to load — check your network connection');
    }

    targetFrame.contentWindow.postMessage({
      type: 'paged-render',
      renderId,
      title: docTitle.value.trim() || 'document',
      html: bodyHtml,
      css: [pageAtRule, baseCss, extraCss, pageNumCss, pagedCss].join('\n'),
      zoom: currentZoom,
      isDark,
    }, '*');

    // Fallback: if Paged.js never reports done (hung layout), recover after 10s
    if (renderFallbackTimer) clearTimeout(renderFallbackTimer);
    renderFallbackTimer = setTimeout(() => {
      finishRender(lastPageCount || 0);
    }, 10000);
  } catch (err) {
    console.error('Render failed:', err);
    showToast(`Preview render failed: ${err.message || err}`, { type: 'error', duration: 6000 });
    clearRenderWaiters();
    printBtn.disabled = false;
    isRendering = false;
    setMascotRendering(false);
    updateStatusInfo();
    finishRenderCycle();
  }
}


// ============================================================
//  Init: Load state on startup
// ============================================================
async function loadState() {
  try {
    // 1. Settings
    const storedPageSize = localStorage.getItem('md2pdf_pageSize');
    if (storedPageSize) pageSizeSelect.value = storedPageSize;

    const storedPageNum = localStorage.getItem('md2pdf_pageNum');
    if (storedPageNum) pageNumToggle.checked = (storedPageNum === 'true');

    const storedCss = localStorage.getItem('md2pdf_css');
    if (storedCss) customCssArea.value = storedCss;

    const storedZoom = localStorage.getItem('md2pdf_zoom');
    if (storedZoom) {
      currentZoom = parseFloat(storedZoom);
      applyZoom();
    }

    // 2. Load IDB (imageStore & counter)
    const storedImages = await idbGet('imageStore');
    if (storedImages) imageStore = storedImages;
    
    const storedCounter = await idbGet('imageCounter');
    if (storedCounter) imageCounter = parseInt(storedCounter);

    // 3. Info Modal Visibility
    const hideInfo = localStorage.getItem('md2pdf_hide_info') === 'true';
    if (!hideInfo && infoModal) {
      infoModal.hidden = false;
    } else if (hideInfo && infoModal) {
      infoModal.hidden = true;
      if (infoDontShowChx) infoDontShowChx.checked = true;
    }

    // 4. Drafts
    hydrateDraftsFromStorage();
    const activeDraft = getDraftById(activeDraftId);
    if (activeDraft) {
      loadDraftIntoEditor(activeDraft);
    }

    // 5. First visit with empty draft
    if (!cm.getValue().trim()) {
      // First visit — show the feature demo
      const example = await fetchExample();
      if (example) {
        titleEditedByUser = false;
        cm.setValue(example);
        scheduleRender();
        saveLocalTextState();
      } else {
        // Fetch failed — show empty-state hint
        previewPane.classList.add('is-empty');
      }
    }
  } catch (e) {
    console.warn("Failed to restore state", e);
  }
}

loadState();

// Pre-warm both preview shells so the first render doesn't wait for
// Paged.js to boot.
ensureShellReady(previewFrameA);
ensureShellReady(previewFrameB);

// Flush any pending debounced writes so closing the tab or backgrounding
// the page never drops in-flight edits.
function flushPendingPersistence() {
  flushTextStateSave();
  flushImageStoreSave();
}
window.addEventListener('beforeunload', flushPendingPersistence);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushPendingPersistence();
});
