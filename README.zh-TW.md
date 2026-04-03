<div align="center">
  <h1><code>md2pdf</code></h1>
  <p>把 Markdown 轉成 PDF，附即時分頁預覽。</p>
  <p>🌐 <a href="https://moon-jam.me/md2pdf">moon-jam.me/md2pdf</a> — 直接在瀏覽器使用，無需安裝</p>
  <p><a href="README.md">English</a> | <strong>繁體中文</strong></p>
</div>

---

https://github.com/user-attachments/assets/82c6781a-c8ed-4e33-8713-ea0f95bc0cf6

## 為什麼用 md2pdf

和一般 Markdown 預覽最大的差別是：你在畫面上看到的分頁、頁邊距，幾乎就是最後輸出的 PDF 樣子，不用匯出後再回來猜版面。

程式碼區塊也不會在換頁時被切成兩段，文件比較不會出現突兀的分割。

底層使用 [Paged.js](https://pagedjs.org/) 負責網頁即時預覽排版，CLI 的 PDF 輸出使用 [Vivliostyle](https://vivliostyle.org/)，[Prism.js](https://prismjs.com/)（Catppuccin Mocha 主題）負責 syntax highlighting，並內建 Noto 字型來支援中文排版。

## 使用方式

### 網頁版（免安裝）

[moon-jam.me/md2pdf](https://moon-jam.me/md2pdf)—不用安裝。

這是純前端工具，內容都留在你的瀏覽器。

- 即時分頁預覽，打字就更新
- 開啟本機資料夾，相對路徑的圖片自動解析，不需要上傳
- 直接貼上或拖曳圖片到編輯器
- Custom CSS 面板，改完立即看到效果
- `<!-- pagebreak -->` 強制換頁
- 頂部的標題欄就是匯出 PDF 的檔名
- 透過 IndexedDB 在瀏覽器內自動儲存，資料不會送到伺服器

### 命令列工具（本機與自動化）

適合本機轉檔、批次處理，或整合進 CI / 自動化流程。

CLI 輸出使用 [Vivliostyle](https://vivliostyle.org/) 生成。

**需求：** Node.js 18 以上

## 快速開始（CLI）

```bash
git clone https://github.com/moon-jam/md2pdf.git
cd md2pdf
npm install && npm link
```

```bash
# 基本用法
md2pdf report.md

# watch 模式（在瀏覽器開預覽，存檔自動更新）
md2pdf report.md --watch

# 指定輸出路徑
md2pdf report.md -o ~/Documents/final.pdf

# 更改紙張大小
md2pdf report.md --size Letter

# 使用自訂樣式表
md2pdf report.md --style my_theme.css
```

## 輸出結果示例

以下兩個檔案都是在這個專案裡用指令實際產生的結果：

- [README.pdf](README.pdf)（由 `md2pdf README.md -p` 產生）
- [README.zh-TW.pdf](README.zh-TW.pdf)（由 `md2pdf README.zh-TW.md -p` 產生）

## CLI 參數

| 參數             | 簡寫 | 說明               | 預設值                |
| ---------------- | ---- | ------------------ | --------------------- |
| `--output`       | `-o` | 輸出路徑           | 同目錄，副檔名 `.pdf` |
| `--watch`        | `-w` | 在瀏覽器開即時預覽 | `false`               |
| `--style`        |      | CSS 檔案           | 內建 `style.css`      |
| `--size`         |      | 紙張大小           | `A4`                  |
| `--title`        |      | PDF 標題           | 檔案名稱              |
| `--language`     |      | 語言中繼資料       | `zh-TW`               |
| `--page-numbers` | `-p` | 頁尾顯示頁碼       | `false`               |

## 自訂樣式

內建的 `style.css` 會控制整體外觀：字型、間距、syntax highlighting 顏色和頁面版面。你可以直接改，改完重新執行就會套用。

---

本專案採 MIT 授權，作者為 [moon-jam](https://github.com/moon-jam)。
