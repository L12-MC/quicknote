import { Command } from 'cmdk';
import { useEffect, useRef, useState } from 'react';

const COMMANDS = [
  { id: 'exit', label: 'exit', hint: 'Go to notes menu' },
  { id: 'rename', label: 'rename', hint: 'Rename current note' },
  { id: 'copyall', label: 'copyall', hint: 'Copy entire note' },
  { id: 'exportmd', label: 'exportmd', hint: 'Export note as markdown' },
  { id: 'importmd', label: 'importmd', hint: 'Import markdown into note' }
];

export default function CommandPalette({ open, setOpen, onCommand, commands = COMMANDS, title = 'Commands' }) {
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [activeValue, setActiveValue] = useState("")

  // Autofocus input when command palette opens
  useEffect(() => {
    if (open && inputRef.current) {
      // Small delay to ensure the dialog is fully rendered
      setTimeout(() => {
        inputRef.current?.focus();
        const end = inputRef.current?.value?.length ?? 0;
        inputRef.current?.setSelectionRange(end, end);
        window.dispatchEvent(new CustomEvent('quicknote:hide-cursor'));
      }, 10);
    } else if (!open) {
      setQuery('');
      window.dispatchEvent(new CustomEvent('quicknote:show-cursor'));
    }
  }, [open]);

  const runCommand = (id) => {
    onCommand?.(id);
    setOpen(false);
  };

  const handleInputKeyDown = (event) => {
    if (event.key === 'j' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      const nextEvent = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true });
      event.currentTarget.dispatchEvent(nextEvent);
      return;
    }
    if (event.key === 'k' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      const nextEvent = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true });
      event.currentTarget.dispatchEvent(nextEvent);
      return;
    }

    if (event.key !== 'Enter') return;
    event.preventDefault(); // Prevent propagation and default behavior immediately
    const value = query.trim().toLowerCase();
    if (!value) {
      if (activeValue) {
        runCommand(activeValue);
        // Only focus editor if we're not exiting or renaming (rename has its own focus logic)
        if (activeValue !== 'exit' && activeValue !== 'rename') {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('quicknote:focus-editor'));
          }, 10);
        }
      }
      return;
    }



    const exactMatch = commands.find((command) => command.label === value);
    const prefixMatch = commands.find((command) => command.label.startsWith(value));
    const looseMatch = commands.find((command) => command.label.includes(value));
    const match = exactMatch || prefixMatch || looseMatch;
    if (!match) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    runCommand(match.id);
    if (match.id !== 'exit' && match.id !== 'rename') {
      window.dispatchEvent(new CustomEvent('quicknote:focus-editor'));
    }
  };

  return (
    
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      className="bg-black/0"
    >
      <div className='fixed inset-0 flex items-center justify-center p-4 animate-[fadein_190ms_linear] bg-black/50'>
      <div className="fixed inset-0 flex items-center justify-center p-4 animate-[scalein_190ms_cubic-bezier(0.22,1,0.36,1)] z-50 overflow-hidden">
      <Command value={activeValue} onValueChange={setActiveValue} className="bg-zinc-900 border border-zinc-700 text-white p-4 rounded-2xl w-full max-w-sm shadow-lg overflow-hidden">
        <Command.Input
          ref={inputRef}
          value={query}
          onValueChange={setQuery}
          onKeyDown={handleInputKeyDown}
          placeholder="Type a command or search..."
          className="bg-zinc-800 text-zinc-100 border border-zinc-700 p-2 mb-2 outline-none w-full rounded-md"
        />
        <Command.List className="max-h-60 overflow-y-auto overflow-x-hidden">
          <Command.Empty>No results found.</Command.Empty>

          <Command.Group heading={title}>
            {commands.map((command) => (
              <Command.Item
                key={command.id}
                value={command.id}
                onSelect={() => runCommand(command.id)}
                className="p-2 data-[selected=true]:bg-zinc-800 data-[selected=true]:text-zinc-100 rounded flex items-center justify-between transition-colors duration-100 pointer-events-none"
              >
                <div className="flex flex-col">
                  <span className="text-sm">{command.label}</span>
                  {/* <span className="text-[10px] text-zinc-500">{command.hint}</span> */}
                </div>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
      </div>
      </div>
    </Command.Dialog>
    
  );
}