import { writeTextFile, readTextFile, BaseDirectory } from '@tauri-apps/plugin-fs';

const FILE_NAME = "quicknote.md";
const NOTES_FILE_NAME = "notes.json";

export async function saveToDisk(content) {
  await writeTextFile(FILE_NAME, content, { baseDir: BaseDirectory.AppData });
}

export async function loadFromDisk() {
  try {
    return await readTextFile(FILE_NAME, { baseDir: BaseDirectory.AppData });
  } catch {
    return "";
  }
}

export async function saveNotesToDisk(notes) {
  await writeTextFile(
    NOTES_FILE_NAME,
    JSON.stringify({ version: 1, notes }, null, 2),
    { baseDir: BaseDirectory.AppData }
  );
}

export async function loadNotesFromDisk() {
  try {
    const raw = await readTextFile(NOTES_FILE_NAME, { baseDir: BaseDirectory.AppData });
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.notes)) return [];
    return parsed.notes;
  } catch {
    return [];
  }
}