import React, { useEffect, useMemo, useRef, useState } from 'react';
import CommandPalette from './CommandPalette';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { highlight } from '../lib/shiki';
import { marked } from 'marked';

const BLOCK_REGEX = /(code|latex|link|video|image|file|checklist|separator|md|markdown)\+block\{((?:\\}|[^}])*)\}/g;
const BLOCK_NEWLINE_TOKEN = '__QN_BLOCK_NL__';

function escapeBlockContent(value) {
  return String(value || '')
    .replace(/\n/g, BLOCK_NEWLINE_TOKEN)
    .replace(/}/g, '\\}');
}

function unescapeBlockContent(value) {
  return String(value || '')
    .replace(/\\}/g, '}')
    .replaceAll(BLOCK_NEWLINE_TOKEN, '\n');
}

function asHref(value) {
  if (!value) return '#';
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function parseChecklistLine(line) {
  const match = String(line || '').match(/^[-*]\s*\[( |x|X)\]\s*(.*)$/);
  if (!match) {
    return {
      checked: false,
      text: String(line || '').trim()
    };
  }

  return {
    checked: /x/i.test(match[1] || ''),
    text: match[2] || ''
  };
}

function formatChecklistLine({ checked, text }) {
  return `- [${checked ? 'x' : ' '}] ${text || ''}`;
}

function createBlockChip(type, value) {
  const chip = document.createElement('span');
  chip.setAttribute('data-block-type', type);
  chip.setAttribute('data-block-content', value);
  chip.setAttribute('contenteditable', 'false');
  chip.className = 'inline-flex items-center align-middle max-w-full px-2 py-0.5 mx-0.5 rounded-md border border-zinc-700 bg-zinc-800 text-zinc-100 text-xs whitespace-nowrap overflow-hidden';

  const preview = value.replace(/\s+/g, ' ').trim().slice(0, 56);

  if (type === 'code') {
    chip.className = 'inline-flex items-center align-middle max-w-full mx-0.5 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-100 text-xs overflow-hidden';
    const rendered = document.createElement('span');
    rendered.className = 'max-w-[420px] block';
    rendered.innerHTML = highlight(value || '', 'javascript');
    const pre = rendered.querySelector('pre');
    if (pre) {
      pre.style.margin = '0';
      pre.style.padding = '6px 8px';
      pre.style.borderRadius = '0';
      pre.style.fontSize = '12px';
      pre.style.lineHeight = '1.35';
      pre.style.whiteSpace = 'pre';
      pre.style.overflow = 'hidden';
      pre.style.textOverflow = 'ellipsis';
      pre.style.maxWidth = '420px';
      pre.style.display = 'block';
    }
    chip.appendChild(rendered);
    return chip;
  }

  if (type === 'link') {
    const anchor = document.createElement('a');
    anchor.href = asHref(value.trim());
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.className = 'text-blue-400 underline hover:text-blue-300 max-w-[420px] truncate';
    anchor.textContent = value.trim() || 'empty link';
    chip.appendChild(anchor);
    return chip;
  }

  if (type === 'latex') {
    chip.className = 'inline-flex items-center align-middle max-w-full px-2 py-1 mx-0.5 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-100 text-xs overflow-hidden';
    const latexWrap = document.createElement('span');
    latexWrap.className = 'max-w-[420px] overflow-hidden';
    latexWrap.innerHTML = katex.renderToString(value || '', { throwOnError: false });
    chip.appendChild(latexWrap);
    return chip;
  }

  if (type === 'image') {
    chip.textContent = `🖼 ${preview || 'image'}`;
    return chip;
  }

  if (type === 'video') {
    chip.textContent = `🎬 ${preview || 'video'}`;
    return chip;
  }

  if (type === 'file') {
    chip.textContent = `📁 ${preview || 'file'}`;
    return chip;
  }

  if (type === 'checklist') {
    chip.className = 'inline-flex items-center align-middle max-w-full mx-0.5 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-100 text-xs overflow-hidden';
    const checklistWrap = document.createElement('span');
    checklistWrap.className = 'max-w-[420px] block p-2';

    const lines = String(value || '').split('\n').map((line) => line.trim()).filter(Boolean);
    const rows = lines.length > 0 ? lines : ['- [ ] checklist item'];

    rows.forEach((line, rowIndex) => {
      const row = document.createElement('div');
      row.className = 'flex items-center gap-2';
      const parsed = parseChecklistLine(line);
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = parsed.checked;
      const label = document.createElement('span');
      label.textContent = parsed.text;
      label.style.whiteSpace = 'nowrap';
      label.style.overflow = 'hidden';
      label.style.textOverflow = 'ellipsis';
      label.style.maxWidth = '360px';

      input.addEventListener('change', () => {
        const hostChip = input.closest('[data-block-type="checklist"]');
        if (!hostChip) return;

        const currentContent = hostChip.getAttribute('data-block-content') || '';
        const currentLines = String(currentContent)
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean);

        const normalizedRows = currentLines.length > 0 ? currentLines : ['- [ ] checklist item'];
        const targetIndex = rowIndex;
        if (targetIndex < 0 || targetIndex >= normalizedRows.length) return;

        const updatedRows = normalizedRows.map((item, index) => {
          if (index !== targetIndex) return item;
          const current = parseChecklistLine(item);
          return formatChecklistLine({ checked: input.checked, text: current.text });
        });

        const nextContent = updatedRows.join('\n');
        hostChip.setAttribute('data-block-content', nextContent);
        hostChip.dispatchEvent(new Event('input', { bubbles: true }));
      });

      row.appendChild(input);
      row.appendChild(label);
      checklistWrap.appendChild(row);
    });

    chip.appendChild(checklistWrap);
    return chip;
  }

  if (type === 'separator') {
    chip.className = 'inline-flex items-center align-middle w-full my-1 p-0 border-0 bg-transparent';
    const line = document.createElement('span');
    line.className = 'block w-full border-t border-zinc-700 opacity-70';
    chip.appendChild(line);
    return chip;
  }

  if (type === 'md' || type === 'markdown') {
    chip.className = 'inline-flex items-center align-middle max-w-full mx-0.5 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-100 text-xs overflow-hidden';
    const mdWrap = document.createElement('span');
    mdWrap.className = 'max-w-[480px] block p-2';
    mdWrap.innerHTML = marked.parse(value || '', { gfm: true, breaks: true });
    mdWrap.querySelectorAll('h1,h2,h3,h4,h5,h6,p,ul,ol,table,pre,blockquote').forEach((node) => {
      node.style.margin = '0 0 6px 0';
    });
    mdWrap.querySelectorAll('ul,ol').forEach((node) => {
      node.style.paddingLeft = '16px';
    });
    mdWrap.querySelectorAll('table').forEach((table) => {
      table.style.borderCollapse = 'collapse';
      table.style.fontSize = '12px';
      table.querySelectorAll('th,td').forEach((cell) => {
        cell.style.border = '1px solid #3f3f46';
        cell.style.padding = '2px 6px';
      });
    });
    chip.appendChild(mdWrap);
    return chip;
  }

  chip.textContent = `${type.toUpperCase()}: ${preview}${value.length > 56 ? '…' : ''}`;
  return chip;
}

