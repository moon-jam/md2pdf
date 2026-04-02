# md2pdf — Live PDF Preview

> **Stop the "Export → Check → Adjust" loop.** 
> See exactly how your document will look on paper, live as you type. 
> Pixel-perfect paginated preview running entirely in your browser.

## ✨ Key Features

| Feature | Detail |
|---|---|
| 📐 Live PDF Layout | Accurate pagination and margins as you edit |
| 🛡 Privacy Native | Your files and images stay 100% on your device |
| 📂 Local Folder | Mount a folder to load images by relative path |
| 🖼 Image Workflow | Paste, drag-drop, or right-click from file explorer |
| 🎨 Custom CSS | Override any style in the preview |
| 📐 Page Sizes | A4, Letter, A3, Legal — switch instantly |
| 🔢 Page Numbers | Toggle page numbering on / off |
| ✂️ Page Breaks | Use `<!-- pagebreak -->` to force a new page |
| 💾 Auto-Save | State persists across browser sessions (IndexedDB) |
| 🌙 Dark Mode | Dynamic interface theme for low-light work |

## 📝 Quick Start

1. **Write** — the PDF preview on the right shows exactly how it will look on paper.
2. **Preview** — everything updates live, no need to export to check the final layout.
3. **Download** — when you're happy with the result, click **Save as PDF**.

### Using Local Images

Click **Open Folder** to select a project directory. Images referenced
by relative path are resolved automatically:

```markdown
![Logo](images/logo.png)
```

You can also **paste** or **drag-and-drop** images directly into this editor.

---

## 💻 Syntax Highlighting

Fenced code blocks with a language tag are syntax-highlighted in the PDF:

```javascript
// Fibonacci — classic recursion
function fib(n) {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
}
console.log(fib(10)); // 55
```

```python
def greet(name: str) -> str:
    return f"Hello, {name}!"

print(greet("world"))
```

```diff
- Exporting to check page breaks?
+ Live preview. See it as you type. Stop the loop.
```

## ✂️ Custom Page Break (second page starts here)

The line `<!-- pagebreak -->` was placed just before this heading,
forcing it to start on a fresh page in the exported PDF.

This is useful for:
- Separating a cover page from the main content
- Breaking long tables or chapters across pages cleanly
- Isolating appendix sections

<!-- pagebreak -->

## 🛠 Custom CSS Example

Open the **Custom CSS** panel in the sidebar and try:

```css
body {
  font-size: 11pt;
  font-family: "Georgia", serif;
}

h1, h2 {
  color: #1a56db;
}
```

Changes are reflected instantly in the preview.

## 🔄 Tips & Shortcuts

- **Esc** — Close any open dialog or lightbox
- **Right-click** an image in the File Explorer → Insert at cursor or Preview
- **Drag the divider** between editor and preview to resize panels
- **Drag the sidebar edge** to widen or collapse it
- Click the **ⓘ** button (top-right of editor) to re-open this help

---

<div align="center">
  *Source: [github.com/moon-jam/md2pdf](https://github.com/moon-jam/md2pdf) — MIT License.*
</div>