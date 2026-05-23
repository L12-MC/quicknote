import React, { useEffect, useMemo, useRef, useState } from 'react';
import CommandPalette from './CommandPalette';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { highlight, isHighlighterReady } from '../lib/shiki';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { convertFileSrc } from '@tauri-apps/api/core';
import { marked } from 'marked';
import { copyAssetToNoteFolder } from '../lib/storage';

import { IoTrash } from 'react-icons/io5';

const BLOCK_REGEX = /(code|math|latex|graph|pie|link|video|image|file|checklist|separator|md|markdown)\+block\{((?:\\}|[^}])*)\}/g;
const BLOCK_NEWLINE_TOKEN = '__QN_BLOCK_NL__';

const HELP_COMMANDS = [
  { id: 'keybindings', label: 'keybindings', hint: 'Show keyboard shortcuts' },
  { id: 'cheats', label: 'cheats', hint: 'Show markdown and block keywords' },
  { id: 'credits', label: 'credits', hint: 'Show app credits and contributors' }
];

const CREDIT_COMMANDS = [
  { id: 'credit-author', label: 'Author', hint: 'Labros Karatasios' },
  { id: 'credit-tech', label: 'Built with', hint: 'React, Tauri, Vite' },
  { id: 'credit-libraries', label: 'Libraries', hint: 'Shiki, KaTeX, Marked' },
  { id: 'credit-version', label: 'Version', hint: '0.1.1' }
];

const KEYBINDING_COMMANDS = [
  { id: 'noop-ctrl-space', label: 'ctrl+space command palette' },
  { id: 'noop-escape', label: 'esc back or cancel' },
  { id: 'noop-j', label: 'j / arrowdown next item' },
  { id: 'noop-k', label: 'k / arrowup previous item' },
  { id: 'noop-enter', label: 'enter select item' },
  { id: 'noop-rename', label: 'f2 or ctrl+r rename note' },
  { id: 'noop-settings', label: 'ctrl+, settings' },
  { id: 'noop-menu', label: 'ctrl+shift+w notes menu' },
  { id: 'noop-close', label: 'ctrl+w close window' },
  { id: 'noop-block', label: 'tab insert block' }
];

const CHEAT_COMMANDS = [
  { id: 'cheat-h1', label: '# heading 1', insert: '# ' },
  { id: 'cheat-h2', label: '## heading 2', insert: '## ' },
  { id: 'cheat-bold', label: '**bold**', insert: '**bold**' },
  { id: 'cheat-italic', label: '_italic_', insert: '_italic_' },
  { id: 'cheat-list', label: '- list item', insert: '- ' },
  { id: 'cheat-ordered', label: '1. ordered item', insert: '1. ' },
  { id: 'cheat-wikilink', label: '[[note title]] note link', insert: '[[note title]]' },
  { id: 'cheat-code', label: ':code code block', insert: ':code ' },
  { id: 'cheat-math', label: ':math math block', insert: ':math ' },
  { id: 'cheat-graph', label: ':graph y=f(x) graph', insert: ':graph ' },
  { id: 'cheat-pie', label: ':pie Work:40, Life:35, Sleep:25', insert: ':pie Work:40, Life:35, Sleep:25' },
  { id: 'cheat-link', label: ':link link block', insert: ':link ' },
  { id: 'cheat-image', label: ':image image block', insert: ':image ' },
  { id: 'cheat-file', label: ':file file embed', insert: ':file ' },
  { id: 'cheat-checklist', label: ':checklist checklist block', insert: ':checklist ' },
  { id: 'cheat-md', label: ':md markdown block', insert: ':md ' },
  { id: 'cheat-separator', label: ':separator separator block', insert: ':separator ' },
  { id: 'cheat-quote', label: '> quote', insert: '> ' }
];

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
  if (/^(asset|file|data|blob):/i.test(value)) return value;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function asAssetSrc(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(https?|asset|file|data|blob):/i.test(raw)) return raw;
  return convertFileSrc(raw);
}

function getFileKind(data) {
  const mime = String(data?.mime || '').toLowerCase();
  const title = String(data?.title || data?.src || '').toLowerCase();
  const extension = title.includes('.') ? title.split('.').pop() : '';

  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(extension)) return 'image';
  if (mime.startsWith('video/') || ['mp4', 'webm', 'mov', 'mkv', 'avi'].includes(extension)) return 'video';
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'flac', 'ogg', 'm4a'].includes(extension)) return 'audio';
  if (['exe', 'msi', 'app', 'bat', 'cmd'].includes(extension)) return 'exe';
  if (['md', 'txt', 'pdf', 'doc', 'docx', 'rtf'].includes(extension)) return 'document';
  return 'file';
}

