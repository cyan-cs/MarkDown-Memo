const STORAGE_KEY = "markdown-memo-content";

const editor = document.getElementById("editor");
const preview = document.getElementById("preview");
const clearBtn = document.getElementById("clearBtn");
const downloadBtn = document.getElementById("downloadBtn");
const toolbar = document.getElementById("toolbar");

marked.setOptions({
  gfm: true,
  breaks: true
});

function getInitialText() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved !== null) {
    return saved;
  }

  return [
    "# Markdown Memo",
    "",
    "Cloudflare Pagesで公開できる、シンプルなメモ帳です。",
    "",
    "- 左で編集",
    "- 右でプレビュー",
    "- 自動保存(localStorage)"
  ].join("\n");
}

function render(markdownText) {
  preview.innerHTML = marked.parse(markdownText);
  preview.querySelectorAll("pre code").forEach((block) => {
    if (window.hljs) {
      hljs.highlightElement(block);
    }
  });
}

function persist(markdownText) {
  localStorage.setItem(STORAGE_KEY, markdownText);
}

function downloadMarkdown(markdownText) {
  const blob = new Blob([markdownText], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "memo.md";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function updateFromEditor() {
  const text = editor.value;
  persist(text);
  render(text);
}

function replaceSelection(replacement, selectionStart = null, selectionEnd = null) {
  const start = selectionStart ?? editor.selectionStart;
  const end = selectionEnd ?? editor.selectionEnd;
  const value = editor.value;
  editor.value = value.slice(0, start) + replacement + value.slice(end);
  const caret = start + replacement.length;
  editor.selectionStart = caret;
  editor.selectionEnd = caret;
  updateFromEditor();
}

function wrapSelection(prefix, suffix, placeholder = "text") {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const selected = editor.value.slice(start, end);
  const body = selected || placeholder;
  const next = `${prefix}${body}${suffix}`;
  editor.value = editor.value.slice(0, start) + next + editor.value.slice(end);
  const cursorStart = start + prefix.length;
  const cursorEnd = cursorStart + body.length;
  editor.selectionStart = cursorStart;
  editor.selectionEnd = cursorEnd;
  updateFromEditor();
  editor.focus();
}

function getSelectedLineRange() {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const value = editor.value;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEndBreak = value.indexOf("\n", end);
  const lineEnd = lineEndBreak === -1 ? value.length : lineEndBreak;
  return { lineStart, lineEnd };
}

function transformSelectedLines(transformer) {
  const value = editor.value;
  const originalStart = editor.selectionStart;
  const originalEnd = editor.selectionEnd;
  const { lineStart, lineEnd } = getSelectedLineRange();
  const chunk = value.slice(lineStart, lineEnd);
  const lines = chunk.split("\n");
  const nextLines = lines.map(transformer);
  const nextChunk = nextLines.join("\n");

  editor.value = value.slice(0, lineStart) + nextChunk + value.slice(lineEnd);
  if (originalStart === originalEnd) {
    editor.selectionStart = lineStart;
    editor.selectionEnd = lineStart;
  } else {
    editor.selectionStart = lineStart;
    editor.selectionEnd = lineStart + nextChunk.length;
  }
  updateFromEditor();
  editor.focus();
}

function toggleListMarker(marker) {
  transformSelectedLines((line) => {
    if (line.startsWith(`${marker} `)) {
      return line.slice(2);
    }
    return `${marker} ${line}`;
  });
}

function insertCodeBlock() {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const selected = editor.value.slice(start, end);
  const content = selected || "code";
  const block = `\`\`\`\n${content}\n\`\`\``;
  editor.value = editor.value.slice(0, start) + block + editor.value.slice(end);
  editor.selectionStart = start + 4;
  editor.selectionEnd = start + 4 + content.length;
  updateFromEditor();
  editor.focus();
}

function insertQuote() {
  transformSelectedLines((line) => {
    if (line.startsWith("> ")) {
      return line.slice(2);
    }
    return `> ${line}`;
  });
}

function isInsideCodeFence(cursorPos) {
  const before = editor.value.slice(0, cursorPos);
  const fenceCount = (before.match(/^```/gm) || []).length;
  return fenceCount % 2 === 1;
}

function continueListOnEnter(event) {
  if (event.key !== "Enter" || editor.selectionStart !== editor.selectionEnd) {
    return;
  }

  const pos = editor.selectionStart;
  if (isInsideCodeFence(pos)) {
    return;
  }

  const value = editor.value;
  const lineStart = value.lastIndexOf("\n", pos - 1) + 1;
  const lineEndBreak = value.indexOf("\n", pos);
  const lineEnd = lineEndBreak === -1 ? value.length : lineEndBreak;
  const line = value.slice(lineStart, lineEnd);

  const taskMatch = line.match(/^(\s*)([-*+])\s+\[( |x|X)\]\s+(.*)$/);
  const ulMatch = line.match(/^(\s*)([-*+])\s+(.*)$/);
  const olMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);

  if (taskMatch) {
    event.preventDefault();
    const indent = taskMatch[1];
    const marker = taskMatch[2];
    const content = taskMatch[4];
    if (!content.trim()) {
      replaceSelection(indent, lineStart, lineEnd);
      editor.selectionStart = lineStart + indent.length;
      editor.selectionEnd = lineStart + indent.length;
      updateFromEditor();
      return;
    }
    const insertion = `\n${indent}${marker} [ ] `;
    replaceSelection(insertion, pos, pos);
    return;
  }

  if (ulMatch) {
    event.preventDefault();
    const indent = ulMatch[1];
    const marker = ulMatch[2];
    const content = ulMatch[3];
    if (!content.trim()) {
      replaceSelection(indent, lineStart, lineEnd);
      editor.selectionStart = lineStart + indent.length;
      editor.selectionEnd = lineStart + indent.length;
      updateFromEditor();
      return;
    }
    const insertion = `\n${indent}${marker} `;
    replaceSelection(insertion, pos, pos);
    return;
  }

  if (olMatch) {
    event.preventDefault();
    const indent = olMatch[1];
    const index = Number(olMatch[2]);
    const content = olMatch[3];
    if (!content.trim()) {
      replaceSelection(indent, lineStart, lineEnd);
      editor.selectionStart = lineStart + indent.length;
      editor.selectionEnd = lineStart + indent.length;
      updateFromEditor();
      return;
    }
    const insertion = `\n${indent}${index + 1}. `;
    replaceSelection(insertion, pos, pos);
  }
}

function indentSelectedLines(useShiftKey) {
  const value = editor.value;
  const originalStart = editor.selectionStart;
  const originalEnd = editor.selectionEnd;
  const { lineStart, lineEnd } = getSelectedLineRange();
  const chunk = value.slice(lineStart, lineEnd);
  const lines = chunk.split("\n");

  const nextLines = lines.map((line) => {
    if (useShiftKey) {
      if (line.startsWith("  ")) {
        return line.slice(2);
      }
      if (line.startsWith(" ")) {
        return line.slice(1);
      }
      return line;
    }
    return `  ${line}`;
  });

  const nextChunk = nextLines.join("\n");
  editor.value = value.slice(0, lineStart) + nextChunk + value.slice(lineEnd);
  const delta = nextChunk.length - chunk.length;
  editor.selectionStart = originalStart + (useShiftKey ? -Math.min(2, originalStart - lineStart) : 2);
  editor.selectionEnd = originalEnd + delta;
  updateFromEditor();
}

function runAction(action) {
  const actions = {
    bold: () => wrapSelection("**", "**"),
    italic: () => wrapSelection("*", "*"),
    strike: () => wrapSelection("~~", "~~"),
    inlineCode: () => wrapSelection("`", "`"),
    codeBlock: () => insertCodeBlock(),
    ulDash: () => toggleListMarker("-"),
    ulStar: () => toggleListMarker("*"),
    quote: () => insertQuote()
  };
  if (actions[action]) {
    actions[action]();
  }
}

const initialText = getInitialText();
editor.value = initialText;
render(initialText);

editor.addEventListener("input", () => {
  updateFromEditor();
});

editor.addEventListener("keydown", (event) => {
  const hasMeta = event.ctrlKey || event.metaKey;

  if (hasMeta && event.key.toLowerCase() === "b") {
    event.preventDefault();
    runAction("bold");
    return;
  }

  if (hasMeta && event.key.toLowerCase() === "i") {
    event.preventDefault();
    runAction("italic");
    return;
  }

  if (hasMeta && event.shiftKey && event.key.toLowerCase() === "x") {
    event.preventDefault();
    runAction("strike");
    return;
  }

  if (hasMeta && event.shiftKey && event.key.toLowerCase() === "c") {
    event.preventDefault();
    runAction("codeBlock");
    return;
  }

  if (hasMeta && event.key === "`") {
    event.preventDefault();
    runAction("inlineCode");
    return;
  }

  if (hasMeta && event.key.toLowerCase() === "s") {
    event.preventDefault();
    downloadMarkdown(editor.value);
    return;
  }

  if (event.key === "Tab") {
    event.preventDefault();
    indentSelectedLines(event.shiftKey);
    return;
  }

  continueListOnEnter(event);
});

toolbar.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) {
    return;
  }
  runAction(target.dataset.action);
});

clearBtn.addEventListener("click", () => {
  editor.value = "";
  persist("");
  render("");
  editor.focus();
});

downloadBtn.addEventListener("click", () => {
  downloadMarkdown(editor.value);
});
