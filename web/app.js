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

docTitle.addEventListener('input', () => {
  titleEditedByUser = true;
  saveLocalTextState();
});

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
  titleEditedByUser = false;
  cm.setValue(await file.text());
  uploadLabel.textContent = file.name;
  scheduleRender();
});

uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
uploadArea.addEventListener('drop', async (e) => {
  e.preventDefault();
  uploadArea.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (!file) return;
  titleEditedByUser = false;
  cm.setValue(await file.text());
  uploadLabel.textContent = file.name;
  scheduleRender();
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
}

// ============================================================
//  Image Store  — keep base64 out of the editor text
//  Editor shows:  ![alt]({{img:1}})   or   <img src="{{img:2}}">
//  At render time we swap {{img:N}} → real data URL.
// ============================================================
let imageStore = {};  // { '{{img:1}}': 'data:image/png;base64,...', ... }
let imageCounter = 0;

function storeImage(dataUrl, label) {
  imageCounter++;
  const tag = label || `img:${imageCounter}`;
  const placeholder = `{{${tag}}}`;
  imageStore[placeholder] = dataUrl;
  
  idbSet('imageStore', imageStore);
  idbSet('imageCounter', imageCounter);
  
  return placeholder;
}

/** Replace all {{img:N}} placeholders in a string with real data URLs. */
function resolveImages(text) {
  return text.replace(/\{\{[^}]+\}\}/g, (m) => imageStore[m] || m);
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
      const placeholder = '{{img:' + relToMd + '}}';

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
            storeImage(dataUrl, 'img:' + relToMd);
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
  overlay.appendChild(container);

  // Click backdrop (outside image) to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeImagePreview();
  });

  // Esc to close
  const escHandler = (e) => {
    if (e.key === 'Escape') { closeImagePreview(); document.removeEventListener('keydown', escHandler); }
  };
  document.addEventListener('keydown', escHandler);

  document.body.appendChild(overlay);
}

function closeImagePreview() {
  document.querySelectorAll('.img-preview-overlay').forEach(el => el.remove());
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
    const placeholder = '{{' + label + '}}';

    const dataUrl = await readFileAsDataURL(imgFile);
    storeImage(dataUrl, label);

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
  uploadLabel.textContent = file.name;
  cm.setValue(mdText);
  setActiveFile(file.webkitRelativePath);
  scheduleRender();
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
    alert('No .md file found in the selected folder.');
  }

  e.target.value = '';
});

// ============================================================
//  Live edit & Scroll Sync
// ============================================================
cm.on('change', () => { scheduleRender(); updateTitleFromH1(cm.getValue()); saveLocalTextState(); });

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

// CodeMirror scroll doesn't trigger anything anymore during typing,
// but we keep the category for future simple features.
cm.on('scroll', () => {
  // No-op for now as per user request to disable sync
});

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

const RENDER_DEBOUNCE_MS = 250;
const RENDER_AFTER_INFLIGHT_MS = 80;

async function getBundledCSS() {
  if (bundledCSS) return bundledCSS;
  const r = await fetch('./style.css');
  bundledCSS = await r.text();
  return bundledCSS;
}