function parseInlineNodes(text) {
  BLOCK_REGEX.lastIndex = 0;
  const nodes = [];
  let lastIndex = 0;
  let match;

  const parseInlineMarkdownText = (value) => {
    const source = String(value || '');
    const inlineNodes = [];
    const inlineRegex = /(\*\*|__)([^\n]+?)\1|(?<!\*)\*([^*\n]+)\*(?!\*)|(?<!_)_([^_\n]+)_(?!_)/g;
    let cursor = 0;
    let token;

    while ((token = inlineRegex.exec(source)) !== null) {
      if (token.index > cursor) {
        inlineNodes.push(document.createTextNode(source.slice(cursor, token.index)));
      }

      if (token[2] != null) {
        const strong = document.createElement('strong');
        strong.appendChild(document.createTextNode(token[2] || ''));
        inlineNodes.push(strong);
      } else {
        const em = document.createElement('em');
        em.appendChild(document.createTextNode(token[3] || token[4] || ''));
        inlineNodes.push(em);
      }

      cursor = inlineRegex.lastIndex;
    }

    if (cursor < source.length) {
      inlineNodes.push(document.createTextNode(source.slice(cursor)));
    }

    return inlineNodes;
  };

  while ((match = BLOCK_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parseInlineMarkdownText(text.slice(lastIndex, match.index)).forEach((node) => nodes.push(node));
    }
    nodes.push(createBlockChip(match[1], unescapeBlockContent(match[2])));
    lastIndex = BLOCK_REGEX.lastIndex;
  }

  if (lastIndex < text.length) {
    parseInlineMarkdownText(text.slice(lastIndex)).forEach((node) => nodes.push(node));
  }

  return nodes;
}

