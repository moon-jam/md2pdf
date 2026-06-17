#!/usr/bin/env node

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
const argv = yargs(hideBin(process.argv))
  .usage('Usage: md2pdf <input.md> [options]')
  .positional('input', { describe: 'Markdown file to convert', type: 'string' })
  .option('w', {
    alias: 'watch',
    type: 'boolean',
    describe: 'Watch file for changes and open a live preview in the browser',
  })
  .option('o', {
    alias: 'output',
    type: 'string',
    describe: 'Output PDF path (default: same dir as input, .pdf extension)',
  })
  .option('style', {
    type: 'string',
    describe: 'Custom CSS stylesheet path (default: bundled style)',
  })
  .option('size', {
    type: 'string',
    describe: 'Page size (default: A4)',
    default: 'A4',
  })
  .option('title', {
    type: 'string',
    describe: 'Document title (default: filename without extension)',
  })
  .option('language', {
    type: 'string',
    describe: 'Document language (default: zh-TW)',
    default: 'zh-TW',
  })
  .option('p', {
    alias: 'page-numbers',
    type: 'boolean',
    describe: 'Show page numbers in the footer',
  })
  .demandCommand(1, 'Please provide an input Markdown file.')
  .help('h').alias('h', 'help')
  .argv;

// ---------------------------------------------------------------------------
// Resolve paths
// ---------------------------------------------------------------------------
const inputRel = argv._[0];
const inputAbs = path.resolve(process.cwd(), inputRel);

if (!fs.existsSync(inputAbs)) {
  console.error(`❌  File not found: ${inputAbs}`);
  process.exit(1);
}

const inputDir  = path.dirname(inputAbs);
const inputBase = path.basename(inputAbs, path.extname(inputAbs));

const outputAbs = argv.output
  ? path.resolve(process.cwd(), argv.output)
  : path.join(inputDir, `${inputBase}.pdf`);

// Resolve stylesheet — prefer user-supplied, then bundled default
const bundledStyle = path.join(__dirname, '..', 'style.css');
const styleAbs = argv.style
  ? path.resolve(process.cwd(), argv.style)
  : bundledStyle;

if (!fs.existsSync(styleAbs)) {
  console.error(`❌  Stylesheet not found: ${styleAbs}`);
  process.exit(1);
}

const docTitle  = argv.title ?? inputBase;
const timestamp = Date.now();

const PAGE_NUMBERS_CSS = `
@page {
  @bottom-center {
    content: counter(page) " / " counter(pages);
    font-family: 'Noto Sans TC', sans-serif;
    font-size: 9pt;
    color: #57606a;
  }
}
`;

// ---------------------------------------------------------------------------
// Preprocess markdown: replace <!-- pagebreak --> with a CSS page-break div.
//
// NOTE: vivliostyle-cli uses VFM (Vivliostyle Flavored Markdown) which is
// built on unified/remark — NOT markdown-it. The `vfm.customPlugins` key
// does not exist in vivliostyle-cli's config schema, and markdown-it
// renderer hooks have no effect here. Pre-processing the source file is
// the only reliable approach.
// ---------------------------------------------------------------------------
const PAGEBREAK_RE = /<!--\s*pagebreak\s*-->/gi;
const PAGEBREAK_DIV = '<div style="break-before: page;"></div>';

