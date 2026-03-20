<div align="center">
  <h1><code>md2pdf</code></h1>
  <p><strong>Convert Markdown to professional PDF instantly.</strong></p>
  <p>Built with <a href="https://vivliostyle.org/">Vivliostyle</a>. Features Prism.js syntax highlighting and built-in Traditional Chinese typography.</p>
</div>

---

## ✨ Features

- **Perfect Typography**: Pre-configured with Noto Sans TC, Noto Serif TC, and JetBrains Mono for a clean, modern aesthetic.
- **Vibrant Syntax Highlighting**: Built-in Prism.js syntax coloring powered by the gorgeous **Catppuccin Mocha** palette. Handled seamlessly at build-time for pixel-perfect PDF rendering.
- **Premium Developer UI**: Thoughtfully designed elements—from elegant callouts and blockquotes to balanced spacing—making your technical documents feel like professional publications rather than raw markdown.
- **Print Ready**: Auto-prevents awkward page breaks inside code blocks, tables, and paragraphs.
- **Offline & Cross-Platform**: Works fully offline after the first run (downloads headless Chromium automatically).

## 🛠 Installation

Requires Node.js 18 or newer.

```bash
# Clone the repository
git clone https://github.com/moon-jam/md2pdf.git
cd md2pdf

# Install dependencies and link it globally
npm install
npm link
```

## 💻 Usage

Run the tool from any directory against any Markdown file!

```bash
# Basic usage (outputs 'report.pdf' in the same directory)
md2pdf report.md

# Custom output path
md2pdf report.md -o ~/Documents/final_report.pdf

# Change Paper Size (Default: A4)
md2pdf report.md --size Letter

# Bring your own CSS stylesheet
md2pdf report.md --style my_theme.css

# View all options
md2pdf --help
```

### Options

| Flag | Alias | Description | Default |
|---|---|---|---|
| `--output` | `-o` | Output PDF file path | Same as input file with `.pdf` |
| `--style` | | Custom CSS stylesheet file path | Bundled `style.css` |
| `--size` | | PDF paper size (A4, Letter, B5, etc) | `A4` |
| `--title` | | Title of the generated PDF document | Base filename |
| `--language`| | Language metadata code | `zh-TW` |

## 🎨 Modifying the Theme

Want to change how things look? Just open `style.css` in the project root and tweak to your heart's content. Changes apply instantly on your next `md2pdf` run!

---

<p align="center">
  <em>Created by <a href="https://github.com/moon-jam">moon-jam</a>. Built with the help of <strong>Antigravity</strong> 🚀</em>
</p>
