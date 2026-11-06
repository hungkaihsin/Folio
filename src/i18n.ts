export type Locale = "en" | "zh-TW";
let locale: Locale = "en";
try {
  if (localStorage.getItem("folio-language") === "zh-TW") locale = "zh-TW";
} catch {}
export function getLocale() {
  return locale;
}
export function setLocale(next: Locale) {
  locale = next;
  try {
    localStorage.setItem("folio-language", next);
  } catch {}
}
export function tr(text: string): string {
  return locale === "zh-TW" ? zh[text] || text : text;
}
const zh: Record<string, string> = {
  Markup: "標記",
  "Page comments": "本頁留言",
  "Page markup": "本頁標記",
  "Only comments you add appear here.": "這裡只顯示您主動新增的留言。",
  "Highlights and drawings stay separate from comments.":
    "螢光標記與繪圖會和留言分開管理。",
  "Empty comment": "空白留言",
  "Existing annotation text": "原有標記文字",
  "Text highlight": "文字螢光標記",
  "No comments yet.": "目前沒有留言。",
  "No markup yet.": "目前沒有標記。",
  "Choose Comment, then click the page to write a note.":
    "選擇「留言」，再按一下頁面撰寫留言。",
  "Select text with Highlight, or use a drawing tool.":
    "使用螢光標記選取文字，或使用繪圖工具。",
  "Remove annotation": "移除標記",
  "Local PDF workspace": "本機 PDF 工作區",
  "Local document workspace": "本機文件工作區",
  "Your PDF workspace.": "您的 PDF 工作區。",
  "Read, edit and annotate your documents. Open a PDF to get started.":
    "閱讀、編輯與標記文件。開啟 PDF 即可開始。",
  "Workspace guide": "工作區指南",
  "A focused workflow": "專注的工作流程",
  "Everything in its place.": "每項工具，各就其位。",
  "Read & edit": "閱讀與編輯",
  "Find text and make changes directly on the page.":
    "搜尋文字，直接在頁面上修改內容。",
  "Highlight & draw": "標記與繪圖",
  "Mark passages without creating written comments.":
    "標記段落，不會自動新增文字留言。",
  "Write a note only when you choose Comment.":
    "只有選擇「留言」時才撰寫留言。",
  "Organize pages. Export a copy. Keep the original.":
    "整理頁面、匯出副本，保留原始檔案。",
  "Document tools": "文件工具",
  "Object properties": "物件屬性",
  "Tool settings": "工具設定",
  "Form fields": "表單欄位",

  "Missing characters require the full font. Import it or allow substitution below.":
    "缺少的字元需要完整字型。請匯入相同字型，或在下方允許替代字元。",
  "The embedded font lacks these characters. Import the full matching font, or explicitly allow substitution. Detecting size alone cannot recreate missing glyphs.":
    "內嵌字型缺少以下字元。請匯入完整的相同字型，或明確允許替代。只偵測字體大小無法補回缺少的字形。",
  "Matched font available.": "所選字型可用。",
  "Import the matching font or explicitly allow substitute characters.":
    "請匯入相同字型，或明確允許使用替代字元。",
  "Matching font is not installed. Import the full font file to keep this typeface.":
    "本機未安裝相同字型。請匯入完整字型檔以保留此字體。",
  "Matching installed font loaded.": "已載入本機相同字型。",
  "Detected original style": "偵測到的原始格式",
  "Stop matching": "停止比對",
  "Match nearby text": "套用附近文字格式",
  "Click nearby text to copy its font, size and color. Your draft stays in place.":
    "按一下附近文字以複製字型、大小與顏色。目前草稿會留在原處。",
  "Allow substitute characters (appearance may differ)":
    "允許替代字元（外觀可能不同）",
  "Checking installed fonts…": "正在檢查本機字型…",
  "Find matching installed font": "尋找本機相同字型",
  "Match style from:": "複製格式：",
  "PDF text selection": "PDF 文字選取",
  "Copy selected text": "複製所選文字",
  "Highlight selected text": "標記所選文字",
  "Selected text copied.": "已複製所選文字。",
  "Select text to highlight. Scanned pages need OCR.":
    "請選取要標記的文字。掃描頁面需要先進行 OCR。",
  "Drag to select and highlight text": "拖曳以選取並標記文字",
  "Drag to select text, just as in Read mode. Release to highlight the selected characters.":
    "如同閱讀模式拖曳選取文字，放開滑鼠後即可標記所選字元。",
  Copy: "複製",

  "Editing on page": "正在頁面上編輯",
  "Type directly on the page. Enter applies; Escape cancels.":
    "直接在頁面輸入。Enter 套用；Esc 取消。",
  "Type directly on the page. Cmd/Ctrl+Enter applies; Escape cancels.":
    "直接在頁面輸入。Cmd/Ctrl+Enter 套用；Esc 取消。",
  "Existing PDF text is edited one line at a time. Paragraph reflow is not available yet.":
    "原始 PDF 文字目前逐行編輯，尚不支援整段文字重排。",
  "This font cannot be previewed exactly while typing. Apply to see the PDF rendering.":
    "此字型無法在輸入時精確預覽。套用後可查看 PDF 實際效果。",
  "Apply or cancel the current text edit before using another tool.":
    "請先套用或取消目前的文字編輯，再使用其他工具。",
  "Choose a text size from 5 to 120 pt.": "請選擇 5 至 120 pt 的文字大小。",
  "Font preview": "字型預覽",
  "Requested font": "原始／所選字型",
  Using: "實際使用",
  "Checking font coverage…": "正在檢查字型支援…",
  "Original font preserved.": "已保留原始字型。",
  "The selected font can render this text.": "所選字型可顯示此文字。",
  "Substituted characters": "使用替代字型的字元",
  "Some characters require a substitute font. Unchanged characters keep the original typeface. Import the full original font for an exact match.":
    "部分字元需要替代字型，其餘字元會保留原字型。如需完全一致，請匯入完整的原始字型。",
  "Preserve original font": "保留原始字型",
  "Import font file…": "匯入字型檔…",
  "Fit to original line (may reduce text size)": "符合原始行寬（可能縮小字體）",
  "Replace this line while preserving its font, size, and baseline. Enable fitting only if you want longer text to shrink.":
    "替換此行，並保留字型、大小與基準線。只有希望較長的文字縮小時，才開啟符合行寬。",
  "The replacement exceeds the page width. Shorten it or enable Fit to original line.":
    "替換文字超出頁面寬度。請縮短內容或啟用符合原始行寬。",
  "Loading font": "正在載入字型",
  "Resize text proportionally to avoid distorting its font. Change the text size or wrapping width instead.":
    "請等比例調整文字大小，避免字型變形。也可改用字體大小或文字框寬度調整。",
  "Edit line:": "編輯文字行：",
  "V Read · M Move · E Edit · T Add text":
    "V 閱讀 · M 移動 · E 編輯 · T 新增文字",
  "Choose an object on the page. Folio 0.1 text and images are recovered when possible. Other flattened PDF contents are edited with Edit text.":
    "請在頁面上選取物件。系統會盡可能恢復 Folio 0.1 的文字與圖片。其他已合併的 PDF 內容可使用「編輯文字」。",
  "Selected-page PDF export does not support interactive form pages. Export all pages as PDF or use an image format.":
    "目前無法將互動式表單頁面單獨匯出為 PDF。請匯出完整 PDF 或使用圖片格式。",
  "Choose a new filename to keep the original PDF safe.":
    "請選擇新檔名，以保護原始 PDF。",

  "Unsaved changes": "尚未儲存的變更",
  "A little more possible with every PDF.": "讓每份 PDF 都有更多可能。",
  "On your device": "在本機處理",
  "Open PDF": "開啟 PDF",
  "Save copy": "另存副本",
  "PDF tools": "PDF 工具",
  "Toggle pages": "顯示／隱藏頁面",
  Undo: "復原",
  Redo: "重做",
  Pages: "頁面",
  "Merge PDF": "合併 PDF",
  "Insert blank page": "插入空白頁",
  "Previous page": "上一頁",
  Page: "第",
  "Page number": "頁碼",
  of: "／",
  "Next page": "下一頁",
  "Zoom out": "縮小",
  "Reset zoom": "重設縮放",
  "Zoom in": "放大",
  "Fit to width": "符合寬度",
  Color: "顏色",
  "Text and drawing color": "文字與繪圖顏色",
  "Text size": "文字大小",
  "Edits preserve the original font where available. Preview substitutions and choose whether longer text should shrink.":
    "編輯會盡量保留原字型。請預覽替代字元，並選擇是否縮小較長的文字。",
  "Current page": "目前頁面",
  Rotate: "旋轉",
  Duplicate: "複製頁面",
  "Move up": "向前移動",
  "Move down": "向後移動",
  "Delete page": "刪除頁面",
  "Find in document": "搜尋文件",
  "Search text…": "輸入搜尋文字…",
  "Search document": "搜尋文件",
  Find: "搜尋",
  matches: "筆結果",
  "Previous match": "上一筆結果",
  "Next match": "下一筆結果",
  "This page": "此頁面",
  "Notes & marks": "註解與標記",
  "No annotations yet.": "目前沒有註解。",
  "Comments, highlights and drawings on this page appear here.":
    "此頁面的註解、螢光標記和繪圖會顯示在這裡。",
  "Add a comment": "新增留言",
  "Interactive PDF fields": "互動式 PDF 欄位",
  "Fill it in.": "填寫表單。",
  Toggle: "切換",
  Apply: "套用",
  "fields are view only.": "欄位僅供檢視。",
  "No fillable fields.": "沒有可填寫的欄位。",
  "You can still use Add text to type onto the page.":
    "您仍可使用「新增文字」在頁面上輸入。",
  "Add text": "新增文字",
  "Private by design.": "隱私優先。",
  "Your files stay on this device.": "檔案保留在這台裝置上。",
  "No unsaved edits": "沒有未儲存的變更",
  "PDF document": "PDF 文件",
  "V Read · E Edit · T Add text": "V 閱讀 · M 選取移動 · E 編輯 · T 新增文字",
  "YOUR EVERYDAY PDF WORKSPACE": "日常 PDF 工作空間",
  "Good documents.": "好文件，",
  "Great possibilities.": "更多可能。",
  "Read, edit, and bring your PDFs together.": "閱讀、編輯，並整合您的 PDF。",
  "All in one place. All on your device.": "所有工具集中一處，全程在本機處理。",
  "Open a PDF": "開啟 PDF",
  "Create blank PDF": "建立空白 PDF",
  "Explore with a sample document": "使用範例文件體驗",
  "No uploads. No account. Just your documents.":
    "不需上傳，不需帳號，專注於您的文件。",
  "MADE FOR THE EVERYDAY": "為日常使用而設計",
  "A fresh perspective": "用全新方式",
  "on your paperwork.": "處理文件。",
  "Make the words work": "讓文字表達您的意思",
  "Edit existing text or add something new.": "編輯現有文字，或新增內容。",
  "Think on the page": "在頁面上記錄想法",
  "Highlight, draw, comment, and fill forms.":
    "標記重點、繪圖、註解和填寫表單。",
  "Get your pages in order": "整理文件頁面",
  "Reorder, rotate, merge, and save a copy.":
    "重新排序、旋轉、合併並另存副本。",
  "PDFs, with a little less friction.": "讓 PDF 操作更順手。",
  "Dismiss error": "關閉錯誤訊息",
  Cancel: "取消",
  "Your edits haven’t been saved. Save a copy first to keep them.":
    "變更尚未儲存。如需保留，請先另存副本。",
  "Enter this document’s password to open it.": "請輸入文件密碼以開啟。",
  "PDF password": "PDF 密碼",
  "Original font:": "原始字型：",
  "Discard changes": "捨棄變更",
  "Select / move": "選取／移動",
  "Read & select": "閱讀與選取",
  Read: "閱讀",
  "Edit text": "編輯文字",
  Highlight: "螢光標記",
  Draw: "繪圖",
  Rectangle: "矩形",
  "Add image": "新增圖片",
  Comment: "新增留言",
  Tools: "工具",
  Comments: "留言",
  Forms: "表單",
  "Your document, in focus.": "專注於您的文件。",
  "Make it say what you mean.": "讓文字準確表達想法。",
  "A personal touch.": "加入您的想法。",
  "Select, move, and refine.": "選取、移動，細緻調整。",
  "Select text to copy. Double-click a line to edit it.":
    "選取文字即可複製。按兩下文字行即可編輯。",
  "Click a text line to replace it. Font coverage and size are previewed before applying.":
    "點選文字行以替換內容。套用前會預覽字型支援與文字大小。",
  "Click the page to place new text.": "點選頁面以放置新文字。",
  "Drag across a line or area to highlight it.": "拖曳文字行或區域以標記重點。",
  "Draw directly on the page. Each stroke can be undone.":
    "直接在頁面上繪圖。每一筆都可以復原。",
  "Drag to draw a rectangle.": "拖曳以繪製矩形。",
  "Click the page to place a PNG or JPEG image.":
    "點選頁面以放置 PNG 或 JPEG 圖片。",
  "Click the page to leave a comment.": "點選頁面以新增註解。",
  "Click an added object to select it. Drag to move, use the corner to resize, or double-click text to edit.":
    "點選新增的物件即可選取。拖曳移動、使用角落調整大小，或按兩下文字以編輯。",
  "Choose an object on the page. Items added in older Folio versions can be edited as existing PDF text, but are not separate movable objects.":
    "請在頁面上選取物件。舊版 Folio 新增的內容可作為現有 PDF 文字編輯，但不是獨立可移動的物件。",
  "Double-click to edit text": "按兩下以編輯文字",
  "No selectable text on this page. Scanned PDFs need OCR before text can be edited.":
    "此頁沒有可選取的文字。掃描 PDF 需先經過 OCR 才能編輯文字。",
  Export: "匯出",
  "Export file": "匯出檔案",
  "Close export": "關閉匯出",
  "Choose a format and the pages to include. Your original PDF stays safe.":
    "選擇格式與要匯出的頁面。原始 PDF 將受到保護。",
  Format: "格式",
  "Export format": "匯出格式",
  "PNG images": "PNG 圖片",
  "JPEG images": "JPEG 圖片",
  "Plain text (.txt)": "純文字（.txt）",
  "Export pages": "匯出頁面",
  "All pages": "全部頁面",
  "Page range": "頁面範圍",
  Resolution: "解析度",
  "Export resolution": "匯出解析度",
  "Exports selectable text. Scanned image text needs OCR.":
    "匯出可選取的文字。掃描圖片中的文字需要 OCR。",
  "PDF keeps text and graphics editable in Folio. Exporting all pages also saves your edits.":
    "PDF 可保留 Folio 的文字與圖形編輯功能。匯出全部頁面也會儲存目前的變更。",
  "Multiple images are saved together in a ZIP file. Images include your edits and annotations.":
    "多張圖片會一起儲存為 ZIP 檔案。圖片包含您的編輯內容與註解。",
  "Exporting…": "正在匯出…",
  "Enter pages like 1-3, 5.": "請輸入頁碼，例如 1-3, 5。",
  "The page range is outside this document.": "頁面範圍超出文件頁數。",
  "Your file has been exported.": "檔案已匯出。",
  Select: "選取",
  text: "文字",
  image: "圖片",
  highlight: "螢光標記",
  rectangle: "矩形",
  ink: "繪圖",
  note: "註解",
  annotation: "標記",
  "Drag to move. Double-click text to edit.": "拖曳以移動。按兩下文字以編輯。",
  "Resize selected object": "調整所選物件大小",
  "Drag to resize": "拖曳以調整大小",
  "Selected object": "所選物件",
  "Edit selected text": "編輯所選文字",
  Object: "物件",
  x: "X",
  y: "Y",
  width: "寬度",
  height: "高度",
  "Apply position / size": "套用位置／大小",
  "Delete selected object": "刪除所選物件",
  "Drag to move, use the corner to resize, or nudge with arrow keys. Shift moves 10 points.":
    "拖曳移動、使用角落調整大小，或用方向鍵微調。按住 Shift 可移動 10 點。",
  "Edit added text": "編輯新增文字",
  "Edit text line": "編輯文字行",
  "Unlock PDF": "解鎖 PDF",
  "Discard unsaved changes?": "捨棄未儲存的變更？",
  Unlock: "解鎖",
  "Apply change": "套用變更",
  "Replacement text": "替換文字",
  "Text content": "文字內容",
  "Edit this text object. You can change its content, font, size, and color.":
    "編輯此文字物件。您可以變更內容、字型、大小與顏色。",
  "Replace this line of text. Longer replacements shrink to fit; the rest of the page stays in place.":
    "替換此文字行。較長的內容會縮小以符合行寬，其餘頁面內容不會移動。",
  "Your text will appear at the point you selected.":
    "文字將出現在您選取的位置。",
  "This comment stays with the PDF as an annotation.":
    "此內容會以 PDF 註解形式保留。",
  Font: "字型",
  "Text color": "文字顏色",
  "Automatic (English / 中文)": "自動（英文／中文）",
  "Sans serif": "無襯線字型",
  Serif: "襯線字型",
  Monospace: "等寬字型",
  "Type in any supported language using your system keyboard. Interface language does not translate PDF contents.":
    "請使用系統鍵盤輸入支援的語言。介面語言不會翻譯 PDF 內容。",
  "Opening PDF": "正在開啟 PDF",
  "Creating example": "正在建立範例",
  "Creating document": "正在建立文件",
  "Applying edit": "正在套用編輯",
  Undoing: "正在復原",
  Redoing: "正在重做",
  "Saving PDF": "正在儲存 PDF",
  "Exporting file": "正在匯出檔案",
  "Rendering page": "正在顯示頁面",
  "Unlocking PDF": "正在解鎖 PDF",
  "Searching document": "正在搜尋文件",
  "Your edited copy has been saved.": "編輯後的副本已儲存。",
  "No matching text found. Scanned pages need OCR.":
    "找不到相符文字。掃描頁面需要 OCR。",
  "Incorrect password. Try again.": "密碼不正確，請再試一次。",
  "The replacement is too long for this line. Shorten it or use a smaller edit.":
    "替換內容超出行寬。請縮短內容或分次編輯。",
  "Place the text farther from the page edge.":
    "請將文字放置在距離頁面邊緣較遠的位置。",
  "This text does not fit above the bottom of the page. Use fewer lines or a smaller size.":
    "文字超出頁面底部。請減少行數或縮小字體。",
  "Keep the entire object inside the page.": "請將整個物件放在頁面範圍內。",
  "This PDF does not permit editing.": "此 PDF 不允許編輯。",
  "Rotate the page until this text is horizontal before editing.":
    "請先旋轉頁面，使文字呈水平排列後再編輯。",
  "Replace one line at a time. Use Add text for multiline text.":
    "請一次替換一行。多行文字請使用「新增文字」。",
  "Keep at least one page.": "請至少保留一頁。",
  "Select an object first.": "請先選取物件。",
  "Paste onto page": "貼到頁面",
  "Copy selected object": "複製選取物件",
  "Rotate object left": "向左旋轉物件",
  "Rotate object right": "向右旋轉物件",
  "Object rotation": "物件旋轉角度",
  "Selected object copied.": "已複製選取物件。",
  "Open or create a PDF before pasting.": "請先開啟或建立 PDF，再貼上內容。",
  "Reading clipboard": "讀取剪貼簿",
  "This document is read only.": "此文件為唯讀。",
  "The clipboard is empty.": "剪貼簿沒有內容。",
  "Clipboard has no supported text or image.": "剪貼簿沒有支援的文字或圖片。",
  "Clipboard content must be smaller than 40 MB.": "剪貼簿內容必須小於 40 MB。",
  "Paste up to 100,000 characters at a time.": "每次最多貼上 100,000 個字元。",
  "Choose a clipboard image of at most 18 megapixels.":
    "剪貼簿圖片最多為 1,800 萬像素。",
  "Select a Folio text box or image to copy.":
    "請選取 Folio 文字框或圖片以複製。",
  "Select a Folio text box or image first.": "請先選取 Folio 文字框或圖片。",
  "Resize this object before rotating it to fit the page.":
    "請先縮小物件，再旋轉以符合頁面。",
  "Paste farther from the page edge.": "請貼在距離頁面邊緣較遠的位置。",
};
