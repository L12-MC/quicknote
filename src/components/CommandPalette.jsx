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

  // Autofocus input when command palette opens
  useEffect(() => {
    if (open && inputRef.current) {
      // Small delay to ensure the dialog is fully rendered
      setTimeout(() => {
        inputRef.current?.focus();
        const end = inputRef.current?.value?.length ?? 0;
        inputRef.current?.setSelectionRange(end, end);
      }, 10);
    } else if (!open) {
      setQuery('');
    }
  }, [open]);

  const runCommand = (id) => {
    onCommand?.(id);
    setOpen(false);
  };

  const handleInputKeyDown = (event) => {
    if (event.key !== 'Enter') return;
    const value = query.trim().toLowerCase();
    if (!value) {
      event.preventDefault();
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
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 animate-[scalein_190ms_cubic-bezier(0.22,1,0.36,1)] z-50"
    >
      <Command className="bg-zinc-900 border border-zinc-700 text-white p-4 rounded-2xl w-full max-w-sm shadow-lg">
        <Command.Input
          ref={inputRef}
          value={query}
          onValueChange={setQuery}
          onKeyDown={handleInputKeyDown}
          placeholder="Type a command or search..."
          className="bg-zinc-800 text-zinc-100 border border-zinc-700 p-2 mb-2 outline-none w-full rounded-md"
        />
        <Command.List className="max-h-60 overflow-y-auto">
          <Command.Empty>No results found.</Command.Empty>

          <Command.Group heading={title}>
            {commands.map((command) => (
              <Command.Item
                key={command.id}
                value={`${command.label} ${command.hint}`}
                onSelect={() => runCommand(command.id)}
                className="p-2 hover:bg-zinc-700 data-[selected=true]:bg-zinc-700 data-[selected=true]:text-zinc-100 cursor-pointer rounded flex items-center justify-between transition-colors duration-100"
              >
                <span>{command.label}</span>
                <span className="text-xs text-zinc-400">{command.hint}</span>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </Command.Dialog>
  );
}