function createFileGlyph(kind) {
  const glyph = document.createElement('span');
  glyph.className = 'qn-file-embed-glyph';
  const labels = {
    image: 'IMG',
    video: 'VID',
    audio: 'AUD',
    exe: 'EXE',
    document: 'DOC',
    file: 'FILE'
  };
  glyph.textContent = labels[kind] || 'FILE';
  return glyph;
}

function parseBlockData(value, fallbackType = '') {
  const raw = String(value || '');
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // Old blocks are plain strings.
  }
  return { src: raw, title: raw.split(/[\\/]/).pop() || fallbackType || 'attachment' };
}

function formatBytes(size) {
  const value = Number(size || 0);
  if (!value) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function escapeSvgText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeMathExpression(value) {
  return String(value || '')
    .replace(/^y\s*=\s*/i, '')
    .replace(/\^/g, '**')
    .replace(/\b(sin|cos|tan|sqrt|abs|log|exp|pow|min|max|floor|ceil|round|PI|E)\b/g, 'Math.$1');
}

function evaluateGraphExpression(expression, x) {
  const normalized = normalizeMathExpression(expression);
  if (!/^[\d\s+\-*/().,xMathPIEabscdefgilmnopqrstuw]+$/.test(normalized)) return null;
  try {
    const result = Function('x', `"use strict"; return (${normalized});`)(x);
    return Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

function createGraphSvg(value) {
  const width = 320;
  const height = 150;
  const padding = 10;
  const points = [];

  for (let i = 0; i <= 80; i += 1) {
    const x = -10 + (20 * i) / 80;
    const y = evaluateGraphExpression(value, x);
    if (y == null) continue;
    points.push({ x, y });
  }

  const valid = points.filter((point) => Math.abs(point.y) < 1000);
  const yValues = valid.map((point) => point.y);
  const minY = Math.min(-1, ...yValues);
  const maxY = Math.max(1, ...yValues);
  const spanY = maxY - minY || 1;
  const mapX = (x) => padding + ((x + 10) / 20) * (width - padding * 2);
  const mapY = (y) => height - padding - ((y - minY) / spanY) * (height - padding * 2);
  const polyline = valid.map((point) => `${mapX(point.x).toFixed(1)},${mapY(point.y).toFixed(1)}`).join(' ');
  const zeroY = mapY(0);
  const zeroX = mapX(0);

  return `
    <svg class="qn-chart-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="graph">
      <rect width="${width}" height="${height}" rx="8" fill="#18181b"/>
      <line x1="${padding}" y1="${zeroY}" x2="${width - padding}" y2="${zeroY}" stroke="#3f3f46" stroke-width="1"/>
      <line x1="${zeroX}" y1="${padding}" x2="${zeroX}" y2="${height - padding}" stroke="#3f3f46" stroke-width="1"/>
      <polyline fill="none" stroke="#60a5fa" stroke-width="2" points="${polyline}"/>
      <text x="12" y="18" fill="#a1a1aa" font-size="11">y=${String(value || '').replace(/^y\s*=\s*/i, '')}</text>
    </svg>
  `;
}

function createPieSvg(value) {
  const items = String(value || '')
    .split(/[,;\n]/)
    .map((item, index) => {
      const [label, rawAmount] = item.includes(':') ? item.split(':') : [`Slice ${index + 1}`, item];
      return { label: label.trim(), amount: Number(rawAmount) };
    })
    .filter((item) => item.label && Number.isFinite(item.amount) && item.amount > 0);
  const slices = items.length ? items : [{ label: 'A', amount: 50 }, { label: 'B', amount: 50 }];
  const total = slices.reduce((sum, item) => sum + item.amount, 0);
  const colors = ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa'];
  const centerX = 54;
  const centerY = 54;
  const radius = 48;
  let currentAngle = -90;
  const pointOnCircle = (angle) => {
    const radians = (Math.PI / 180) * angle;
    return {
      x: centerX + radius * Math.cos(radians),
      y: centerY + radius * Math.sin(radians)
    };
  };
  const paths = slices.map((item, index) => {
    const sweep = (item.amount / total) * 360;
    const start = pointOnCircle(currentAngle);
    const end = pointOnCircle(currentAngle + sweep);
    const largeArc = sweep > 180 ? 1 : 0;
    const path = sweep >= 359.99
      ? `<circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="${colors[index % colors.length]}"/>`
      : `<path d="M ${centerX} ${centerY} L ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)} Z" fill="${colors[index % colors.length]}"/>`;
    currentAngle += sweep;
    return path;
  }).join('');
  const labels = slices.slice(0, 5).map((item, index) => {
    const percent = Math.round((item.amount / total) * 100);
    return `
      <rect x="120" y="${17 + index * 17}" width="8" height="8" rx="2" fill="${colors[index % colors.length]}"/>
      <text x="134" y="${26 + index * 17}" fill="#d4d4d8" font-size="11">${escapeSvgText(item.label)}: ${percent}%</text>
    `;
  }).join('');

  return `
    <svg class="qn-chart-svg" viewBox="0 0 280 108" width="320" height="124" role="img" aria-label="pie chart">
      <rect width="280" height="108" rx="8" fill="#18181b"/>
      ${paths}
      <circle cx="${centerX}" cy="${centerY}" r="16" fill="#18181b"/>
      ${labels}
    </svg>
  `;
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

function renderMarkdownWithHighlighting(markdownText) {
  const renderer = new marked.Renderer();

  renderer.code = (...args) => {
    let code = '';
    let lang = '';

    const [first, second] = args;
    if (first && typeof first === 'object') {
      code = first.text || '';
      lang = first.lang || '';
    } else {
      code = first || '';
      lang = second || '';
    }

    return highlight(code, lang || undefined);
  };

  return marked.parse(markdownText || '', { gfm: true, breaks: true, renderer });
}

function createBlockChip(type, value) {
  const chip = document.createElement('span');
  const normalizedType = type === 'latex' ? 'math' : type;
  chip.setAttribute('data-block-type', normalizedType);
  chip.setAttribute('data-block-content', value);
  chip.setAttribute('contenteditable', 'false');
  chip.className = 'inline-flex items-center align-middle max-w-full px-2 py-0.5 mx-0.5 rounded-md border border-zinc-800 bg-zinc-800 text-zinc-100 text-xs whitespace-nowrap overflow-hidden';
  chip.addEventListener('dblclick', (event) => {
    event.preventDefault();
    event.stopPropagation();
    window.dispatchEvent(new CustomEvent('quicknote:edit-block', { detail: { element: chip } }));
  });

  const preview = value.replace(/\s+/g, ' ').trim().slice(0, 56);

  if (type === 'code') {
    chip.className = 'inline-flex items-center align-middle max-w-full mx-0.5 rounded-md border border-zinc-800 bg-zinc-900 text-zinc-100 text-xs overflow-hidden';
    const rendered = document.createElement('span');
    rendered.className = 'max-w-[420px] block';
    rendered.innerHTML = highlight(value || '');
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

  if (normalizedType === 'math') {
    chip.className = 'inline-flex items-center align-middle max-w-full px-2 py-1 mx-0.5 rounded-md border border-zinc-800 bg-zinc-900 text-zinc-100 text-xs overflow-hidden';
    const latexWrap = document.createElement('span');
    latexWrap.className = 'max-w-[420px] overflow-hidden';
    latexWrap.innerHTML = katex.renderToString(value || '', { throwOnError: false });
    chip.appendChild(latexWrap);
    return chip;
  }

  if (normalizedType === 'graph') {
    chip.className = 'qn-chart-chip inline-flex items-center align-top max-w-full mx-0.5 rounded-md border border-zinc-800 bg-zinc-900 text-zinc-100 text-xs overflow-hidden';
    const graphWrap = document.createElement('span');
    graphWrap.className = 'qn-chart-wrap block max-w-[420px] overflow-hidden';
    graphWrap.innerHTML = createGraphSvg(value || 'x');
    chip.appendChild(graphWrap);
    return chip;
  }

  if (normalizedType === 'pie') {
    chip.className = 'qn-chart-chip inline-flex items-center align-top max-w-full mx-0.5 rounded-md border border-zinc-800 bg-zinc-900 text-zinc-100 text-xs overflow-hidden';
    const pieWrap = document.createElement('span');
    pieWrap.className = 'qn-chart-wrap block max-w-[420px] overflow-hidden';
    pieWrap.innerHTML = createPieSvg(value || 'A:50, B:50');
    chip.appendChild(pieWrap);
    return chip;
  }

  if (normalizedType === 'image') {
    const data = parseBlockData(value, 'image');
    const src = data.src || value;
    chip.className = 'inline-flex items-center align-middle max-w-full mx-0.5 rounded-md border border-zinc-800 bg-zinc-900 text-zinc-100 text-xs overflow-hidden';
    const img = document.createElement('img');
    img.src = asAssetSrc(src);
    img.alt = data.title || preview || 'image';
    img.className = 'max-w-[420px] max-h-[260px] object-contain';
    img.onerror = () => {
      chip.textContent = `image: ${data.title || preview || 'missing source'}`;
    };
    chip.appendChild(img);
    return chip;
  }

  if (type === 'video') {
    chip.textContent = `🎬 ${preview || 'video'}`;
    return chip;
  }

  if (normalizedType === 'file') {
    const data = parseBlockData(value, 'file');
    const href = asAssetSrc(data.src || value);
    const kind = getFileKind(data);
    chip.className = 'qn-file-embed inline-flex items-center align-middle max-w-full mx-0.5 text-zinc-100 text-xs overflow-hidden';
    const wrap = document.createElement('span');
    wrap.className = 'qn-file-embed-inner';

    const previewBox = document.createElement('span');
    previewBox.className = `qn-file-embed-preview qn-file-kind-${kind}`;
    if (kind === 'image') {
      const image = document.createElement('img');
      image.src = href;
      image.alt = data.title || 'image file';
      image.loading = 'lazy';
      image.onerror = () => {
        previewBox.innerHTML = '';
        previewBox.appendChild(createFileGlyph(kind));
      };
      previewBox.appendChild(image);
    } else if (kind === 'video') {
      const video = document.createElement('video');
      video.src = href;
      video.muted = true;
      video.preload = 'metadata';
      video.playsInline = true;
      video.onerror = () => {
        previewBox.innerHTML = '';
        previewBox.appendChild(createFileGlyph(kind));
      };
      previewBox.appendChild(video);
    } else {
      previewBox.appendChild(createFileGlyph(kind));
    }

    const body = document.createElement('span');
    body.className = 'qn-file-embed-body';
    const title = document.createElement('span');
    title.className = 'qn-file-embed-title';
    title.textContent = data.title || preview || 'file';
    const meta = document.createElement('span');
    meta.className = 'qn-file-embed-meta';
    meta.textContent = formatBytes(data.size) || kind.toUpperCase();
    const actions = document.createElement('span');
    actions.className = 'qn-file-embed-actions';
    const open = document.createElement('a');
    open.href = href;
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    open.className = 'qn-file-embed-action';
    open.textContent = 'open';
    const download = document.createElement('a');
    download.href = href;
    download.download = data.title || 'download';
    download.className = 'qn-file-embed-action';
    download.textContent = 'download';

    actions.appendChild(open);
    actions.appendChild(download);
    body.appendChild(title);
    body.appendChild(meta);
    body.appendChild(actions);
    wrap.appendChild(previewBox);
    wrap.appendChild(body);
    chip.appendChild(wrap);
    return chip;
  }

  if (type === 'checklist') {
    chip.className = 'inline-flex items-center align-middle max-w-full mx-0.5 rounded-md border border-zinc-800 bg-zinc-900 text-zinc-100 text-xs overflow-hidden';
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
    line.className = 'block w-full border-t border-zinc-800 opacity-70';
    chip.appendChild(line);
    return chip;
  }

  if (type === 'md' || type === 'markdown') {
    chip.className = 'inline-flex items-center align-middle max-w-full mx-0.5 rounded-md border border-zinc-800 bg-zinc-900 text-zinc-100 text-xs overflow-hidden';
    const mdWrap = document.createElement('span');
    mdWrap.className = 'max-w-[480px] block p-2';
    mdWrap.innerHTML = renderMarkdownWithHighlighting(value || '');
    mdWrap.querySelectorAll('h1,h2,h3,h4,h5,h6,p,ul,ol,table,pre,blockquote').forEach((node) => {
      node.style.margin = '0 0 6px 0';
    });
    mdWrap.querySelectorAll('pre code').forEach((node) => {
      node.style.whiteSpace = 'pre';
    });
    mdWrap.querySelectorAll('pre.shiki').forEach((node) => {
      node.style.borderRadius = '8px';
      node.style.padding = '8px 10px';
      node.style.overflowX = 'auto';
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
    const inlineRegex = /\[\[([^\]\n]+)\]\]|(\*\*|__)([^\n]+?)\2|(?<!\*)\*([^*\n]+)\*(?!\*)|(?<!_)_([^_\n]+)_(?!_)/g;
    let cursor = 0;
    let token;

    while ((token = inlineRegex.exec(source)) !== null) {
      if (token.index > cursor) {
        inlineNodes.push(document.createTextNode(source.slice(cursor, token.index)));
      }

      if (token[1] != null) {
        const noteLink = document.createElement('button');
        noteLink.type = 'button';
        noteLink.setAttribute('data-note-link', token[1]);
        noteLink.setAttribute('contenteditable', 'false');
        noteLink.className = 'text-blue-400 underline hover:text-blue-300';
        noteLink.textContent = `[[${token[1]}]]`;
        noteLink.addEventListener('click', () => {
          window.dispatchEvent(new CustomEvent('quicknote:open-note-link', { detail: token[1] }));
        });
        inlineNodes.push(noteLink);
      } else if (token[3] != null) {
        const strong = document.createElement('strong');
        strong.appendChild(document.createTextNode(token[3] || ''));
        inlineNodes.push(strong);
      } else {
        const em = document.createElement('em');
        em.appendChild(document.createTextNode(token[4] || token[5] || ''));
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
    const quoteMatch = line.match(/^\s*>\s?(.*)$/);

    if (quoteMatch) {
      const quote = document.createElement('blockquote');
      quote.className = 'border-l border-zinc-700 pl-3 py-1 my-1 text-zinc-300 italic bg-zinc-900/40 rounded-r-md';

      while (index < lines.length) {
        const quoteLine = lines[index] || '';
        const match = quoteLine.match(/^\s*>\s?(.*)$/);
        if (!match) break;

        const block = document.createElement('div');
        const inline = parseInlineNodes(match[1]);
        if (inline.length === 0) {
          block.appendChild(document.createElement('br'));
        } else {
          inline.forEach((node) => block.appendChild(node));
        }
        quote.appendChild(block);
        index += 1;
      }

      nodes.push(quote);
      continue;
    }

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

    if (el.tagName === 'BLOCKQUOTE') {
      el.childNodes.forEach((child) => {
        result += '> ';
        child.childNodes.forEach((grandChild) => walk(grandChild, context));
        if (!result.endsWith('\n')) result += '\n';
      });
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

function PieEditor({ value, onChange, onCommit }) {
  const [items, setItems] = useState(() => {
    const raw = String(value || '');
    if (!raw) return [{ label: '', amount: '' }];
    return raw.split(/[,;\n]/).map((item) => {
      const [label, amount] = item.includes(':') ? item.split(':') : ['', item];
      return { label: label.trim(), amount: amount.trim() };
    });
  });

  const containerRef = useRef(null);
  const normalizeAmount = (amount) => {
    const parsed = Number(String(amount ?? '').replace(',', '.'));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };

  const serializeItems = (nextItems) =>
    nextItems
      .map((i) => `${String(i.label || 'Slice').trim()}:${String(i.amount || 0).trim() || 0}`)
      .join(', ');

  const serializeAmount = (amount) => {
    const rounded = Math.round(Number(amount || 0) * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
  };

  const balanceItems = (nextItems, changedIndex = null) => {
    const cleanItems = nextItems.map((item) => ({
      label: item.label,
      amount: String(item.amount ?? '').trim()
    }));

    if (changedIndex != null) {
      const othersTotal = cleanItems.reduce((sum, item, index) => {
        if (index === changedIndex) return sum;
        return sum + normalizeAmount(item.amount);
      }, 0);
      const maxForChanged = Math.max(0, 100 - othersTotal);
      const requested = normalizeAmount(cleanItems[changedIndex]?.amount);
      if (requested > maxForChanged) {
        cleanItems[changedIndex] = {
          ...cleanItems[changedIndex],
          amount: serializeAmount(maxForChanged)
        };
      }
      return cleanItems;
    }

    const total = cleanItems.reduce((sum, item) => sum + normalizeAmount(item.amount), 0);
    if (total <= 100) return cleanItems;

    const equal = serializeAmount(100 / cleanItems.length);
    return cleanItems.map((item) => ({ ...item, amount: equal }));
  };

  const focusInput = (rowIndex, field = 'label') => {
    const inputIndex = rowIndex * 2 + (field === 'label' ? 0 : 1);
    requestAnimationFrame(() => {
      containerRef.current?.querySelectorAll('input')[inputIndex]?.focus();
    });
  };

  useEffect(() => {
    focusInput(0, 'label');
  }, []);

  const updateItem = (index, field, val) => {
    let next = [...items];
    next[index] = { ...next[index], [field]: val };
    if (field === 'amount') {
      next = balanceItems(next, index);
    }
    setItems(next);
    onChange(serializeItems(next));
  };

  const addItem = (focus = true) => {
    const total = items.reduce((sum, item) => sum + normalizeAmount(item.amount), 0);
    let next = [...items, { label: '', amount: total < 100 ? serializeAmount(100 - total) : '' }];
    if (total >= 100) {
      const equal = serializeAmount(100 / next.length);
      next = next.map((item) => ({ ...item, amount: equal }));
    } else {
      next = balanceItems(next);
    }
    setItems(next);
    onChange(serializeItems(next));
    if (focus) focusInput(next.length - 1, 'label');
  };

  const removeItem = (index) => {
    if (items.length <= 1) {
      setItems([{ label: '', amount: '' }]);
      onChange('');
      return;
    }
    const next = items.filter((_, i) => i !== index);
    setItems(next);
    onChange(serializeItems(next));
    focusInput(Math.max(0, index - 1), 'label');
  };

  const handleKeyDown = (e, index, field) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      onCommit();
      return;
    }

    const isEmptyVimNav = (e.key === 'j' || e.key === 'k') && !e.ctrlKey && !e.metaKey && !e.altKey && !String(e.currentTarget.value || '').trim();

    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'j') || (isEmptyVimNav && e.key === 'j')) {
      e.preventDefault();
      const nextIndex = index + 1;
      if (nextIndex < items.length) {
        focusInput(nextIndex, field);
      } else {
        addItem(true);
      }
      return;
    }

    if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'k') || (isEmptyVimNav && e.key === 'k')) {
      e.preventDefault();
      if (index > 0) {
        focusInput(index - 1, field);
      }
      return;
    }

    if (e.key === 'ArrowRight' && field === 'label') {
      const input = e.target;
      if (input.selectionStart === input.value.length) {
        e.preventDefault();
        focusInput(index, 'amount');
      }
    }

    if (e.key === 'ArrowLeft' && field === 'amount') {
      const input = e.target;
      if (input.selectionStart === 0) {
        e.preventDefault();
        focusInput(index, 'label');
      }
    }

    if (e.key === 'ArrowRight' && field === 'amount') {
      const input = e.target;
      if (input.selectionStart === input.value.length) {
        e.preventDefault();
        containerRef.current?.querySelectorAll('button[data-pie-delete]')[index]?.focus();
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (index === items.length - 1) {
        addItem(true);
      } else {
        focusInput(index + 1, field);
      }
    }
  };

  return (
    <div ref={containerRef} className="flex flex-col gap-2 overflow-y-auto subtle-scrollbar max-h-[60vh] pr-2">
      {items.map((item, index) => (
        <div key={index} className="qn-pie-row animate-[fadein_150ms_linear]">
          <input
            className="qn-input qn-input-small qn-pie-label"
            placeholder={`Slice ${index + 1}`}
            value={item.label}
            onKeyDown={(e) => handleKeyDown(e, index, 'label')}
            onChange={(e) => updateItem(index, 'label', e.target.value)}
          />
          <input
            className="qn-input qn-input-small qn-pie-value"
            placeholder="%"
            type="text"
            inputMode="decimal"
            value={item.amount}
            onKeyDown={(e) => handleKeyDown(e, index, 'amount')}
            onChange={(e) => updateItem(index, 'amount', e.target.value)}
          />
          <button
            type="button"
            data-pie-delete
            aria-label={`Delete ${item.label || `slice ${index + 1}`}`}
            className="qn-icon-button qn-icon-button-small qn-pie-delete text-zinc-500 hover:text-red-400 border-none bg-transparent hover:bg-zinc-800"
            onClick={() => removeItem(index)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                removeItem(index);
                return;
              }
              if (event.key === 'ArrowLeft' || event.key === 'h') {
                event.preventDefault();
                focusInput(index, 'amount');
                return;
              }
              if (event.key === 'ArrowDown' || event.key === 'j') {
                event.preventDefault();
                focusInput(Math.min(items.length - 1, index + 1), 'label');
              }
              if (event.key === 'ArrowUp' || event.key === 'k') {
                event.preventDefault();
                focusInput(Math.max(0, index - 1), 'label');
              }
            }}
          >
            <IoTrash size={14} />
          </button>
        </div>
      ))}
      <div className="flex justify-between items-center mt-2 px-1">
        <button
          type="button"
          className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
          onClick={() => addItem(true)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp' || event.key === 'k') {
              event.preventDefault();
              focusInput(items.length - 1, 'label');
            }
            if (event.key === 'Tab') {
              event.preventDefault();
              onCommit();
            }
          }}
        >
          + Add item (or press Enter)
        </button>
        <span className="text-[10px] text-zinc-600">Arrows/Ctrl+JK to navigate · Tab to insert</span>
      </div>
    </div>
  );
}

export default function Editor({ content, setContent, currentNote }) {
  const [cmdOpen, setCmdOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpDetail, setHelpDetail] = useState(null);
  const [editingBlock, setEditingBlock] = useState(null);
  const [editingBlockElement, setEditingBlockElement] = useState(null);
  const [blockContent, setBlockContent] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const editorRef = useRef(null);
  const blockInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const markerRef = useRef(null);
  const initializedRef = useRef(false);
  const forceNextRenderRef = useRef(false);
  const [highlighterRenderTick, setHighlighterRenderTick] = useState(0);

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

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    window.addEventListener("quicknote:focus-editor", focusEditorAtEnd);
    return () => {
      window.removeEventListener("quicknote:focus-editor", focusEditorAtEnd);
    };
  }, []);

  useEffect(() => {
    const handleEditBlock = (event) => {
      const element = event.detail?.element;
      if (!element?.getAttribute) return;
      const type = element.getAttribute('data-block-type');
      if (!type) return;
      setEditingBlock(type);
      setEditingBlockElement(element);
      setBlockContent(element.getAttribute('data-block-content') || '');
    };

    window.addEventListener('quicknote:edit-block', handleEditBlock);
    return () => {
      window.removeEventListener('quicknote:edit-block', handleEditBlock);
    };
  }, []);

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
    const onHighlighterReady = () => {
      forceNextRenderRef.current = true;
      setHighlighterRenderTick((tick) => tick + 1);
    };

    window.addEventListener('quicknote:highlighter-ready', onHighlighterReady);

    if (isHighlighterReady()) {
      onHighlighterReady();
    }

    return () => {
      window.removeEventListener('quicknote:highlighter-ready', onHighlighterReady);
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const current = serializeEditor(editor);
    if (!forceNextRenderRef.current && initializedRef.current && current === content) {
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

    forceNextRenderRef.current = false;
    initializedRef.current = true;
  }, [content, highlighterRenderTick]);

  useEffect(() => {
    if (editingBlock && blockInputRef.current) {
      blockInputRef.current.focus();
      window.dispatchEvent(new CustomEvent('quicknote:hide-cursor'));
    } else if (!editingBlock) {
      window.dispatchEvent(new CustomEvent('quicknote:show-cursor'));
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

  const insertTextAtCaret = (text) => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const activeRange = range && editor.contains(range.startContainer) ? range : document.createRange();

    if (!range || !editor.contains(range.startContainer)) {
      activeRange.selectNodeContents(editor);
      activeRange.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(activeRange);
    }

    activeRange.deleteContents();
    const textNode = document.createTextNode(text);
    activeRange.insertNode(textNode);
    setCaretInTextNode(textNode, text.length);
    syncContent();
  };

  const commitBlock = (nextContent = blockContent) => {
    const editor = editorRef.current;
    if (!editor || !editingBlock) return;

    const chip = createBlockChip(editingBlock, nextContent);
    if (editingBlockElement?.parentNode) {
      editingBlockElement.replaceWith(chip);
    } else if (markerRef.current?.parentNode) {
      markerRef.current.replaceWith(chip);
    } else {
      editor.appendChild(chip);
    }

    markerRef.current = null;
    setEditingBlock(null);
    setEditingBlockElement(null);
    setBlockContent('');
    syncContent();

    requestAnimationFrame(() => {
      editor.focus();
      setCaretAfterNode(chip);
    });
  };

  const handlePickedAsset = async (file, type) => {
    if (!file) return;
    try {
      const copied = await copyAssetToNoteFolder(currentNote, file);
      const payload = JSON.stringify({
        ...copied,
        kind: type
      });
      setBlockContent(payload);
      requestAnimationFrame(() => blockInputRef.current?.focus());
    } catch (error) {
      console.error('Failed to copy asset into note folder:', error);
      window.alert('Could not copy that file into the note folder.');
    }
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
    const match = before.match(/:(code|math|graph|pie|link|image|video|file|checklist|md|markdown)$/);
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
    setEditingBlock(type === 'latex' ? 'math' : type);
    setEditingBlockElement(null);
    setBlockContent('');
    syncContent();
  };

  const closeWindow = async () => {
    const appWindow = getCurrentWindow();
    await appWindow.close();
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

      const isMarkdownTrigger = /^(#{1,6}|[-*+]|\d+\.|>)$/.test(preText);
      if (!isMarkdownTrigger) return;

      if (!blockEl) {
        blockEl = ensureBlockElementAtCaret(editor, selection);
        preText = getTextBeforeCaretInBlock(selection, blockEl).trim();
      }

      const headingMatch = preText.match(/^#{1,6}$/);
      const unorderedMatch = preText.match(/^[-*+]$/);
      const orderedMatch = preText.match(/^\d+\.$/);
      const quoteMatch = preText.match(/^>$/);

      if ((headingMatch || unorderedMatch || orderedMatch || quoteMatch) && blockEl) {
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
        } else if (quoteMatch) {
          const remaining = raw.replace(/^\s*>\s?/, '');
          const quote = document.createElement('blockquote');
          quote.className = 'border-l border-zinc-700 pl-3 py-1 my-1 text-zinc-300 italic bg-zinc-900/40 rounded-r-md';
          const line = document.createElement('div');
          if (remaining) {
            line.textContent = remaining;
          } else {
            line.appendChild(document.createElement('br'));
          }
          quote.appendChild(line);
          blockEl.replaceWith(quote);
          setCaretAtStart(line);
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

        const match = textBefore.match(/:(code|math|graph|pie|link|image|video|file|checklist|md|markdown)$/);
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
      if (editingBlock !== 'pie') {
        e.preventDefault();
        commitBlock();
      }
      return;
    }

    if (e.key === 'Escape') {
      if (editingBlock) {
        e.preventDefault();
        const marker = markerRef.current;
        if (!editingBlockElement && marker && marker.parentNode) marker.remove();
        markerRef.current = null;
        setEditingBlock(null);
        setEditingBlockElement(null);
        setBlockContent('');
        syncContent();
        requestAnimationFrame(() => editorRef.current?.focus());
      } else if (!cmdOpen) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('quicknote:go-menu'));
      }
      return;
    }

    if (editingBlock === 'math' || editingBlock === 'graph') {
       if (e.key === 'Enter') {
         e.preventDefault();
         commitBlock();
         return;
       }
    }

    if (editingBlock === 'pie') return; // Handled by PieEditor internally

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
    <div className="qn-editor h-full relative overflow-hidden">
        <div className={`absolute top-6 left-6 text-zinc-500 text-sm pointer-events-none transition-all duration-250 ${placeholderVisible ? 'opacity-100' : 'opacity-0'}`}>
          Write your note...
        </div>
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
        className="qn-editor-surface w-full h-full overflow-y-auto subtle-scrollbar outline-none text-sm leading-relaxed p-6 whitespace-pre-wrap break-words"
      />

      {editingBlock && (
        <div className='fixed inset-0 flex items-center justify-center p-4 animate-[fadein_190ms_linear] bg-black/50 z-50'>
        <div className="absolute inset-0 flex items-center justify-center p-6 animate-[scalein_320ms_cubic-bezier(0.16,1,0.3,1)]">
          <div className="qn-dialog w-full h-full border border-zinc-800 bg-zinc-900 p-6 flex flex-col">
            <div className="text-xs text-zinc-400/70 mb-2 flex justify-between">
              <span>{editingBlock.toUpperCase()} BLOCK</span>
              <span>{editingBlock === 'math' || editingBlock === 'graph' ? 'Enter to insert' : 'Tab to insert'} · Esc to cancel</span>
            </div>
            {(editingBlock === 'image' || editingBlock === 'file') && (
              <div className="flex items-center gap-2 mb-3">
                {editingBlock === 'image' && (
                  <button
                    type="button"
                    className="qn-button text-xs"
                    onClick={() => imageInputRef.current?.click()}
                  >
                    Pick image
                  </button>
                )}
                {editingBlock === 'file' && (
                  <button
                    type="button"
                    className="qn-button text-xs"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Pick file
                  </button>
                )}
                <span className="text-xs text-zinc-500">
                  {editingBlock === 'image' ? 'Type a URL or pick a local image.' : 'Pick a local file to copy beside this note.'}
                </span>
              </div>
            )}
            
            {editingBlock === 'pie' ? (
              <PieEditor value={blockContent} onChange={setBlockContent} onCommit={commitBlock} />
            ) : (
              <textarea
                ref={blockInputRef}
                value={blockContent}
                onChange={(e) => setBlockContent(e.target.value)}
                onKeyDown={handleBlockKeyDown}
                className={`qn-block-textarea w-full h-full bg-transparent outline-none text-sm resize-none leading-relaxed ${
                  (editingBlock === 'math' || editingBlock === 'graph') ? 'max-h-[32px]' : ''
                }`}
                placeholder={`Enter ${editingBlock} content...`}
              />
            )}
            
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                handlePickedAsset(file, 'image');
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                handlePickedAsset(file, 'file');
              }}
            />
          </div>
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

          if (id === 'settings') {
            window.dispatchEvent(new CustomEvent('quicknote:open-settings'));
            return;
          }

          if (id === 'rename') {
            window.dispatchEvent(new CustomEvent('quicknote:open-rename'));
            return;
          }

          if (id === 'help') {
            setTimeout(() => setHelpOpen(true), 0);
          }
        }}
      />
      <CommandPalette
        open={helpOpen}
        setOpen={setHelpOpen}
        commands={HELP_COMMANDS}
        title="Help"
        onCommand={(id) => {
          if (id === 'keybindings' || id === 'cheats' || id === 'credits') {
            setTimeout(() => setHelpDetail(id), 0);
          }
        }}
      />
      <CommandPalette
        open={Boolean(helpDetail)}
        setOpen={(nextOpen) => {
          if (!nextOpen) setHelpDetail(null);
        }}
        commands={
          helpDetail === 'keybindings' ? KEYBINDING_COMMANDS : 
          helpDetail === 'cheats' ? CHEAT_COMMANDS : 
          CREDIT_COMMANDS
        }
        title={
          helpDetail === 'keybindings' ? 'Keybindings' : 
          helpDetail === 'cheats' ? 'Cheats' : 
          'Credits'
        }
        onCommand={(id) => {
          const cheat = CHEAT_COMMANDS.find((command) => command.id === id);
          if (cheat?.insert) {
            insertTextAtCaret(cheat.insert);
          }
        }}
      />
    </div>
  );
}