function parseContentToNodes(content) {
  const normalized = String(content || '').replace(/\r\n?/g, '\n');
  const safeContent = normalized.replace(BLOCK_REGEX, (_full, type, blockContent) => {
    const escapedNewlines = String(blockContent || '').replace(/\n/g, BLOCK_NEWLINE_TOKEN);
    return `${type}+block{${escapedNewlines}}`;
  });
  const lines = safeContent.split('\n');
  const nodes = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] || '';
    const unorderedMatch = line.match(/^\s*[-*+]\s+(.*)$/);
    const orderedMatch = line.match(/^\s*\d+\.\s+(.*)$/);

    if (unorderedMatch || orderedMatch) {
      const isOrdered = Boolean(orderedMatch);
      const listEl = document.createElement(isOrdered ? 'ol' : 'ul');

      while (index < lines.length) {
        const listLine = lines[index] || '';
        const match = isOrdered
          ? listLine.match(/^\s*\d+\.\s+(.*)$/)
          : listLine.match(/^\s*[-*+]\s+(.*)$/);
        if (!match) break;

        const li = document.createElement('li');
        const inline = parseInlineNodes(match[1]);
        if (inline.length === 0) {
          li.appendChild(document.createElement('br'));
        } else {
          inline.forEach((node) => li.appendChild(node));
        }
        listEl.appendChild(li);
        index += 1;
      }

      nodes.push(listEl);
      continue;
    }

    const htmlHeadingMatch = line.match(/^\s*<h([1-6])>([\s\S]*)<\/h\1>\s*$/i);
    const markdownHeadingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (htmlHeadingMatch || markdownHeadingMatch) {
      const level = htmlHeadingMatch ? Number(htmlHeadingMatch[1]) : markdownHeadingMatch[1].length;
      const headingText = htmlHeadingMatch ? htmlHeadingMatch[2] : markdownHeadingMatch[2];
      const heading = document.createElement(`h${level}`);
      heading.setAttribute('data-heading-level', String(level));
      applyHeadingStyles(heading, level);
      const inline = parseInlineNodes(headingText);
      if (inline.length === 0) {
        heading.appendChild(document.createElement('br'));
      } else {
        inline.forEach((node) => heading.appendChild(node));
      }
      nodes.push(heading);
      index += 1;
      continue;
    }

    const block = document.createElement('div');
    const inline = parseInlineNodes(line);
    if (inline.length === 0) {
      block.appendChild(document.createElement('br'));
    } else {
      inline.forEach((node) => block.appendChild(node));
    }
    nodes.push(block);
    index += 1;
  }

  if (nodes.length === 0) {
    const empty = document.createElement('div');
    empty.appendChild(document.createElement('br'));
    nodes.push(empty);
  }

  return nodes;
}

