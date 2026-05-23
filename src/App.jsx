import React, { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import Editor from './components/Editor';
import CommandPalette from './components/CommandPalette';
import { initHighlighter } from './lib/shiki';
import {
  loadAppSettingsFromDisk,
  loadNotesFromDisk,
  loadThemesFromDisk,
  saveAppSettingsToDisk,
  saveNotesToDisk,
  saveThemesToDisk
} from './lib/storage';
import { IoAdd, IoArrowBack, IoCheckmark, IoCloudUploadOutline, IoFolderOpenOutline, IoSettingsOutline, IoTrash } from 'react-icons/io5';

const BUILTIN_THEME_OPTIONS = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'soulless', label: 'Soulless' },
  { id: 'hacker', label: 'Hacker' },
  { id: 'nightsky', label: 'NightSky' }
];

const CUSTOM_THEME_STORAGE_KEY = 'quicknote-custom-theme';
const CUSTOM_THEME_KEYS = ['bg', 'surface', 'surface2', 'text', 'textSoft', 'muted', 'border', 'accent', 'accentSoft'];
const DEFAULT_UI_FONT = '"Mulish", "Elms Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const DEFAULT_NOTES_FONT = '"JetBrains Mono", ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';

const MENU_COMMANDS = [
  { id: 'newnote', label: 'newnote', hint: 'Create a new note' },
  { id: 'settings', label: 'settings', hint: 'Open settings' },
  { id: 'quit', label: 'quit', hint: 'Close QuickNote' },
  { id: 'deleteall', label: 'deleteall', hint: 'Delete all notes' }
];

function focusEditor() {
  setTimeout(() => {
    
  }, 10);
}

function ToggleSwitch({ checked, onChange, label, description }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="qn-setting-row group"
    >
      <span>
        <span className="qn-setting-label">{label}</span>
        <span className="qn-setting-description">{description}</span>
      </span>
      <span className={`qn-switch ${checked ? 'qn-switch-on' : ''}`} aria-hidden="true">
        <span />
      </span>
    </button>
  );
}

