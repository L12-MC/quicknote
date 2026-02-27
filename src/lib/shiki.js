// Import the browser build from node_modules - it's self-contained and
// doesn't depend on vscode-oniguruma's native bindings
import * as shiki from 'shiki/dist/index.browser.mjs';

let highlighter;

export async function initHighlighter() {
  const { getHighlighter, setCDN } = shiki;
  
  // Set CDN root so Shiki can fetch onig.wasm and language definitions
  setCDN('/shiki/');
  
  // Only load languages we actually need.
  // Use canonical language IDs to avoid alias issues.
  highlighter = await getHighlighter({
    theme: 'github-dark',
    langs: ['javascript', 'typescript', 'python', 'markdown', 'jsx', 'tsx', 'shellscript', 'html', 'css', 'json', 'yaml', 'rust']
  });
}

export function highlight(code, lang = 'javascript') {
  if (!highlighter) return `<pre><code>${code}</code></pre>`;
  return highlighter.codeToHtml(code, { lang });
}
