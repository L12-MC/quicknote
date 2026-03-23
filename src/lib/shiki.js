// Import the browser build from node_modules - it's self-contained and
// doesn't depend on vscode-oniguruma's native bindings
import * as shiki from 'shiki/dist/index.browser.mjs';

let highlighter;
let highlighterReady = false;

function emitHighlighterReady() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('quicknote:highlighter-ready'));
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeLanguage(lang) {
  const value = String(lang || '').trim().toLowerCase();
  if (!value) return 'javascript';

  const aliases = {
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    sh: 'shellscript',
    shell: 'shellscript',
    bash: 'shellscript',
    yml: 'yaml'
  };

  return aliases[value] || value;
}

function resolveCodePayload(code, explicitLang) {
  let source = String(code || '');
  let lang = String(explicitLang || '').trim();

  if (lang) {
    return { code: source, lang: normalizeLanguage(lang) };
  }

  const fenced = source.match(/^```([^\n`]*)\n([\s\S]*?)\n?```\s*$/);
  if (fenced) {
    lang = fenced[1] || '';
    source = fenced[2] || '';
  }

  return { code: source, lang: normalizeLanguage(lang) };
}

export async function initHighlighter() {
  const { getHighlighter, setCDN } = shiki;
  
  // Set CDN root so Shiki can fetch onig.wasm and language definitions
  setCDN('/shiki/');
  
  // Only load languages we actually need.
  // Use canonical language IDs to avoid alias issues.
  highlighter = await getHighlighter({
    theme: 'github-dark',
    langs: ['javascript', 'typescript', 'python', 'markdown', 'jsx', 'tsx', 'shellscript', 'html', 'css', 'json', 'yaml', 'rust', 'java', 'go', 'c', 'cpp', 'sql']
  });

  highlighterReady = true;
  emitHighlighterReady();
}

export function highlight(code, lang = '') {
  const payload = resolveCodePayload(code, lang);

  if (!highlighter) {
    return `<pre><code>${escapeHtml(payload.code)}</code></pre>`;
  }

  try {
    return highlighter.codeToHtml(payload.code, { lang: payload.lang });
  } catch {
    return highlighter.codeToHtml(payload.code, { lang: 'javascript' });
  }
}

export function isHighlighterReady() {
  return highlighterReady;
}
