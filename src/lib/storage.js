import { writeTextFile, readTextFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import { appDataDir } from '@tauri-apps/api/path'; // ADDED

const FILE_NAME = "quicknote.md";
const NOTES_FILE_NAME = "notes.json";
const LEGACY_STORAGE_KEY = 'quicknote-md-fallback';
const NOTES_STORAGE_KEY = 'quicknote-notes-fallback';

// Helper to get full path for logging
async function getFullPath(filename) {
  const appDataDirPath = await appDataDir();
  return `${appDataDirPath}${filename}`;
}

function writeFallback(key, value) {
  try {
    localStorage.setItem(key, value);
    console.log(`[Storage] localStorage fallback: Stored key '${key}'.`);
  } catch (error) {
    console.error(`[Storage] localStorage fallback: Failed to store key '${key}':`, error);
  }
}

function readFallback(key, emptyValue) {
  try {
    const value = localStorage.getItem(key);
    console.log(`[Storage] localStorage fallback: Read key '${key}', value found: ${value !== null}`);
    return value ?? emptyValue;
  } catch (error) {
    console.error(`[Storage] localStorage fallback: Failed to read key '${key}':`, error);
    return emptyValue;
  }
}

export async function saveToDisk(content) {
  const raw = String(content ?? '');
  const fullPath = await getFullPath(FILE_NAME); // ADDED
  console.log(`[Storage] Attempting to save content to disk at: ${fullPath}`); // ADDED
  try {
    await writeTextFile(FILE_NAME, raw, { baseDir: BaseDirectory.AppData });
    console.log(`[Storage] Successfully saved '${FILE_NAME}' to disk at: ${fullPath}`); // MODIFIED
  } catch (error) {
    console.error(`[Storage] saveToDisk failed for '${fullPath}', using localStorage fallback:`, error); // MODIFIED
    writeFallback(LEGACY_STORAGE_KEY, raw);
  }
}

export async function loadFromDisk() {
  const fullPath = await getFullPath(FILE_NAME); // ADDED
  console.log(`[Storage] Attempting to load content from disk at: ${fullPath}`); // ADDED
  try {
    const value = await readTextFile(FILE_NAME, { baseDir: BaseDirectory.AppData });
    console.log(`[Storage] Successfully loaded '${FILE_NAME}' from disk at: ${fullPath}`); // MODIFIED
    writeFallback(LEGACY_STORAGE_KEY, value);
    return value;
  } catch (error) {
    console.error(`[Storage] loadFromDisk failed for '${fullPath}', reading localStorage fallback:`, error); // MODIFIED
    return readFallback(LEGACY_STORAGE_KEY, '');
  }
}

export async function saveNotesToDisk(notes) {
  const payload = JSON.stringify({ version: 1, notes }, null, 2);
  const fullPath = await getFullPath(NOTES_FILE_NAME); // ADDED
  console.log(`[Storage] Attempting to save notes to disk at: ${fullPath}`); // ADDED
  try {
    await writeTextFile(
      NOTES_FILE_NAME,
      payload,
      { baseDir: BaseDirectory.AppData }
    );
    console.log(`[Storage] Successfully saved '${NOTES_FILE_NAME}' to disk at: ${fullPath}`); // ADDED
  } catch (error) {
    console.error(`[Storage] saveNotesToDisk failed for '${fullPath}', using localStorage fallback:`, error); // MODIFIED
  }

  writeFallback(NOTES_STORAGE_KEY, payload);
}

export async function loadNotesFromDisk() {
  const fullPath = await getFullPath(NOTES_FILE_NAME); // ADDED
  console.log(`[Storage] Attempting to load notes from disk at: ${fullPath}`); // ADDED
  try {
    const raw = await readTextFile(NOTES_FILE_NAME, { baseDir: BaseDirectory.AppData });
    const parsed = JSON.parse(raw);
    console.log(`[Storage] Successfully loaded '${NOTES_FILE_NAME}' from disk at: ${fullPath}`); // ADDED
    writeFallback(NOTES_STORAGE_KEY, raw);
    if (!parsed || !Array.isArray(parsed.notes)) {
      console.warn(`[Storage] Loaded notes from '${fullPath}' but content was invalid or empty.`);
      return [];
    }
    return parsed.notes;
  } catch (error) {
    console.error(`[Storage] loadNotesFromDisk failed for '${fullPath}', reading localStorage fallback:`, error); // MODIFIED
    try {
      const fallbackRaw = readFallback(NOTES_STORAGE_KEY, '');
      if (!fallbackRaw) {
        console.log(`[Storage] localStorage fallback for '${NOTES_FILE_NAME}' was empty.`);
        return [];
      }
      const parsed = JSON.parse(fallbackRaw);
      if (!parsed || !Array.isArray(parsed.notes)) {
        console.warn(`[Storage] Loaded notes from localStorage fallback but content was invalid or empty.`);
        return [];
      }
      return parsed.notes;
    } catch (fallbackError) {
      console.error(`[Storage] Failed to parse localStorage fallback for '${NOTES_FILE_NAME}':`, fallbackError);
      return [];
    }
  }
}