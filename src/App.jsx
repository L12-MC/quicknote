import React, { useEffect, useState } from 'react';
import Editor from './components/Editor';
import { initHighlighter } from './lib/shiki';
import { loadNotesFromDisk, saveNotesToDisk } from './lib/storage';

export default function App() {
  const [notes, setNotes] = useState([{ id: 'note-1', title: 'Untitled Note', content: '' }]);
  const [activeNoteId, setActiveNoteId] = useState('note-1');
  const [view, setView] = useState('editor');
  const [isReady, setIsReady] = useState(false);
  const [hasLoadedNotes, setHasLoadedNotes] = useState(false);

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
    const openMenu = () => setView('menu');
    const renameNote = () => {
      const current = notes.find((note) => note.id === activeNoteId);
      const nextTitle = window.prompt('Rename note', current?.title || 'Untitled Note');
      if (!nextTitle || !nextTitle.trim()) return;
      setNotes((prev) =>
        prev.map((note) =>
          note.id === activeNoteId ? { ...note, title: nextTitle.trim() } : note
        )
      );
    };

    window.addEventListener('quicknote:go-menu', openMenu);
    window.addEventListener('quicknote:rename-note', renameNote);
    return () => {
      window.removeEventListener('quicknote:go-menu', openMenu);
      window.removeEventListener('quicknote:rename-note', renameNote);
    };
  }, [notes, activeNoteId]);

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
        <div className="h-full border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
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
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-zinc-950 text-zinc-100 font-mono p-0">
      <div className="h-full">
        <Editor content={activeNote?.content || ''} setContent={setActiveContent} />
      </div>
    </div>
  );
}