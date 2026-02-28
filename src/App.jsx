import React, { useEffect, useRef, useState } from 'react';
import Editor from './components/Editor';
import CommandPalette from './components/CommandPalette';
import { initHighlighter } from './lib/shiki';
import { loadNotesFromDisk, saveNotesToDisk } from './lib/storage';

const BUILTIN_THEME_OPTIONS = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'soulless', label: 'Soulless' },
  { id: 'hacker', label: 'Hacker' },
  { id: 'nightsky', label: 'NightSky' }
];

const CUSTOM_THEME_STORAGE_KEY = 'quicknote-custom-theme';
const CUSTOM_THEME_KEYS = ['bg', 'surface', 'surface2', 'text', 'textSoft', 'muted', 'border', 'accent', 'accentSoft'];

const MENU_COMMANDS = [
  { id: 'settheme', label: 'settheme', hint: 'Choose app theme' },
  { id: 'newnote', label: 'newnote', hint: 'Create a new note' },
  { id: 'deleteall', label: 'deleteall', hint: 'Delete all notes' }
];

export default function App() {
  const [notes, setNotes] = useState([{ id: 'note-1', title: 'Untitled Note', content: '' }]);
  const [activeNoteId, setActiveNoteId] = useState('note-1');
  const [view, setView] = useState('editor');
  const [isReady, setIsReady] = useState(false);
  const [hasLoadedNotes, setHasLoadedNotes] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [menuCmdOpen, setMenuCmdOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('quicknote-theme') || 'dark');
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [customTheme, setCustomTheme] = useState(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_THEME_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.vars) return null;
      return parsed;
    } catch {
      return null;
    }
  });

  const renameInputRef = useRef(null);
  const themeInputRef = useRef(null);

  const themeOptions = customTheme
    ? [...BUILTIN_THEME_OPTIONS, { id: 'custom', label: customTheme.name || 'Custom' }]
    : BUILTIN_THEME_OPTIONS;
  const themeCommands = [
    ...themeOptions.map((option) => ({
      id: `theme:${option.id}`,
      label: option.label.toLowerCase(),
      hint: theme === option.id ? 'Current theme' : 'Apply theme'
    })),
    { id: 'theme:load-custom', label: 'load-custom', hint: 'Load custom theme file' }
  ];

  const applyCustomThemeVars = (vars) => {
    const root = document.documentElement;
    CUSTOM_THEME_KEYS.forEach((key) => {
      const cssVar = `--qn-${key === 'surface2' ? 'surface-2' : key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}`;
      const value = vars?.[key];
      if (value) {
        root.style.setProperty(cssVar, value);
      } else {
        root.style.removeProperty(cssVar);
      }
    });
  };

  const parseThemeObject = (objectValue, fallbackName = 'Custom') => {
    if (!objectValue || typeof objectValue !== 'object') return null;

    const vars = {
      bg: objectValue.bg || objectValue.background || objectValue['--qn-bg'],
      surface: objectValue.surface || objectValue['--qn-surface'],
      surface2: objectValue.surface2 || objectValue.surface_2 || objectValue['--qn-surface-2'],
      text: objectValue.text || objectValue['--qn-text'],
      textSoft: objectValue.textSoft || objectValue.text_soft || objectValue['--qn-text-soft'],
      muted: objectValue.muted || objectValue['--qn-muted'],
      border: objectValue.border || objectValue['--qn-border'],
      accent: objectValue.accent || objectValue['--qn-accent'],
      accentSoft: objectValue.accentSoft || objectValue.accent_soft || objectValue['--qn-accent-soft']
    };

    if (!vars.bg || !vars.surface || !vars.text || !vars.accent) {
      return null;
    }

    return {
      name: objectValue.name || fallbackName,
      vars
    };
  };

  const parseCustomThemeFromText = (fileText, fileName = 'Custom') => {
    const raw = String(fileText || '').trim();
    if (!raw) return null;

    try {
      const parsedJson = JSON.parse(raw);
      const result = parseThemeObject(parsedJson, fileName);
      if (result) return result;
    } catch {
      // Try markdown fenced JSON or first JSON object below.
    }

    const fencedJsonMatch = raw.match(/```json\s*([\s\S]*?)```/i);
    if (fencedJsonMatch?.[1]) {
      try {
        const parsedFenced = JSON.parse(fencedJsonMatch[1].trim());
        const result = parseThemeObject(parsedFenced, fileName);
        if (result) return result;
      } catch {
        // ignore and continue
      }
    }

    const objectMatch = raw.match(/\{[\s\S]*\}/);
    if (objectMatch?.[0]) {
      try {
        const parsedObject = JSON.parse(objectMatch[0]);
        const result = parseThemeObject(parsedObject, fileName);
        if (result) return result;
      } catch {
        // ignore
      }
    }

    return null;
  };

  const activeNote = notes.find((note) => note.id === activeNoteId) || notes[0];

  const shouldPersistNote = (note) => {
    const title = String(note?.title || '').trim();
    const rawContent = String(note?.content || '');
    const plainContent = rawContent.replace(/<[^>]*>/g, '').trim();
    const hasCustomTitle = title.length > 0 && title !== 'Untitled Note';
    const hasContent = plainContent.length > 0;
    return hasCustomTitle || hasContent;
  };

  const setActiveContent = (nextContent) => {
    setNotes((prev) =>
      prev.map((note) => (note.id === activeNoteId ? { ...note, content: nextContent } : note))
    );
  };

  const createNote = () => {
    const id = `note-${Date.now()}`;
    const newNote = { id, title: 'Untitled Note', content: '' };
    setNotes((prev) => [newNote, ...prev]);
    setActiveNoteId(id);
    setView('editor');
  };

  const deleteNote = (noteId) => {
    setNotes((prev) => {
      const nextNotes = prev.filter((note) => note.id !== noteId);
      if (nextNotes.length === 0) {
        const freshId = `note-${Date.now()}`;
        const freshNote = { id: freshId, title: 'Untitled Note', content: '' };
        setActiveNoteId(freshId);
        return [freshNote];
      }

      if (activeNoteId === noteId) {
        setActiveNoteId(nextNotes[0].id);
      }

      return nextNotes;
    });
  };

  useEffect(() => {
    const isCustom = theme === 'custom' && customTheme?.vars;
    const selectedTheme = isCustom
      ? 'custom'
      : (BUILTIN_THEME_OPTIONS.some((item) => item.id === theme) ? theme : 'dark');

    document.documentElement.setAttribute('data-theme', selectedTheme);
    if (isCustom) {
      applyCustomThemeVars(customTheme.vars);
    } else {
      applyCustomThemeVars(null);
    }

    localStorage.setItem('quicknote-theme', selectedTheme);
    if (customTheme) {
      localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify(customTheme));
    }
  }, [theme, customTheme]);

  useEffect(() => {
    const init = async () => {
      try {
        const storedNotes = await loadNotesFromDisk();
        const freshId = `note-${Date.now()}`;
        const freshNote = { id: freshId, title: 'Untitled Note', content: '' };
        const mergedNotes = [freshNote, ...storedNotes];
        setNotes(mergedNotes);
        setActiveNoteId(freshId);
        setHasLoadedNotes(true);
        await initHighlighter();
        setIsReady(true);
      } catch (error) {
        console.error("Initialization failed:", error);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!hasLoadedNotes) return;
    const notesToPersist = notes.filter(shouldPersistNote);
    saveNotesToDisk(notesToPersist).catch((error) => {
      console.error('Failed to persist notes:', error);
    });
  }, [notes, hasLoadedNotes]);

  useEffect(() => {
    const openMenu = () => {
      setMenuCmdOpen(false);
      setNotes((prev) => {
        const active = prev.find((note) => note.id === activeNoteId);
        if (!active || shouldPersistNote(active)) {
          return prev;
        }

        const nextNotes = prev.filter((note) => note.id !== activeNoteId);
        const nextActive = nextNotes[0]?.id || null;
        setActiveNoteId(nextActive);
        return nextNotes;
      });
      setView('menu');
    };
    const openRename = () => {
      const current = notes.find((note) => note.id === activeNoteId);
      setRenameValue(current?.title || 'Untitled Note');
      setRenameOpen(true);
    };

    const renameNote = () => {
      const nextTitle = renameValue.trim();
      if (!nextTitle) {
        setRenameOpen(false);
        return;
      }
      setNotes((prev) =>
        prev.map((note) =>
          note.id === activeNoteId ? { ...note, title: nextTitle } : note
        )
      );
      setRenameOpen(false);
    };

    window.addEventListener('quicknote:go-menu', openMenu);
    window.addEventListener('quicknote:open-rename', openRename);
    window.addEventListener('quicknote:rename-note', openRename);
    window.addEventListener('quicknote:rename-submit', renameNote);
    return () => {
      window.removeEventListener('quicknote:go-menu', openMenu);
      window.removeEventListener('quicknote:open-rename', openRename);
      window.removeEventListener('quicknote:rename-note', openRename);
      window.removeEventListener('quicknote:rename-submit', renameNote);
    };
  }, [notes, activeNoteId, renameValue]);

  useEffect(() => {
    const handleMenuShortcuts = (event) => {
      if (view !== 'menu') return;
      if (event.ctrlKey && event.code === 'Space') {
        event.preventDefault();
        setMenuCmdOpen((value) => !value);
      }
    };

    window.addEventListener('keydown', handleMenuShortcuts);
    return () => {
      window.removeEventListener('keydown', handleMenuShortcuts);
    };
  }, [view]);

  useEffect(() => {
    if (!renameOpen) return;
    requestAnimationFrame(() => {
      const input = renameInputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(0, input.value.length);
    });
  }, [renameOpen]);

  const submitRename = () => {
    window.dispatchEvent(new CustomEvent('quicknote:rename-submit'));
  };

  if (!isReady) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-zinc-950 text-zinc-100 font-mono">
        <div className="text-sm text-zinc-400">Initializing QuickNote...</div>
      </div>
    );
  }

  if (view === 'menu') {
    return (
      <div className="w-screen h-screen bg-zinc-950 text-zinc-100 font-mono p-4">
        <div className="h-full border border-transparent rounded-m p-4 flex flex-col gap-3">
          <div className='flex items-center justify-between'>
            <h1 className='text-xl text-zinc-300 justify-center'>QuickNote</h1>
            <div className="text-xs text-zinc-500">Theme: {themeOptions.find((option) => option.id === theme)?.label || 'Dark'}</div>
          </div>
          <div className="flex items-center justify-between">
            <h1 className="text-sm text-zinc-300">All Notes</h1>
            <button
              onClick={createNote}
              className="text-xs px-2 py-1 rounded border border-zinc-700 hover:bg-zinc-800"
            >
              New
            </button>
          </div>
          <div className="flex-1 overflow-y-auto subtle-scrollbar space-y-2">
            {notes.map((note) => (
              <div
                key={note.id}
                className="w-full text-left p-2 rounded border border-zinc-800 hover:bg-zinc-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    onClick={() => {
                      setActiveNoteId(note.id);
                      setView('editor');
                    }}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="text-sm text-zinc-200">{note.title}</div>
                    <div className="text-xs text-zinc-500 truncate">
                      {(note.content || '').replace(/\s+/g, ' ').slice(0, 90) || 'Empty note'}
                    </div>
                  </button>

                  <button
                    onClick={() => deleteNote(note.id)}
                    className="text-[10px] px-2 py-1 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                    title="Delete note"
                  >
                    Del
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <CommandPalette
          open={menuCmdOpen}
          setOpen={setMenuCmdOpen}
          commands={MENU_COMMANDS}
          title="General"
          onCommand={(id) => {
            if (id === 'newnote') {
              createNote();
              return;
            }

            if (id === 'deleteall') {
              setNotes([]);
              setActiveNoteId(null);
              setMenuCmdOpen(false);
              return;
            }

            if (id === 'settheme') {
              setThemePickerOpen(true);
            }
          }}
        />

        <CommandPalette
          open={themePickerOpen}
          setOpen={setThemePickerOpen}
          commands={themeCommands}
          title="Themes"
          onCommand={(id) => {
            if (id === 'theme:load-custom') {
              themeInputRef.current?.click();
              return;
            }

            if (!id.startsWith('theme:')) return;
            const themeId = id.replace('theme:', '');
            setTheme(themeId);
          }}
        />

        <input
          ref={themeInputRef}
          type="file"
          accept=".json,.md,text/markdown,application/json,text/plain"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;

            const text = await file.text();
            const parsed = parseCustomThemeFromText(text, file.name.replace(/\.[^.]+$/, ''));
            event.target.value = '';

            if (!parsed) {
              window.alert('Could not parse custom theme file. See docs/custom-themes.md for format.');
              return;
            }

            setCustomTheme(parsed);
            setTheme('custom');
            setThemePickerOpen(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-zinc-950 text-zinc-100 font-mono p-0">
      <div className="h-full">
        <Editor content={activeNote?.content || ''} setContent={setActiveContent} />
      </div>

      {renameOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-4">
            <div className="text-sm text-zinc-200 mb-3">Rename note</div>
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submitRename();
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setRenameOpen(false);
                }
              }}
              className="w-full bg-zinc-800 text-zinc-100 border border-zinc-700 p-2 rounded-md outline-none"
              placeholder="Note title"
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                onClick={() => setRenameOpen(false)}
                className="text-xs px-3 py-1.5 rounded border border-zinc-700 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={submitRename}
                className="text-xs px-3 py-1.5 rounded border border-zinc-700 bg-zinc-800 hover:bg-zinc-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}