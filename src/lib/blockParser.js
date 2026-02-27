export function parseBlockInput(text) {
  const regex = /(code|latex|link|video|image|file)\+block\{([\s\S]*?)\}$/;
  const match = text.match(regex);
  if (!match) return null;

  return {
    type: match[1],
    content: match[2]
  };
}

// Parse entire content and split into segments (text and blocks)
export function parseContent(content) {
  const blockRegex = /(code|latex|link|video|image|file)\+block\{([^\}]*)\}/g;
  const segments = [];
  let lastIndex = 0;
  let match;

  while ((match = blockRegex.exec(content)) !== null) {
    // Add text before the block
    if (match.index > lastIndex) {
      const textContent = content.slice(lastIndex, match.index);
      if (textContent.trim()) {
        segments.push({ type: 'text', content: textContent });
      }
    }

    // Add the block
    segments.push({
      type: match[1],
      content: match[2],
      blockIndex: segments.length
    });

    lastIndex = blockRegex.lastIndex;
  }

  // Add remaining text after last block
  if (lastIndex < content.length) {
    const textContent = content.slice(lastIndex);
    if (textContent.trim()) {
      segments.push({ type: 'text', content: textContent });
    }
  }

  return segments.length > 0 ? segments : [{ type: 'text', content: content }];
}

// Detect if user typed :blocktype pattern
export function detectBlockCommand(text) {
  const match = text.match(/:(code|latex|link|video|image|file)$/);
  return match ? match[1] : null;
}