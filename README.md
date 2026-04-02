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

## 📄 Example Output

Curious what the result looks like? Check out [README.pdf](README.pdf) — this README itself, converted with `md2pdf`!

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

<!-- pagebreak -->

## 💻 Usage

Run the tool from any directory against any Markdown file!

```bash
# Basic usage (outputs 'report.pdf' in the same directory)
md2pdf report.md

# Live Preview & Watch Mode (auto-reloads on save)
md2pdf report.md --watch

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
| `--watch`  | `-w` | Open browser and live-reload on file changes | `false` |
| `--style` | | Custom CSS stylesheet file path | Bundled `style.css` |
| `--size` | | PDF paper size (A4, Letter, B5, etc) | `A4` |
| `--title` | | Title of the generated PDF document | Base filename |
| `--language`| | Language metadata code | `zh-TW` |
| `--page-numbers` | `-p` | Show page numbers in the footer | `false` |

## 💡 Tips & Tricks

**Forcing a Page Break**  
If you need to manually split content to a new page, simply type:
```markdown
<!-- pagebreak -->
```
md2pdf will automatically convert it into a seamless page split during rendering.

## 🎨 Modifying the Theme

Want to change how things look? Just open `style.css` in the project root and tweak to your heart's content. Changes apply instantly on your next `md2pdf` run!

---

<p align="center">
  <em>Created by <a href="https://github.com/moon-jam">moon-jam</a>. Built with the help of <strong>Antigravity</strong> 🚀</em>
</p>
