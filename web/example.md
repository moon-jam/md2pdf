# md2pdf

The preview on the right is the actual PDF layout — same pagination, same margins, same page breaks. Not a styled HTML page.

Edit something and watch the right panel update. That's it.

## What's in the sidebar

| Feature | Detail |
|---|---|
| **Open Folder** | Mount a local folder so relative image paths work |
| **Insert Image** | Or just paste / drag images directly into the editor |
| **Page size** | A4, Letter, A3, B5 |
| **Page numbers** | Toggle on/off |
| **Custom CSS** | Override any style |
| **Save as PDF** | Downloads with the title you set at the top |

Your work saves automatically in this browser session.

## Formatting

**Bold**, _italic_, ~~strikethrough~~, `inline code`.

> Blockquotes get a left border in the PDF.

<!-- pagebreak -->

## Syntax highlighting

Code blocks are highlighted with the Catppuccin Mocha theme, and the colours carry through to the exported PDF.

```javascript
function fib(n, memo = {}) {
  if (n in memo) return memo[n];
  if (n <= 1) return n;
  return memo[n] = fib(n - 1, memo) + fib(n - 2, memo);
}
```

```python
@dataclass
class Point:
    x: float
    y: float

    def distance(self, other: "Point") -> float:
        return ((self.x - other.x)**2 + (self.y - other.y)**2) ** 0.5
```

## Page breaks

Add `<!-- pagebreak -->` to force a new page. The next section starts on page 2:

<!-- pagebreak -->

## Page 2

The `<!-- pagebreak -->` before this heading pushed it to a new page. Handy for title pages, chapter separators, appendices.

## Custom CSS

Try pasting this into the CSS panel in the sidebar:

```css
h1, h2 {
  color: #0969da;
  border-bottom: 2px solid #d0d7de;
  padding-bottom: 4px;
}
```

It'll show up in the preview straight away.

## Other things worth knowing

- Drag the divider between editor and preview to resize
- Right-click images in the File Explorer sidebar to insert at cursor
- **Esc** closes dialogs and lightboxes
- The title field at the top becomes the PDF filename

---

<div align="center">
  *Source: [github.com/moon-jam/md2pdf](https://github.com/moon-jam/md2pdf) — MIT License.*
</div>