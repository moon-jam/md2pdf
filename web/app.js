// ============================================================
//  md2pdf  —  browser editor
// ============================================================

const fileInput      = document.getElementById('file-input');
const uploadLabel    = document.getElementById('upload-label');
const uploadArea     = document.getElementById('upload-area');
const editorTextarea = document.getElementById('editor');
const editorPane     = document.getElementById('editor-pane');
const previewFrame   = document.getElementById('preview-frame');
const previewLoading = document.getElementById('preview-loading');
const pageSizeSelect = document.getElementById('page-size');
const pageNumToggle  = document.getElementById('page-numbers-toggle');
const customCssArea  = document.getElementById('custom-css');
const applyCssBtn    = document.getElementById('apply-css');
const printBtn       = document.getElementById('print-btn');
const statusEl       = document.getElementById('status');
const resizerEl      = document.getElementById('resizer');
const zoomInBtn      = document.getElementById('zoom-in');
const zoomOutBtn     = document.getElementById('zoom-out');
const zoomLevelTxt   = document.getElementById('zoom-level');
const themeToggle    = document.getElementById('theme-toggle');

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
const darkBgColors = '#000000'; // Pure black for better contrast with white paper

function applyTheme(isDark) {
  themeToggle.checked = isDark;
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  // Notify the iframe so it can update its background without a full re-render
  previewFrame.contentWindow?.postMessage({
    type: 'theme-change',
    dark: isDark,
    bg: isDark ? darkBgColors : '#c8ccd0',
  }, '*');
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
//  Resizer
// ============================================================
let isResizing = false;
resizerEl.addEventListener('mousedown', () => {
  isResizing = true;
  document.body.style.cursor = 'col-resize';
  resizerEl.classList.add('resizing');
  previewFrame.style.pointerEvents = 'none';
});
document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  const sidebarW = 240;
  const mid = e.clientX - sidebarW;
  if (mid > 150 && window.innerWidth - e.clientX > 150) {
    document.body.style.gridTemplateColumns = `${sidebarW}px ${mid}px 6px 1fr`;
  }
});
document.addEventListener('mouseup', () => {
  if (!isResizing) return;
  isResizing = false;
  document.body.style.cursor = '';
  resizerEl.classList.remove('resizing');
  previewFrame.style.pointerEvents = '';
});

// ============================================================
//  Zoom  (applied after each render via CSS var)
// ============================================================
let currentZoom = 0.5;

function applyZoom() {
  zoomLevelTxt.textContent = Math.round(currentZoom * 100) + '%';
  try {
    const doc = previewFrame.contentDocument;
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
  cm.setValue(await file.text());
  uploadLabel.textContent = file.name;
  scheduleRender();
});

// ============================================================
//  Live edit & Scroll Sync
// ============================================================
cm.on('change', () => scheduleRender());

let isSyncingLeft = false;
let isSyncingRight = false;
let lastScrollPercent = 0;

cm.on('scroll', () => {
  if (isSyncingLeft) {
    isSyncingLeft = false;
    return;
  }
  isSyncingRight = true;
  const info = cm.getScrollInfo();
  const maxScroll = info.height - info.clientHeight;
  const percent = maxScroll > 0 ? info.top / maxScroll : 0;
  lastScrollPercent = percent;
  previewFrame.contentWindow?.postMessage({ type: 'editor-scroll', percent }, '*');
});