function SettingsPage({
  theme,
  themeOptions,
  setTheme,
  onBack,
  onLoadCustomTheme,
  onOpenNotesFolder,
  useMonospaceNotes,
  setUseMonospaceNotes,
  reducedMotion,
  setReducedMotion,
  uiFont,
  setUiFont,
  notesFont,
  setNotesFont
}) {
  const rootRef = useRef(null);

  const getSettingsControls = () => Array.from(rootRef.current?.querySelectorAll('button, input, textarea, select, [tabindex]:not([tabindex="-1"])') || [])
    .filter((item) => !item.disabled && item.offsetParent !== null);

  const focusNextControl = (direction) => {
    const controls = getSettingsControls();
    if (controls.length === 0) return;

    const currentIndex = controls.indexOf(document.activeElement);
    const fallbackIndex = direction > 0 ? -1 : 0;
    const nextIndex = (currentIndex >= 0 ? currentIndex : fallbackIndex) + direction;
    const clampedIndex = Math.max(0, Math.min(controls.length - 1, nextIndex));
    controls[clampedIndex]?.focus();
  };

  useEffect(() => {
    requestAnimationFrame(() => {
      getSettingsControls()[0]?.focus();
    });
  }, []);

  const handleSettingsKeyDown = (event) => {
    const isTextField = ['INPUT', 'TEXTAREA'].includes(event.target?.tagName);
    if (isTextField && event.key.length === 1 && event.key !== 'j' && event.key !== 'k') return;

    if (event.key === 'ArrowDown' || event.key === 'j') {
      event.preventDefault();
      focusNextControl(1);
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'k') {
      event.preventDefault();
      focusNextControl(-1);
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && event.target?.tagName === 'BUTTON') {
      event.preventDefault();
      event.target.click();
    }
  };

  return (
    <div ref={rootRef} tabIndex={-1} onKeyDown={handleSettingsKeyDown} className="qn-shell qn-settings-shell">
      <header className="qn-topbar">
        <button type="button" className="qn-icon-button" onClick={onBack} aria-label="Back">
          <IoArrowBack />
        </button>
        <div>
          <h1 className="qn-title">Settings</h1>
          <p className="qn-subtitle">Appearance and input preferences</p>
        </div>
      </header>

      <main className="qn-settings-grid subtle-scrollbar">
        <section className="qn-panel">
          <div className="qn-section-header">
            <h2>Theme</h2>
            <button type="button" className="qn-button" onClick={onLoadCustomTheme}>
              <IoCloudUploadOutline />
              Load custom
            </button>
          </div>
          <div className="qn-theme-list" role="radiogroup" aria-label="Theme">
            {themeOptions.map((option) => {
              const selected = theme === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`qn-theme-option ${selected ? 'is-selected' : ''}`}
                  onClick={() => setTheme(option.id)}
                >
                  <span>{option.label}</span>
                  {selected && <IoCheckmark aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </section>

        <section className="qn-panel">
          <div className="qn-section-header">
            <h2>Notes</h2>
            <button type="button" className="qn-button" onClick={onOpenNotesFolder}>
              <IoFolderOpenOutline />
              Open folder
            </button>
          </div>
          <ToggleSwitch
            checked={useMonospaceNotes}
            onChange={setUseMonospaceNotes}
            label="Use monospace font for notes"
            description="Keeps code-heavy notes aligned and predictable."
          />
          <label className="qn-field">
            <span>Notes font</span>
            <input
              value={notesFont}
              onChange={(event) => setNotesFont(event.target.value)}
              placeholder={DEFAULT_NOTES_FONT}
            />
          </label>
        </section>

        <section className="qn-panel">
          <div className="qn-section-header">
            <h2>Interface</h2>
          </div>
          <ToggleSwitch
            checked={reducedMotion}
            onChange={setReducedMotion}
            label="Use reduced motion animations"
            description="Minimizes transitions and entrance animations."
          />
          <label className="qn-field">
            <span>Interface font</span>
            <input
              value={uiFont}
              onChange={(event) => setUiFont(event.target.value)}
              placeholder={DEFAULT_UI_FONT}
            />
          </label>
        </section>
      </main>
    </div>
  );
}




export default function App() {
  const [notes, setNotes] = useState([{ id: 'note-1', title: 'Untitled Note', content: '' }]);
  const notesRef = useRef(notes); // ADDED: Ref to hold the latest notes
  const [activeNoteId, setActiveNoteId] = useState('note-1');
  const [view, setView] = useState('editor');
  const [previousView, setPreviousView] = useState('editor');
  const [isReady, setIsReady] = useState(false);
  const [hasLoadedNotes, setHasLoadedNotes] = useState(false);
  const [hasLoadedSettings, setHasLoadedSettings] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [menuCmdOpen, setMenuCmdOpen] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [menuSelectedIndex, setMenuSelectedIndex] = useState(0);
  const [theme, setTheme] = useState(() => localStorage.getItem('quicknote-theme') || 'dark');
  const [useMonospaceNotes, setUseMonospaceNotes] = useState(() => localStorage.getItem('quicknote-notes-monospace') !== 'false');
  const [reducedMotion, setReducedMotion] = useState(() => localStorage.getItem('quicknote-reduced-motion') === 'true');
  const [uiFont, setUiFont] = useState(() => localStorage.getItem('quicknote-ui-font') || DEFAULT_UI_FONT);
  const [notesFont, setNotesFont] = useState(() => localStorage.getItem('quicknote-notes-font') || DEFAULT_NOTES_FONT);
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

  const showCursor = () => {
    setIsHidden(false);
  };

  const hideCursor = () => {
    setIsHidden(true);
  };

  const renameInputRef = useRef(null);
  const themeInputRef = useRef(null);


  useEffect(() => {
    window.addEventListener("quicknote:show-cursor", showCursor);
    window.addEventListener("quicknote:hide-cursor", hideCursor);
    return () => {
      window.removeEventListener("quicknote:show-cursor", showCursor);
      window.removeEventListener("quicknote:hide-cursor", hideCursor);
    };
  }, []);
  
  const lastMenuOpenTime = useRef(0);

  const themeOptions = customTheme
    ? [...BUILTIN_THEME_OPTIONS, { id: 'custom', label: customTheme.name || 'Custom' }]
    : BUILTIN_THEME_OPTIONS;

  const openSettings = (fromView = view) => {
    setMenuCmdOpen(false);
    setPreviousView(fromView === 'settings' ? 'editor' : fromView);
    setView('settings');
  };

  const closeSettings = () => {
    setView(previousView || 'editor');
  };

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

  const normalizeNoteTitleAndFolder = (value) => {
    const parts = String(value || 'Untitled Note').split(/[\\/]+/).map((part) => part.trim()).filter(Boolean);
    const title = parts.pop() || 'Untitled Note';
    return {
      title,
      folder: parts.join('/')
    };
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
      prev.map((note) => {
        if (note.id === activeNoteId) {
          const updatedNote = { ...note, content: nextContent };
          if (!note.manuallyRenamed) {
            const firstLine = nextContent.split('\n').find((l) => l.trim().length > 0) || '';
            let newTitle = 'Untitled Note';

            const headingMatch = firstLine.match(/^#{1,6}\s+(.*)$/);
            const htmlHeadingMatch = firstLine.match(/^<h[1-6]>([\s\S]*)<\/h[1-6]>$/i);

            if (headingMatch) {
              newTitle = headingMatch[1].trim();
            } else if (htmlHeadingMatch) {
              newTitle = htmlHeadingMatch[1].replace(/<[^>]*>/g, '').trim();
            } else if (firstLine) {
              newTitle = firstLine.replace(/<[^>]*>/g, '').trim();
            }

            newTitle = newTitle.slice(0, 100) || 'Untitled Note';
            if (newTitle !== note.title) {
              updatedNote.title = newTitle;
            }
          }
          return updatedNote;
        }
        return note;
      })
    );
  };

  const createNote = () => {
    const id = `note-${Date.now()}`;
    const newNote = { id, title: 'Untitled Note', folder: '', content: '', manuallyRenamed: false };
    setNotes((prev) => [newNote, ...prev]);
    setActiveNoteId(id);
    setView('editor');
  };

  const deleteNote = (noteId) => {
    setNotes((prev) => {
      const nextNotes = prev.filter((note) => note.id !== noteId);
      if (nextNotes.length === 0) {
        const freshId = `note-${Date.now()}`;
        const freshNote = { id: freshId, title: 'Untitled Note', folder: '', content: '', manuallyRenamed: false };
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
    const root = document.documentElement;
    const normalizedUiFont = uiFont.trim() || DEFAULT_UI_FONT;
    const normalizedNotesFont = notesFont.trim() || DEFAULT_NOTES_FONT;

    root.style.setProperty('--qn-ui-font', normalizedUiFont);
    root.style.setProperty('--qn-note-font', normalizedNotesFont);
    root.setAttribute('data-notes-monospace', String(useMonospaceNotes));
    root.setAttribute('data-reduced-motion', String(reducedMotion));

    localStorage.setItem('quicknote-ui-font', normalizedUiFont);
    localStorage.setItem('quicknote-notes-font', normalizedNotesFont);
    localStorage.setItem('quicknote-notes-monospace', String(useMonospaceNotes));
    localStorage.setItem('quicknote-reduced-motion', String(reducedMotion));
  }, [uiFont, notesFont, useMonospaceNotes, reducedMotion]);

  useEffect(() => {
    if (!hasLoadedSettings) return;
    saveAppSettingsToDisk({
      theme,
      useMonospaceNotes,
      reducedMotion,
      uiFont: uiFont.trim() || DEFAULT_UI_FONT,
      notesFont: notesFont.trim() || DEFAULT_NOTES_FONT
    }).catch((error) => {
      console.error('Failed to persist settings:', error);
    });
  }, [theme, useMonospaceNotes, reducedMotion, uiFont, notesFont, hasLoadedSettings]);

  useEffect(() => {
    if (!hasLoadedSettings) return;
    saveThemesToDisk({ customTheme }).catch((error) => {
      console.error('Failed to persist themes:', error);
    });
  }, [customTheme, hasLoadedSettings]);

  useEffect(() => {
    const init = async () => {
      const freshId = `note-${Date.now()}`;
      const freshNote = { id: freshId, title: 'Untitled Note', folder: '', content: '' };

      try {
        const [storedSettings, storedThemes] = await Promise.all([
          loadAppSettingsFromDisk(),
          loadThemesFromDisk()
        ]);

        if (storedSettings) {
          if (storedSettings.theme) setTheme(storedSettings.theme);
          if (typeof storedSettings.useMonospaceNotes === 'boolean') setUseMonospaceNotes(storedSettings.useMonospaceNotes);
          if (typeof storedSettings.reducedMotion === 'boolean') setReducedMotion(storedSettings.reducedMotion);
          if (storedSettings.uiFont) setUiFont(storedSettings.uiFont);
          if (storedSettings.notesFont) setNotesFont(storedSettings.notesFont);
        }

        if (storedThemes?.customTheme) {
          setCustomTheme(storedThemes.customTheme);
        }
      } catch (error) {
        console.error('Failed to load settings from disk:', error);
      } finally {
        setHasLoadedSettings(true);
      }

      try {
        const storedNotes = await loadNotesFromDisk();
        const mergedNotes = [freshNote, ...storedNotes];
        setNotes(mergedNotes);
        setActiveNoteId(freshId);
      } catch (error) {
        // Keep app usable even if note loading fails.
        console.error('Failed to load notes from disk:', error);
        setNotes([freshNote]);
        setActiveNoteId(freshId);
      }

      setHasLoadedNotes(true);

      try {
        // Avoid blocking app startup forever if highlighter init stalls.
        await Promise.race([
          initHighlighter(),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Highlighter init timed out')), 5000);
          })
        ]);
      } catch (error) {
        console.error('Highlighter initialization failed. Continuing without syntax highlighting.', error);
      } finally {
        setIsReady(true);
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
      setMenuSelectedIndex(0);
      lastMenuOpenTime.current = Date.now();
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
      setRenameValue(current?.folder ? `${current.folder}/${current.title || 'Untitled Note'}` : current?.title || 'Untitled Note');
      setRenameOpen(true);
    };
    const handleOpenSettings = () => {
      openSettings(view);
    };
    const openNoteLink = (event) => {
      const rawTarget = String(event.detail || '').trim().toLowerCase();
      if (!rawTarget) return;

      const target = rawTarget.replace(/\\/g, '/');
      const linkedNote = notes.find((note) => {
        const title = String(note.title || '').toLowerCase();
        const path = note.folder ? `${note.folder}/${note.title}`.toLowerCase() : title;
        return title === target || path === target || String(note.path || '').replace(/\.md$/i, '').toLowerCase() === target;
      });

      if (linkedNote) {
        setActiveNoteId(linkedNote.id);
        setView('editor');
      }
    };

    const renameNote = () => {
      const nextLocation = normalizeNoteTitleAndFolder(renameValue);
      if (!nextLocation.title.trim()) {
        setRenameOpen(false);
        return;
      }
      setNotes((prev) =>
        prev.map((note) =>
          note.id === activeNoteId ? { ...note, title: nextLocation.title, folder: nextLocation.folder, manuallyRenamed: true } : note
        )
      );
      setRenameOpen(false);
    };

    window.addEventListener('quicknote:go-menu', openMenu);
    window.addEventListener('quicknote:open-rename', openRename);
    window.addEventListener('quicknote:rename-note', openRename);
    window.addEventListener('quicknote:rename-submit', renameNote);
    window.addEventListener('quicknote:open-settings', handleOpenSettings);
    window.addEventListener('quicknote:open-note-link', openNoteLink);
    return () => {
      window.removeEventListener('quicknote:go-menu', openMenu);
      window.removeEventListener('quicknote:open-rename', openRename);
      window.removeEventListener('quicknote:rename-note', openRename);
      window.removeEventListener('quicknote:rename-submit', renameNote);
      window.removeEventListener('quicknote:open-settings', handleOpenSettings);
      window.removeEventListener('quicknote:open-note-link', openNoteLink);
    };
  }, [notes, activeNoteId, renameValue, view, previousView]);

  useEffect(() => {
    const handleGlobalShortcuts = (event) => {
      if (event.ctrlKey && event.code === 'KeyW') {
        event.preventDefault();
        if (event.shiftKey) {
          window.dispatchEvent(new CustomEvent('quicknote:go-menu'));
        } else {
          getCurrentWindow().close();
        }
      }

      if (event.ctrlKey && event.code === 'Comma') {
        event.preventDefault();
        openSettings(view);
      }

      if (view === 'settings' && event.key === 'Escape') {
        event.preventDefault();
        closeSettings();
      }
    };

    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => {
      window.removeEventListener('keydown', handleGlobalShortcuts);
    };
  }, [view, previousView]);

  useEffect(() => {
    const handleMenuShortcuts = (event) => {
      if (view !== 'menu') return;
      if (menuCmdOpen) return;

      // Cooldown to prevent accidental double-triggers when switching views
      if (Date.now() - lastMenuOpenTime.current < 400) return;

      if (event.ctrlKey && event.code === 'Space') {
        event.preventDefault();
        setMenuCmdOpen((value) => !value);
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'j') {
        event.preventDefault();
        setMenuSelectedIndex((prev) => Math.min(prev + 1, notes.length - 1));
      } else if (event.key === 'ArrowUp' || event.key === 'k') {
        event.preventDefault();
        setMenuSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const selectedNote = notes[menuSelectedIndex];
        if (selectedNote) {
          setActiveNoteId(selectedNote.id);
          setView('editor');
        }
      } else if (event.key === 'Delete' || (event.key === 'd' && !event.ctrlKey && !event.metaKey)) {
        event.preventDefault();
        const selectedNote = notes[menuSelectedIndex];
        if (selectedNote) {
          deleteNote(selectedNote.id);
          // Selection adjustment happens naturally because notes.length changes
          // but we might need to clamp it if we deleted the last item
          setMenuSelectedIndex((prev) => Math.min(prev, Math.max(0, notes.length - 2)));
        }
      } else if (event.key === 'n' && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        createNote();
      } else if (event.key === 's' && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        openSettings('menu');
      }
    };

    window.addEventListener('keydown', handleMenuShortcuts);
    return () => {
      window.removeEventListener('keydown', handleMenuShortcuts);
    };
  }, [view, menuCmdOpen, notes, menuSelectedIndex]);

  useEffect(() => {
    if (renameOpen) {
      window.dispatchEvent(new CustomEvent('quicknote:hide-cursor'));
      requestAnimationFrame(() => {
        const input = renameInputRef.current;
        if (!input) return;
        input.focus();
        input.setSelectionRange(0, input.value.length);
      });
    } else {
      window.dispatchEvent(new CustomEvent('quicknote:show-cursor'));
    }
  }, [renameOpen]);

  const submitRename = () => {
    window.dispatchEvent(new CustomEvent('quicknote:rename-submit'));
  };

  const handleThemeFileChange = async (event) => {
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
  };

  const openNotesFolder = async () => {
    try {
      await invoke('open_notes_folder');
    } catch (error) {
      console.error('Failed to open notes folder:', error);
      window.alert('Could not open the notes folder.');
    }
  };

  if (!isReady) {
    return (
      <div className="qn-loading w-screen h-screen flex items-center justify-center bg-zinc-950 text-zinc-100">
        <div className="text-sm text-zinc-400">Initializing QuickNote...</div>
      </div>
    );
  }

  if (view === 'settings') {
    return (
      <div style={{ cursor: isHidden ? 'none' : 'auto', height: '100vh' }}>
        <SettingsPage
          theme={theme}
          themeOptions={themeOptions}
          setTheme={setTheme}
          onBack={closeSettings}
          onLoadCustomTheme={() => themeInputRef.current?.click()}
          onOpenNotesFolder={openNotesFolder}
          useMonospaceNotes={useMonospaceNotes}
          setUseMonospaceNotes={setUseMonospaceNotes}
          reducedMotion={reducedMotion}
          setReducedMotion={setReducedMotion}
          uiFont={uiFont}
          setUiFont={setUiFont}
          notesFont={notesFont}
          setNotesFont={setNotesFont}
        />
        <input
          ref={themeInputRef}
          type="file"
          accept=".json,.md,text/markdown,application/json,text/plain"
          className="hidden"
          onChange={handleThemeFileChange}
        />
      </div>
    );
  }

  if (view === 'menu') {
    return (
      <div style={{ cursor: isHidden ? 'none' : 'auto', height: '100vh' }}>
      <div className="qn-shell w-screen h-screen bg-zinc-950 text-zinc-100 p-6">
        <div className="h-full flex flex-col gap-3">
          <div className='qn-topbar'>
            <div>
              <h1 className='qn-title'>QuickNote</h1>
              <p className="qn-subtitle">{notes.length} notes</p>
            </div>
            <button
              type="button"
              onClick={() => openSettings('menu')}
              className="qn-icon-button"
              aria-label="Open settings"
              title="Settings"
            >
              <IoSettingsOutline />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <h2 className="text-sm text-zinc-300">All Notes</h2>
            <button
              type="button"
              onClick={createNote}
              className="qn-icon-button"
              aria-label="Create note"
              title="New note"
            >
              <IoAdd/>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto subtle-scrollbar space-y-2">
            {notes.map((note, index) => (
              <div
                key={note.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setActiveNoteId(note.id);
                  setMenuSelectedIndex(index);
                  setView('editor');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setActiveNoteId(note.id);
                    setMenuSelectedIndex(index);
                    setView('editor');
                  }
                }}
                onFocus={() => setMenuSelectedIndex(index)}
                className={`qn-note-row animate-[fadeup_200ms_${index * 10}ms_cubic-bezier(0.16,1,0.3,1)] ${
                  index === menuSelectedIndex ? 'is-selected' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex-1 text-left min-w-0">
                    <div className="text-sm text-zinc-200">{note.folder ? `${note.folder}/${note.title}` : note.title}</div>
                    <div className="text-xs text-zinc-500 truncate">
                      {(note.content || '').replace(/\s+/g, ' ').slice(0, 90) || 'Empty note'}
                    </div>
                  </span>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNote(note.id);
                    }}
                    className="qn-icon-button qn-icon-button-small"
                    title="Delete note"
                    aria-label={`Delete ${note.title}`}
                  >
                    <IoTrash/>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        </div>

        <CommandPalette
          open={menuCmdOpen}
          setOpen={setMenuCmdOpen}
          commands={MENU_COMMANDS}
          title="General"
          onCommand={async (id) => {
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

            if (id === 'settings') {
              openSettings('menu');
              return;
            }

            if (id === 'quit') {
              try {
                await invoke('quit_app');
              } catch (invokeError) {
                console.error('quit_app command failed, falling back to close:', invokeError);
                try {
                  await getCurrentWindow().close();
                } catch (error) {
                  console.error('Failed to close Tauri window:', error);
                  window.close();
                }
              }
            }
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ cursor: isHidden ? 'none' : 'auto' }} className="qn-editor-shell w-screen h-screen bg-zinc-950 text-zinc-100 p-0">
      <div className="h-full">
        <Editor content={activeNote?.content || ''} setContent={setActiveContent} currentNote={activeNote} />
      </div>

      {renameOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="qn-dialog w-full max-w-md border border-zinc-700 bg-zinc-900 p-4">
            <div className="text-sm text-zinc-200 mb-3">Rename note</div>
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submitRename();
                  // Focus the caret on the editor
                  focusEditor();
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setRenameOpen(false);
                  // Focus the caret on the editor
                  focusEditor();
                }
              }}
              className="qn-input w-full bg-zinc-800 text-zinc-100 border border-zinc-700 p-2 outline-none"
              placeholder="Note title"
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                onClick={() => setRenameOpen(false)}
                className="qn-button text-xs"
              >
                Cancel
              </button>
              <button
                onClick={submitRename}
                className="qn-button qn-button-primary text-xs"
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