function preprocessMarkdown(srcPath) {
  const raw = fs.readFileSync(srcPath, 'utf8');
  // Split on fenced code blocks (``` or ~~~), preserving the delimiters.
  // Even-indexed segments are outside code blocks; odd-indexed are inside.
  const parts = raw.split(/(^```[\s\S]*?^```|^~~~[\s\S]*?^~~~)/m);
  return parts.map((part, i) => {
    if (i % 2 !== 0) return part; // inside fenced code block — skip
    // For non-code segments, protect inline code spans before replacing
    const inlines = [];
    const safe = part.replace(/`[^`]*`/g, (m) => { inlines.push(m); return `\x00${inlines.length - 1}\x00`; });
    const replaced = safe.replace(PAGEBREAK_RE, PAGEBREAK_DIV);
    return replaced.replace(/\x00(\d+)\x00/g, (_, idx) => inlines[idx]);
  }).join('');
}

// ---------------------------------------------------------------------------
// Font caching
//
// style.css pulls Noto CJK + JetBrains Mono from Google Fonts via @import.
// Vivliostyle launches a fresh Chromium per build, so those font subsets are
// re-fetched from the network every time (~6-12s). We resolve the @import
// ourselves: pick only the subsets whose unicode-range covers characters in
// the document (exactly what Chromium would load), cache the woff2 files under
// ~/.cache/md2pdf, and inline them as data: URIs. Output is identical; after
// the first run the fonts come entirely from disk.
// ---------------------------------------------------------------------------
const FONT_CACHE_DIR = path.join(os.homedir(), '.cache', 'md2pdf', 'fonts');
const GOOGLE_FONTS_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FONT_IMPORT_RE =
  /@import\s+url\((['"]?)(https:\/\/fonts\.googleapis\.com\/css2[^)'"]+)\1\)\s*;?/i;

// Reuse one keep-alive connection across the subset downloads instead of a
// fresh TLS handshake per file (keeps the first, uncached run fast).
const fontAgent = new https.Agent({ keepAlive: true, maxSockets: 8 });

function fetchBuffer(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers, agent: fontAgent }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(fetchBuffer(res.headers.location, headers));
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

function cachePath(url, ext) {
  return path.join(FONT_CACHE_DIR, crypto.createHash('sha1').update(url).digest('hex') + ext);
}

async function cachedFetch(url, ext, headers) {
  const file = cachePath(url, ext);
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const buf = await fetchBuffer(url, headers);
  fs.mkdirSync(FONT_CACHE_DIR, { recursive: true });
  fs.writeFileSync(file, buf);
  return buf;
}

// "U+4E00-9FFF, U+30??, U+20B4" -> [[start,end], ...]
function parseUnicodeRange(str) {
  return str.split(',').map((s) => s.trim().replace(/^U\+/i, '')).filter(Boolean).map((t) => {
    if (t.includes('-')) { const [a, b] = t.split('-'); return [parseInt(a, 16), parseInt(b, 16)]; }
    if (t.includes('?')) { return [parseInt(t.replace(/\?/g, '0'), 16), parseInt(t.replace(/\?/g, 'F'), 16)]; }
    const v = parseInt(t, 16); return [v, v];
  });
}

function parseFontFaces(css) {
  const faces = [];
  const re = /@font-face\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    const body = m[1];
    const url = (body.match(/url\((https:\/\/[^)]+\.woff2)\)/) || [])[1];
    const range = (body.match(/unicode-range:\s*([^;]+);?/) || [])[1];
    if (!url || !range) continue;
    const decls = body.replace(/src:\s*[^;]+;/, '').replace(/unicode-range:[^;]+;?/, '').trim();
    faces.push({ url, range, ranges: parseUnicodeRange(range), decls });
  }
  return faces;
}

function docCodePoints(text) {
  const cps = new Set();
  for (const ch of text) cps.add(ch.codePointAt(0));
  for (let c = 0x20; c <= 0x7e; c++) cps.add(c); // always keep basic latin
  return Array.from(cps).sort((a, b) => a - b);
}

function rangeHasAnyCp(sortedCps, a, b) {
  let lo = 0, hi = sortedCps.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sortedCps[mid] < a) lo = mid + 1;
    else if (sortedCps[mid] > b) hi = mid - 1;
    else return true;
  }
  return false;
}

// Replace a Google Fonts @import with inlined @font-face data: URIs, fetching
// (and caching) only the subsets the document actually needs.
async function resolveFontImport(cssText, documentText) {
  const m = cssText.match(FONT_IMPORT_RE);
  if (!m) return cssText;
  try {
    const importUrl = m[2];
    const cssBuf = await cachedFetch(importUrl, '.css', { 'User-Agent': GOOGLE_FONTS_UA });
    const faces = parseFontFaces(cssBuf.toString('utf8'));
    const cps = docCodePoints(documentText);
    const needed = faces.filter((f) => f.ranges.some(([a, b]) => rangeHasAnyCp(cps, a, b)));
    const blocks = await Promise.all(needed.map(async (f) => {
      const woff2 = await cachedFetch(f.url, '.woff2', { 'User-Agent': GOOGLE_FONTS_UA });
      const dataUri = `data:font/woff2;base64,${woff2.toString('base64')}`;
      return `@font-face{${f.decls}src:url(${dataUri}) format('woff2');unicode-range:${f.range};}`;
    }));
    return cssText.replace(FONT_IMPORT_RE, blocks.join('\n'));
  } catch (e) {
    console.warn(`⚠️  Font cache unavailable (${e.message}); using network fonts.`);
    return cssText;
  }
}

// ---------------------------------------------------------------------------
// Temp file paths next to the input file.
// ---------------------------------------------------------------------------
const tmpConfig = path.join(inputDir, `.md2pdf_tmp_${timestamp}.js`);
const tmpMdName = `.md2pdf_tmp_${timestamp}.md`;
const tmpMdAbs  = path.join(inputDir, tmpMdName);
let tmpStyleAbs = null;

// ---------------------------------------------------------------------------
// Cleanup logic (Ensures temp files are deleted even on CTRL+C)
// ---------------------------------------------------------------------------
function cleanup() {
  try { fs.unlinkSync(tmpConfig); } catch (_) {}
  try { fs.unlinkSync(tmpMdAbs); } catch (_) {}
  if (tmpStyleAbs) { try { fs.unlinkSync(tmpStyleAbs); } catch (_) {} }
}

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });
process.on('SIGTERM', () => { cleanup(); process.exit(1); });
process.on('uncaughtException', (err) => {
  console.error('❌  An unexpected error occurred:', err);
  cleanup();
  process.exit(1);
});

const vivliostyleBin = path.join(__dirname, '..', 'node_modules', '.bin', 'vivliostyle');
const cli = fs.existsSync(vivliostyleBin) ? vivliostyleBin : 'vivliostyle';

(async () => {
  // Preprocess markdown (pagebreaks expanded); reused for font subsetting.
  const mdContent = preprocessMarkdown(inputAbs);
  fs.writeFileSync(tmpMdAbs, mdContent, 'utf8');

  // Resolve the Google Fonts @import to cached, inlined font subsets.
  let cssContent = fs.readFileSync(styleAbs, 'utf8');
  if (argv.pageNumbers) cssContent += PAGE_NUMBERS_CSS;
  cssContent = await resolveFontImport(cssContent, mdContent);

  let vivliostyleArgs;
  if (argv.watch) {
    // Preview: inline the CSS via --css to avoid dev-server path issues.
    const configContent = `// Auto-generated by md2pdf — safe to delete
module.exports = {
  title: ${JSON.stringify(docTitle)},
  language: ${JSON.stringify(argv.language)},
  size: ${JSON.stringify(argv.size)},
  entry: [{ path: ${JSON.stringify(tmpMdName)}, title: ${JSON.stringify(docTitle)} }],
};
`;
    fs.writeFileSync(tmpConfig, configContent, 'utf8');
    vivliostyleArgs = ['preview', '--config', tmpConfig, '--css', cssContent];
  } else {
    // Build: write the resolved CSS next to the input and reference it as theme.
    const tmpStyleName = `.md2pdf_tmp_${timestamp}.css`;
    tmpStyleAbs = path.join(inputDir, tmpStyleName);
    fs.writeFileSync(tmpStyleAbs, cssContent, 'utf8');

    const configContent = `// Auto-generated by md2pdf — safe to delete
module.exports = {
  title: ${JSON.stringify(docTitle)},
  language: ${JSON.stringify(argv.language)},
  size: ${JSON.stringify(argv.size)},
  theme: ${JSON.stringify('./' + tmpStyleName)},
  entry: [{ path: ${JSON.stringify(tmpMdName)}, title: ${JSON.stringify(docTitle)} }],
  output: [${JSON.stringify(outputAbs)}],
};
`;
    fs.writeFileSync(tmpConfig, configContent, 'utf8');
    vivliostyleArgs = ['build', '--config', tmpConfig];
  }

  if (argv.watch) {
    console.log(`👀  Starting Live Preview for ${inputBase}.md...`);
  } else {
    console.log(`📄  ${inputBase}.md  →  ${outputAbs}`);
  }

  const result = spawnSync(cli, vivliostyleArgs, { stdio: 'inherit', cwd: inputDir });
  if (result.status !== 0) {
    console.error('❌  Build failed.');
    process.exit(result.status ?? 1);
  }
  if (!argv.watch) console.log('✅  Done!');
})();