function serializeEditor(root) {
  if (!root) return '';
  let result = '';

  const walk = (node, context = {}) => {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent || '';
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node;
    const blockType = el.getAttribute('data-block-type');
    if (blockType) {
      const blockContent = el.getAttribute('data-block-content') || '';
      result += `${blockType}+block{${escapeBlockContent(blockContent)}}`;
      return;
    }

    if (el.tagName === 'BR') {
      result += '\n';
      return;
    }

    if (el.tagName === 'UL' || el.tagName === 'OL') {
      el.childNodes.forEach((child) => walk(child, { listType: el.tagName }));
      return;
    }

    if (el.tagName === 'LI') {
      const prefix = context.listType === 'OL' ? '1. ' : '- ';
      result += prefix;
      el.childNodes.forEach((child) => walk(child, context));
      if (!result.endsWith('\n')) result += '\n';
      return;
    }

    if (el.tagName === 'STRONG' || el.tagName === 'B') {
      result += '**';
      el.childNodes.forEach((child) => walk(child, context));
      result += '**';
      return;
    }

    if (el.tagName === 'EM' || el.tagName === 'I') {
      result += '_';
      el.childNodes.forEach((child) => walk(child, context));
      result += '_';
      return;
    }

    const headingLevelAttr = el.getAttribute('data-heading-level');
    if (/^H[1-6]$/.test(el.tagName) || headingLevelAttr) {
      const level = headingLevelAttr ? Number(headingLevelAttr) : Number(el.tagName[1]);
      result += `<h${level}>`;
      el.childNodes.forEach((child) => walk(child, context));
      result += `</h${level}>`;
      if (!result.endsWith('\n')) result += '\n';
      return;
    }

    const isLineContainer = el.tagName === 'DIV' || el.tagName === 'P';
    const before = result.length;
    el.childNodes.forEach((child) => walk(child, context));

    if (isLineContainer) {
      const changed = result.length !== before;
      if (changed && !result.endsWith('\n')) {
        result += '\n';
      }
      if (!changed) {
        result += '\n';
      }
    }
  };

  root.childNodes.forEach(walk);

  if (result.endsWith('\n')) {
    result = result.replace(/\n+$/g, '\n');
  }

  return result;
}

