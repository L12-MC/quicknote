import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { highlight } from '../lib/shiki';

export default function BlockRenderer({ block }) {
  if (block.type === 'text') {
    return (
      <div className="whitespace-pre-wrap text-sm">
        {block.content}
      </div>
    );
  }

  if (block.type === 'code') {
    const html = highlight(block.content);
    return (
      <div className="rounded-2xl p-4 bg-zinc-900/50">
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    );
  }

  if (block.type === 'latex') {
    return (
      <div
        className="text-lg p-4 bg-zinc-900/50 rounded-2xl"
        dangerouslySetInnerHTML={{
          __html: katex.renderToString(block.content, { throwOnError: false })
        }}
      />
    );
  }

  if (block.type === 'link') {
    return (
      <a href={block.content} className="underline text-blue-400 hover:text-blue-300 text-sm" target="_blank" rel="noopener noreferrer">
        {block.content}
      </a>
    );
  }

  if (block.type === 'image') {
    return (
      <div className="p-4 bg-zinc-900/50 rounded-2xl">
        <img src={block.content} className="rounded-xl w-full" alt="" />
      </div>
    );
  }

  if (block.type === 'video') {
    return (
      <div className="p-4 bg-zinc-900/50 rounded-2xl">
        <video src={block.content} controls className="rounded-xl w-full" />
      </div>
    );
  }

  if (block.type === 'file') {
    return (
      <div className="p-4 bg-zinc-900/50 rounded-2xl opacity-70 text-sm">
        📁 {block.content}
      </div>
    );
  }

  if (block.type === 'checklist') {
    const lines = String(block.content || '').split('\n').map((line) => line.trim()).filter(Boolean);
    const rows = lines.length > 0 ? lines : ['- [ ] checklist item'];

    return (
      <div className="p-4 bg-zinc-900/50 rounded-2xl text-sm space-y-2">
        {rows.map((line, index) => {
          const match = line.match(/^[-*]\s*\[( |x|X)\]\s*(.*)$/);
          const checked = Boolean(match && /x/i.test(match[1] || ''));
          const text = match ? (match[2] || '') : line;
          return (
            <label key={`${line}-${index}`} className="flex items-center gap-2 opacity-90">
              <input type="checkbox" disabled checked={checked} />
              <span>{text}</span>
            </label>
          );
        })}
      </div>
    );
  }

  return null;
}