window.addEventListener('message', (e) => {
  if (e.data?.type === 'preview-scroll') {
    if (isSyncingRight) {
      isSyncingRight = false;
      return;
    }
    isSyncingLeft = true;
    const percent = e.data.percent;
    lastScrollPercent = percent;
    const info = cm.getScrollInfo();
    const maxScroll = info.height - info.clientHeight;
    cm.scrollTo(null, percent * maxScroll);
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
  cm.getDoc().replaceRange(`\n![${alt}](${dataUrl})\n`, cm.getDoc().getCursor());
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
applyCssBtn.addEventListener('click', () => render());
pageNumToggle.addEventListener('change', () => { if (cm.getValue().trim()) render(); });
pageSizeSelect.addEventListener('change', () => { if (cm.getValue().trim()) render(); });
printBtn.addEventListener('click', () => {
  const win = previewFrame.contentWindow;
  const doc = previewFrame.contentDocument;
  if (!win || !doc) return;

  // 1. Temporarily strip zoom so PDF is printed at 100% scale
  const pagesContainer = doc.querySelector('.pagedjs_pages');
  if (pagesContainer) pagesContainer.style.zoom = 1;
  else doc.body.style.zoom = 1;

  // 2. Browser print dialog (blocks thread in most browsers)
  win.print();

  // 3. Restore user's zoom preference immediately after dialog closes
  if (pagesContainer) pagesContainer.style.zoom = currentZoom;
  else doc.body.style.zoom = currentZoom;
});

// ============================================================
//  Render pipeline
// ============================================================
let bundledCSS  = null;
let renderTimer = null;

async function getBundledCSS() {
  if (bundledCSS) return bundledCSS;
  const r = await fetch('./style.css');
  bundledCSS = await r.text();
  return bundledCSS;
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 350);
}

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
  // Split on fenced code blocks, keeping the delimiters.
  // Even indices → outside code blocks; odd → inside.
  const parts = raw.split(/(^```[\s\S]*?^```|^~~~[\s\S]*?^~~~)/m);
  return parts.map((part, i) => {
    if (i % 2 !== 0) return part; // inside fenced code — leave alone
    // Protect inline code spans before replacing
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
function getPagedScreenCss(isDark) {
  const viewerBg = isDark ? '#000000' : '#c8ccd0';
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
  const mdSrc = cm.getValue().trim();

  // Empty editor → clear preview, hide everything
  if (!mdSrc) {
    previewLoading.hidden = true;
    previewFrame.srcdoc = '';
    printBtn.disabled = true;
    setStatus('');
    return;
  }

  previewLoading.hidden = false;
  printBtn.disabled = true;
  setStatus('Rendering…');

  const preprocessed  = preprocessMarkdown(mdSrc);
  const bodyHtml      = marked.parse(preprocessed, { gfm: true });

  const pageSize   = pageSizeSelect.value;
  const baseCss    = await getBundledCSS();
  const pageAtRule = `@page { size: ${pageSize}; margin: 20mm 22mm 20mm 22mm; }`;
  const extraCss   = customCssArea.value.trim();
  const pageNumCss = pageNumToggle.checked ? PAGE_NUMBERS_CSS : '';

  const isDark    = document.documentElement.getAttribute('data-theme') === 'dark';
  const pagedCss  = getPagedScreenCss(isDark);
  const initBg    = isDark ? '#000000' : '#c8ccd0';

  // Build the full document that goes into the iframe.
  const fullDoc = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
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

      window.parent.postMessage({ type: 'pagedjs-done' }, '*');
    }
  };

  document.addEventListener('wheel', function(e) {
    if (e.ctrlKey) {
      e.preventDefault();
      window.parent.postMessage({ type: 'pinch-zoom', delta: e.deltaY }, '*');
    }
  }, { passive: false });

  // Sync scroll from preview to editor
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

  // Clean up any previous message listener
  window.removeEventListener('message', onPagedDone);

  previewFrame.srcdoc = fullDoc;

  // Hide loading when Paged.js signals it's done
  function onPagedDone(e) {
    if (e.data?.type === 'pagedjs-done') {
      previewLoading.hidden = true;
      printBtn.disabled = false;
      setStatus('');
      window.removeEventListener('message', onPagedDone);
      // Restore scroll position after a full re-render
      setTimeout(() => {
        previewFrame.contentWindow?.postMessage({ type: 'editor-scroll', percent: lastScrollPercent }, '*');
      }, 50);
    }
  }
  window.addEventListener('message', onPagedDone);

  // Fallback: if Paged.js never fires (e.g. no network), clear after 5s
  previewFrame.onload = () => {
    setTimeout(() => {
      previewLoading.hidden = true;
      printBtn.disabled = false;
      setStatus('');
    }, 5000);
  };
}

function setStatus(msg) {
  statusEl.textContent = msg;
}