function setCaretAfterNode(node) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function setCaretAtStart(node) {
  const selection = window.getSelection();
  if (!selection || !node) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function replaceElementTag(element, nextTag) {
  const replacement = document.createElement(nextTag);
  while (element.firstChild) {
    replacement.appendChild(element.firstChild);
  }
  element.replaceWith(replacement);
  return replacement;
}

function applyHeadingStyles(element, level) {
  const sizes = {
    1: '2rem',
    2: '1.65rem',
    3: '1.4rem',
    4: '1.2rem',
    5: '1.06rem',
    6: '0.95rem'
  };
  const weights = {
    1: '800',
    2: '780',
    3: '750',
    4: '720',
    5: '690',
    6: '660'
  };
  element.style.fontSize = sizes[level] || sizes[6];
  element.style.fontWeight = weights[level] || weights[6];
  element.style.margin = '0';
}

function setCaretAtEnd(node) {
  const selection = window.getSelection();
  if (!selection || !node) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function setCaretInTextNode(textNode, offset) {
  const selection = window.getSelection();
  if (!selection || !textNode) return;
  const range = document.createRange();
  const safeOffset = Math.max(0, Math.min(offset, (textNode.textContent || '').length));
  range.setStart(textNode, safeOffset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function getCaretCharacterOffset(root) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed || !root) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;

  const probe = document.createRange();
  probe.selectNodeContents(root);
  probe.setEnd(range.startContainer, range.startOffset);
  return probe.toString().length;
}

function setCaretByCharacterOffset(root, offset) {
  if (!root || offset == null) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = Math.max(0, offset);
  let node = walker.nextNode();

  while (node) {
    const len = (node.textContent || '').length;
    if (remaining <= len) {
      setCaretInTextNode(node, remaining);
      return;
    }
    remaining -= len;
    node = walker.nextNode();
  }

  setCaretAtEnd(root);
}

function normalizeHeadingElement(blockEl, level, textValue = '', caretToEnd = true) {
  const headingTag = `h${level}`;
  const isSameTag = blockEl.tagName?.toLowerCase() === headingTag;
  const headingEl = isSameTag ? blockEl : replaceElementTag(blockEl, headingTag);

  headingEl.setAttribute('data-heading-level', String(level));
  applyHeadingStyles(headingEl, level);

  headingEl.innerHTML = '';
  if (!textValue) {
    headingEl.appendChild(document.createElement('br'));
    setCaretAtStart(headingEl);
  } else {
    const textNode = document.createTextNode(textValue);
    headingEl.appendChild(textNode);
    if (caretToEnd) {
      setCaretInTextNode(textNode, textValue.length);
    } else {
      setCaretInTextNode(textNode, 0);
    }
  }

  return headingEl;
}

function getClosestBlockElement(node, editorRoot) {
  let current = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  while (current && current !== editorRoot) {
    const tag = current.tagName;
    if (tag === 'DIV' || tag === 'P' || /^H[1-6]$/.test(tag) || tag === 'LI') {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function ensureBlockElementAtCaret(editorRoot, selection) {
  if (!editorRoot || !selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  let blockEl = getClosestBlockElement(range.startContainer, editorRoot);
  if (blockEl) return blockEl;

  const container = range.startContainer;
  if (container.nodeType === Node.TEXT_NODE && container.parentNode === editorRoot) {
    const wrapper = document.createElement('div');
    container.parentNode.insertBefore(wrapper, container);
    wrapper.appendChild(container);
    return wrapper;
  }

  if (container === editorRoot) {
    const wrapper = document.createElement('div');
    const nodeAtOffset = editorRoot.childNodes[range.startOffset] || null;
    if (nodeAtOffset) {
      editorRoot.insertBefore(wrapper, nodeAtOffset);
    } else {
      editorRoot.appendChild(wrapper);
    }
    wrapper.appendChild(document.createElement('br'));
    setCaretAtStart(wrapper);
    return wrapper;
  }

  return null;
}

function getTextBeforeCaretInBlock(selection, blockEl) {
  if (!selection || !blockEl || selection.rangeCount === 0) return '';
  const range = selection.getRangeAt(0);
  const probe = document.createRange();
  probe.setStart(blockEl, 0);
  probe.setEnd(range.startContainer, range.startOffset);
  return probe.toString();
}

export default function Editor({ content, setContent }) {
  const [cmdOpen, setCmdOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState(null);
  const [blockContent, setBlockContent] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const editorRef = useRef(null);
  const blockInputRef = useRef(null);
  const markerRef = useRef(null);
  const initializedRef = useRef(false);

  const focusEditorAtEnd = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const normalizeCaretAfterBlock = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0 || !selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const container = range.startContainer;
    const offset = range.startOffset;

    if (container.nodeType === Node.ELEMENT_NODE) {
      const el = container;
      const nodeAtCaret = el.childNodes[offset] || null;
      if (nodeAtCaret && nodeAtCaret.nodeType === Node.ELEMENT_NODE && nodeAtCaret.getAttribute('data-block-type')) {
        setCaretAfterNode(nodeAtCaret);
      }
    }
  };

  const placeholderVisible = useMemo(() => {
    return !content.trim() && !isFocused && !editingBlock;
  }, [content, isFocused, editingBlock]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const current = serializeEditor(editor);
    if (initializedRef.current && current === content) {
      const hasHeadingMarkdown = /(^|\n)#{1,6}\s+/.test(content || '');
      const hasHeadingHtml = /<h[1-6]>[\s\S]*<\/h[1-6]>/i.test(content || '');
      const hasHeadingNodes = Boolean(editor.querySelector('h1,h2,h3,h4,h5,h6,[data-heading-level]'));
      const hasRawInlineMarkdown = /(\*\*|__)[^\n]+?\1|(?<!\*)\*[^*\n]+\*(?!\*)|(?<!_)_[^_\n]+_(?!_)/.test(editor.textContent || '');
      if (((!hasHeadingMarkdown && !hasHeadingHtml) || hasHeadingNodes) && !hasRawInlineMarkdown) return;
    }

    const caretOffset = getCaretCharacterOffset(editor);

    editor.innerHTML = '';
    parseContentToNodes(content).forEach((node) => editor.appendChild(node));
    if (caretOffset != null) {
      requestAnimationFrame(() => {
        setCaretByCharacterOffset(editor, caretOffset);
      });
    }
    initializedRef.current = true;
  }, [content]);

  useEffect(() => {
    if (editingBlock && blockInputRef.current) {
      blockInputRef.current.focus();
    }
  }, [editingBlock]);

  useEffect(() => {
    if (!cmdOpen && !editingBlock) {
      requestAnimationFrame(() => {
        focusEditorAtEnd();
      });
    }
  }, [cmdOpen, editingBlock]);

  const syncContent = () => {
    const editor = editorRef.current;
    if (!editor) return;
    setContent(serializeEditor(editor));
  };

  const openBlockEditorFromCommand = (type, textNode, offset) => {
    const editor = editorRef.current;
    if (!editor) return;

    if (type === 'separator') {
      const before = (textNode.textContent || '').slice(0, offset);
      const separatorMatch = before.match(/:(seperator|separator)$/);
      if (!separatorMatch) return;

      const command = separatorMatch[0];
      const commandStart = offset - command.length;
      textNode.textContent = (textNode.textContent || '').slice(0, commandStart) + (textNode.textContent || '').slice(offset);

      const selection = window.getSelection();
      if (!selection) return;
      const range = document.createRange();
      range.setStart(textNode, commandStart);
      range.collapse(true);

      const chip = createBlockChip('separator', '');
      range.insertNode(chip);
      setCaretAfterNode(chip);
      syncContent();
      return;
    }

    const before = (textNode.textContent || '').slice(0, offset);
    const match = before.match(/:(code|latex|link|image|video|file|checklist|md|markdown)$/);
    if (!match) return;

    const command = `:${type}`;
    const commandStart = offset - command.length;
    textNode.textContent = (textNode.textContent || '').slice(0, commandStart) + (textNode.textContent || '').slice(offset);

    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.setStart(textNode, commandStart);
    range.collapse(true);

    const marker = document.createElement('span');
    marker.setAttribute('data-block-marker', 'true');
    marker.setAttribute('contenteditable', 'false');
    marker.style.display = 'inline-block';
    marker.style.width = '0';
    marker.style.height = '0';
    marker.style.overflow = 'hidden';
    marker.textContent = '\u200b';

    range.insertNode(marker);
    markerRef.current = marker;
    setEditingBlock(type);
    setBlockContent('');
    syncContent();
  };

  const handleEditorKeyDown = (e) => {
    if (e.ctrlKey && e.code === 'Space') {
      e.preventDefault();
      setCmdOpen((v) => !v);
      return;
    }

    if (e.ctrlKey && (e.key === 'r' || e.key === 'R')) {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('quicknote:open-rename'));
      return;
    }

    if (e.key === 'F2') {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('quicknote:open-rename'));
      return;
    }

    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);

    if (e.key === 'Enter' && !e.shiftKey && range.collapsed) {
      const blockEl = getClosestBlockElement(range.startContainer, editor);
      if (blockEl && /^H[1-6]$/.test(blockEl.tagName)) {
        e.preventDefault();

        const nextLine = document.createElement('div');
        nextLine.appendChild(document.createElement('br'));

        if (blockEl.nextSibling) {
          blockEl.parentNode.insertBefore(nextLine, blockEl.nextSibling);
        } else {
          blockEl.parentNode.appendChild(nextLine);
        }

        setCaretAtStart(nextLine);
        syncContent();
        return;
      }
    }

    if (e.key === ' ' && range.collapsed) {
      const container = range.startContainer;
      const offset = range.startOffset;

      if (container.nodeType === Node.TEXT_NODE) {
        const arrowSymbolMap = {
          ':uparrow': '↑',
          ':downarrow': '↓',
          ':leftarrow': '←',
          ':rightarrow': '→'
        };

        const textNode = container;
        const textBefore = (textNode.textContent || '').slice(0, offset);
        const arrowMatch = textBefore.match(/:(uparrow|downarrow|leftarrow|rightarrow)$/);

        if (arrowMatch) {
          e.preventDefault();
          const token = arrowMatch[0];
          const symbol = arrowSymbolMap[token] || token;
          const tokenStart = offset - token.length;
          const fullText = textNode.textContent || '';
          textNode.textContent = `${fullText.slice(0, tokenStart)}${symbol} ${fullText.slice(offset)}`;
          setCaretInTextNode(textNode, tokenStart + symbol.length + 1);
          syncContent();
          return;
        }
      }

      let blockEl = getClosestBlockElement(range.startContainer, editor);
      let preText = blockEl ? getTextBeforeCaretInBlock(selection, blockEl).trim() : '';

      const isMarkdownTrigger = /^(#{1,6}|[-*+]|\d+\.)$/.test(preText);
      if (!isMarkdownTrigger) return;

      if (!blockEl) {
        blockEl = ensureBlockElementAtCaret(editor, selection);
        preText = getTextBeforeCaretInBlock(selection, blockEl).trim();
      }

      const headingMatch = preText.match(/^#{1,6}$/);
      const unorderedMatch = preText.match(/^[-*+]$/);
      const orderedMatch = preText.match(/^\d+\.$/);

      if ((headingMatch || unorderedMatch || orderedMatch) && blockEl) {
        e.preventDefault();

        const raw = blockEl.textContent || '';

        if (headingMatch) {
          const level = headingMatch[0].length;
          const remaining = raw.replace(/^\s*#{1,6}\s?/, '');
          normalizeHeadingElement(blockEl, level, remaining, true);
        } else if (unorderedMatch) {
          const remaining = raw.replace(/^\s*[-*+]\s?/, '');
          const list = document.createElement('ul');
          const item = document.createElement('li');
          if (remaining) {
            item.textContent = remaining;
          } else {
            item.appendChild(document.createElement('br'));
          }
          list.appendChild(item);
          blockEl.replaceWith(list);
          setCaretAtStart(item);
        } else if (orderedMatch) {
          const remaining = raw.replace(/^\s*\d+\.\s?/, '');
          const list = document.createElement('ol');
          const item = document.createElement('li');
          if (remaining) {
            item.textContent = remaining;
          } else {
            item.appendChild(document.createElement('br'));
          }
          list.appendChild(item);
          blockEl.replaceWith(list);
          setCaretAtStart(item);
        }

        syncContent();
        return;
      }
    }

    if ((e.key === 'Enter' || e.key === ' ') && range.collapsed) {
      const container = range.startContainer;
      const offset = range.startOffset;

      if (container.nodeType === Node.TEXT_NODE) {
        const textBefore = (container.textContent || '').slice(0, offset);
        const separatorMatch = textBefore.match(/:(seperator|separator)$/);
        if (separatorMatch) {
          e.preventDefault();
          openBlockEditorFromCommand('separator', container, offset);
          return;
        }

        const match = textBefore.match(/:(code|latex|link|image|video|file|checklist|md|markdown)$/);
        if (match) {
          e.preventDefault();
          openBlockEditorFromCommand(match[1], container, offset);
          return;
        }
      }
    }

    if ((e.key === 'Backspace' || e.key === 'Delete') && range.collapsed) {
      const container = range.startContainer;
      const offset = range.startOffset;

      let candidate = null;
      if (container.nodeType === Node.TEXT_NODE) {
        const textNode = container;
        if (e.key === 'Backspace' && offset === 0) {
          candidate = textNode.previousSibling;
        }
        if (e.key === 'Delete' && offset === (textNode.textContent || '').length) {
          candidate = textNode.nextSibling;
        }
      } else if (container.nodeType === Node.ELEMENT_NODE) {
        const el = container;
        if (e.key === 'Backspace' && offset > 0) candidate = el.childNodes[offset - 1];
        if (e.key === 'Delete') candidate = el.childNodes[offset] || null;
      }

      if (candidate && candidate.nodeType === Node.ELEMENT_NODE && candidate.getAttribute('data-block-type')) {
        e.preventDefault();
        candidate.remove();
        syncContent();
      }
    }
  };

  const handleEditorInput = () => {
    syncContent();
  };

  const handleBlockKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const marker = markerRef.current;
      const editor = editorRef.current;
      if (!editor) return;

      const chip = createBlockChip(editingBlock, blockContent);

      if (marker && marker.parentNode) {
        marker.replaceWith(chip);
      } else {
        editor.appendChild(chip);
      }

      markerRef.current = null;
      setEditingBlock(null);
      setBlockContent('');
      syncContent();

      requestAnimationFrame(() => {
        editor.focus();
        setCaretAfterNode(chip);
      });
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      const marker = markerRef.current;
      if (marker && marker.parentNode) marker.remove();
      markerRef.current = null;
      setEditingBlock(null);
      setBlockContent('');
      syncContent();
      requestAnimationFrame(() => editorRef.current?.focus());
      return;
    }

    const pairs = {
      '(': ')',
      '[': ']',
      '{': '}',
      '<': '>',
      '"': '"',
      "'": "'",
      '`': '`'
    };

    const close = pairs[e.key];
    if (!close) return;

    e.preventDefault();
    const textarea = blockInputRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = blockContent.slice(start, end);

    if (start !== end) {
      const next = blockContent.slice(0, start) + e.key + selected + close + blockContent.slice(end);
      setBlockContent(next);
      requestAnimationFrame(() => {
        textarea.selectionStart = start + 1;
        textarea.selectionEnd = end + 1;
      });
      return;
    }

    const next = blockContent.slice(0, start) + e.key + close + blockContent.slice(start);
    setBlockContent(next);
    requestAnimationFrame(() => {
      textarea.selectionStart = start + 1;
      textarea.selectionEnd = start + 1;
    });
  };

  return (
    <div className="h-full relative overflow-hidden">
      {placeholderVisible && (
        <div className="absolute top-4 left-4 text-zinc-500 text-sm pointer-events-none">
          Write your note... use :code :latex :link :image :video :file :checklist :seperator :md then Enter/Space
        </div>
      )}

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onKeyDown={handleEditorKeyDown}
        onKeyUp={normalizeCaretAfterBlock}
        onMouseUp={normalizeCaretAfterBlock}
        onInput={handleEditorInput}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className="w-full h-full overflow-y-auto subtle-scrollbar outline-none text-sm leading-relaxed p-4 whitespace-pre-wrap break-words"
      />

      {editingBlock && (
        <div className="absolute inset-0 bg-black/45 flex items-center justify-center p-3 animate-[scalein_190ms_cubic-bezier(0.22,1,0.36,1)]">
          <div className="w-full h-full rounded-xl border border-zinc-700 bg-zinc-900 p-3 flex flex-col">
            <div className="text-xs text-zinc-400 mb-2 flex justify-between">
              <span>{editingBlock.toUpperCase()} BLOCK</span>
              <span>Tab to insert · Esc to cancel</span>
            </div>
            <textarea
              ref={blockInputRef}
              value={blockContent}
              onChange={(e) => setBlockContent(e.target.value)}
              onKeyDown={handleBlockKeyDown}
              className="w-full h-full bg-transparent outline-none text-sm resize-none leading-relaxed"
              placeholder={`Enter ${editingBlock} content...`}
            />
          </div>
        </div>
      )}

      <CommandPalette
        open={cmdOpen}
        setOpen={setCmdOpen}
        onCommand={(id) => {
          if (id === 'copyall') {
            navigator.clipboard.writeText(content || '');
            return;
          }

          if (id === 'exportmd') {
            const blob = new Blob([content || ''], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = 'quicknote.md';
            anchor.click();
            URL.revokeObjectURL(url);
            return;
          }

          if (id === 'importmd') {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.md,text/markdown,text/plain';
            input.onchange = async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const text = await file.text();
              setContent(text);
              requestAnimationFrame(() => focusEditorAtEnd());
            };
            input.click();
            return;
          }

          if (id === 'exit') {
            window.dispatchEvent(new CustomEvent('quicknote:go-menu'));
            return;
          }

          if (id === 'rename') {
            window.dispatchEvent(new CustomEvent('quicknote:open-rename'));
          }
        }}
      />
    </div>
  );
}