function getRenderKey(rawMd) {
  return [
    rawMd,
    pageSizeSelect.value,
    pageNumToggle.checked ? '1' : '0',
    customCssArea.value,
  ].join('\u0001');
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

function preprocessMarkdown(raw) {
  // Step 1 — Resolve markdown inside HTML wrapper blocks (e.g. <div align="center">)
  // so that *italic*, [links](), **bold** etc. are rendered correctly.
  // We do this BEFORE splitting on fenced code blocks so we can skip code fences safely.
  const withInlineHtml = raw.replace(
    /(<(div|p|span|section|article|header|footer|blockquote)[^>]*>)([\s\S]*?)(<\/\2>)/gi,
    (match, openTag, _tag, inner, closeTag) => {
      // Skip if inner content looks like raw HTML (contains <tags>), leave it alone
      if (/<[a-zA-Z]/.test(inner)) return match;
      // Process each non-empty line as inline markdown
      const processed = inner
        .split('\n')
        .map(line => {
          const trimmed = line.trim();
          if (!trimmed) return line; // preserve blank lines
          const parsed = markedObj.parseInline(trimmed);
          return line.replace(trimmed, parsed);
        })
        .join('\n');
      return openTag + processed + closeTag;
    }
  );

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
    getActivePreviewFrame().srcdoc = '';
    stagingPreviewFrame.srcdoc = '';
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

    // Build the full document that goes into the iframe.
    const fullDoc = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>${docTitle.value.trim() || 'document'}</title>
<style>
${pageAtRule}
${baseCss}
${extraCss}
${pageNumCss}
${pagedCss}
</style>
<script>
  // Signal Paged.js render completion & wire up pinch-zoom + theme-change
  var _isDark = ${isDark};

  window.PagedConfig = {
    auto: true,
    after: function() {
      // Zoom inner container instead of body for better centering
      var container = document.querySelector('.pagedjs_pages');
      if (container) container.style.zoom = ${currentZoom};
      else document.body.style.zoom = ${currentZoom};

      // ---- Apply page borders/shadows via inline style with !important ----
      var pageBoxes = document.querySelectorAll('.pagedjs_pagebox');
      for (var i = 0; i < pageBoxes.length; i++) {
        var pb = pageBoxes[i];
        
        // Paper is ALWAYS white
        pb.style.setProperty('background', 'white', 'important');
        
        // Remove buggy outline, use inset box-shadow for a crisp border
        pb.style.removeProperty('outline');
        pb.style.removeProperty('outline-offset');
        
        pb.style.setProperty('box-shadow', _isDark
          ? 'inset 0 0 0 1px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.1), 0 6px 30px rgba(255,255,255,0.05)'
          : 'inset 0 0 0 1px rgba(0,0,0,0.15), 0 4px 20px rgba(0,0,0,0.15)', 'important');
      }
      
      var pages = document.querySelectorAll('.pagedjs_page');
      for (var j = 0; j < pages.length; j++) {
          pages[j].style.setProperty('margin', '0 auto 32px auto', 'important');
      }

      var pageCount = document.querySelectorAll('.pagedjs_page').length;
      window.parent.postMessage({ type: 'pagedjs-done', pages: pageCount }, '*');
    }
  };

  document.addEventListener('wheel', function(e) {
    if (e.ctrlKey) {
      e.preventDefault();
      window.parent.postMessage({ type: 'pinch-zoom', delta: e.deltaY }, '*');
    }
  }, { passive: false });

  // Sync scroll from preview to editor
  // Sync scroll from preview to parent for state persistence
  window.addEventListener('scroll', function() {
    var maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    var percent = maxScroll > 0 ? window.scrollY / maxScroll : 0;
    window.parent.postMessage({ type: 'preview-scroll', percent: percent }, '*');
  }, { passive: true });

  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'theme-change') {
      var dark = e.data.dark;
      document.documentElement.style.setProperty('background-color', e.data.bg, 'important');
      
      var pageBoxes = document.querySelectorAll('.pagedjs_pagebox');
      for (var i = 0; i < pageBoxes.length; i++) {
        pageBoxes[i].style.setProperty('background', 'white', 'important');
        pageBoxes[i].style.removeProperty('outline');
        pageBoxes[i].style.setProperty('box-shadow', dark
          ? 'inset 0 0 0 1px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.1), 0 6px 30px rgba(255,255,255,0.05)'
          : 'inset 0 0 0 1px rgba(0,0,0,0.15), 0 4px 20px rgba(0,0,0,0.15)', 'important');
      }
    } else if (e.data && e.data.type === 'editor-scroll') {
      var maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, e.data.percent * maxScroll);
    }
  });
<\/script>
<script src="https://unpkg.com/pagedjs@0.4.3/dist/paged.polyfill.js"><\/script>
</head>
<body>
${bodyHtml}
</body>
</html>`;

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

    // Hide loading when Paged.js signals it's done from the staging frame.
    pendingPagedDoneHandler = function onPagedDone(e) {
      if (renderId !== currentRenderId) return;
      if (e.source !== targetFrame.contentWindow) return;
      if (e.data?.type === 'pagedjs-done') {
        finishRender(e.data.pages || 0);
      }
    };
    window.addEventListener('message', pendingPagedDoneHandler);

    targetFrame.srcdoc = fullDoc;

    // Fallback: if Paged.js never fires (e.g. no network), clear after 5s
    targetFrame.onload = () => {
      if (renderId !== currentRenderId) return;
      if (renderFallbackTimer) clearTimeout(renderFallbackTimer);
      renderFallbackTimer = setTimeout(() => {
        finishRender(lastPageCount || 0);
      }, 5000);
    };
  } catch (err) {
    console.error('Render failed:', err);
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

    // 4. Title
    const storedTitle = localStorage.getItem('md2pdf_title');
    const storedTitleEdited = localStorage.getItem('md2pdf_title_edited') === 'true';
    titleEditedByUser = storedTitleEdited;
    if (storedTitle) docTitle.value = storedTitle;

    // 5. Editor text
    const storedText = localStorage.getItem('md2pdf_editor');
    if (storedText) {
      cm.setValue(storedText);
    } else {
      // First visit — show the feature demo
      const example = await fetchExample();
      if (example) {
        titleEditedByUser = false;
        cm.setValue(example);
        scheduleRender();
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
