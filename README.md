<div align="center">
  <h1><code>md2pdf</code></h1>
  <p>Markdown to PDF with a live paginated preview.</p>
  <p>🌐 <a href="https://moon-jam.me/md2pdf">moon-jam.me/md2pdf</a> — runs entirely in the browser</p>
  <p><strong>English</strong> | <a href="README.zh-TW.md">繁體中文</a></p>
</div>

---

## Why md2pdf

The key difference: preview shows real PDF pagination with actual margins, not just styled HTML. Code blocks stay intact across page boundaries. What you see is what you export.

Built on Paged.js for the layout engine, Prism.js (Catppuccin Mocha) for syntax highlighting, and Noto fonts for Chinese typography.

## Choose Your Workflow

### Web editor (no install)

[moon-jam.me/md2pdf](https://moon-jam.me/md2pdf) — no install needed.

Pure frontend: your content stays in your browser, with no server upload.

- Live paginated preview updates as you type
- Open a local folder to resolve relative image paths without any upload
- Paste or drag images straight into the editor
- Custom CSS panel with live preview
- `<!-- pagebreak -->` to force page breaks
- Title field at the top sets the PDF filename
- Autosaves locally in your browser via IndexedDB

### CLI (local + scripting)

For local use or scripting.

**Requirements:** Node.js 18+

## Quick Start (CLI)

```bash
git clone https://github.com/moon-jam/md2pdf.git
cd md2pdf
npm install && npm link
```

```bash
# basic usage
md2pdf report.md

# watch mode (live preview in browser, auto-reloads on save)
md2pdf report.md --watch

# custom output path
md2pdf report.md -o ~/Documents/final.pdf

# change paper size
md2pdf report.md --size Letter

# custom stylesheet
md2pdf report.md --style my_theme.css
```

## Example Output

Generated from this repository:

- [README.pdf](README.pdf) (from `md2pdf README.md -p`)
- [README.zh-TW.pdf](README.zh-TW.pdf) (from `md2pdf README.zh-TW.md -p`)

## CLI Options

| Flag             | Alias | Description             | Default                    |
| ---------------- | ----- | ----------------------- | -------------------------- |
| `--output`       | `-o`  | Output path             | Same dir, `.pdf` extension |
| `--watch`        | `-w`  | Live preview in browser | `false`                    |
| `--style`        |       | CSS file                | Bundled `style.css`        |
| `--size`         |       | Paper size              | `A4`                       |
| `--title`        |       | PDF title               | Filename                   |
| `--language`     |       | Language metadata       | `zh-TW`                    |
| `--page-numbers` | `-p`  | Page numbers in footer  | `false`                    |

## Styling

The bundled `style.css` controls everything: fonts, spacing, syntax highlight colours, page layout. Edit it directly and re-run.

---

MIT · [moon-jam](https://github.com/moon-jam)
