import {
  BaseDirectory,
  mkdir,
  readDir,
  readTextFile,
  remove,
  writeFile,
  writeTextFile
} from '@tauri-apps/plugin-fs';
import { appDataDir } from '@tauri-apps/api/path';

const VAULT_DIR = 'vault';
const NOTES_DIR = `${VAULT_DIR}/notes`;
const SETTINGS_FILE = `${VAULT_DIR}/settings.json`;
const THEMES_FILE = `${VAULT_DIR}/themes.json`;
const LEGACY_NOTES_FILE_NAME = 'notes.json';
const NOTES_STORAGE_KEY = 'quicknote-notes-fallback';
const SETTINGS_STORAGE_KEY = 'quicknote-settings-fallback';
const THEMES_STORAGE_KEY = 'quicknote-themes-fallback';

function writeFallback(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.error(`[Storage] localStorage fallback failed for '${key}':`, error);
  }
}

function readFallback(key, emptyValue) {
  try {
    return localStorage.getItem(key) ?? emptyValue;
  } catch (error) {
    console.error(`[Storage] localStorage fallback read failed for '${key}':`, error);
    return emptyValue;
  }
}

async function ensureDir(path) {
  try {
    await mkdir(path, { baseDir: BaseDirectory.AppData, recursive: true });
  } catch (error) {
    if (!String(error?.message || error).toLowerCase().includes('exists')) {
      throw error;
    }
  }
}

async function getFullPath(path) {
  const root = await appDataDir();
  return `${root}${path}`;
}

function safePathSegment(value, fallback = 'Untitled Note') {
  return String(value || fallback)
    .trim()
    .replace(/[<>:"|?*\u0000-\u001F]/g, '')
    .replace(/[. ]+$/g, '')
    .slice(0, 120) || fallback;
}

function splitNoteLocation(note) {
  const rawTitle = String(note?.title || 'Untitled Note').trim() || 'Untitled Note';
  const titleParts = rawTitle.split(/[\\/]+/).map((part) => part.trim()).filter(Boolean);
  const titleFromPath = titleParts.pop();
  const explicitFolder = String(note?.folder || '').split(/[\\/]+/).map((part) => part.trim()).filter(Boolean);
  const folderParts = [...explicitFolder, ...titleParts].map((part) => safePathSegment(part, 'Folder'));
  const title = safePathSegment(titleFromPath || rawTitle, 'Untitled Note');
  const relativePath = [...folderParts, `${title}.md`].join('/');

  return {
    title,
    folder: folderParts.join('/'),
    relativePath
  };
}

function joinAppDataPath(root, relativePath) {
  const separator = root.endsWith('\\') || root.endsWith('/') ? '' : '\\';
  return `${root}${separator}${relativePath.replace(/\//g, '\\')}`;
}

function encodeNoteMetadata(note, title, folder) {
  return `<!-- quicknote: ${JSON.stringify({
    id: note.id,
    title,
    folder,
    manuallyRenamed: note.manuallyRenamed || false,
    createdAt: note.createdAt || null,
    updatedAt: new Date().toISOString()
  })} -->`;
}

function parseNoteFile(raw, relativePath) {
  const text = String(raw || '');
  const match = text.match(/^<!--\s*quicknote:\s*(\{[\s\S]*?\})\s*-->\s*\n?/);
  let metadata = {};
  let content = text;

  if (match) {
    try {
      metadata = JSON.parse(match[1]);
      content = text.slice(match[0].length);
    } catch {
      metadata = {};
    }
  }

  const pathParts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
  const fileName = pathParts.pop() || 'Untitled Note.md';
  const fallbackTitle = fileName.replace(/\.md$/i, '');

  return {
    id: metadata.id || `note-${relativePath}`,
    title: metadata.title || fallbackTitle,
    folder: metadata.folder || pathParts.join('/'),
    manuallyRenamed: metadata.manuallyRenamed || false,
    path: relativePath,
    content
  };
}

async function listMarkdownFiles(dir = NOTES_DIR, prefix = '') {
  let entries = [];
  try {
    entries = await readDir(dir, { baseDir: BaseDirectory.AppData });
  } catch {
    return [];
  }

  const files = [];
  for (const entry of entries) {
    const name = entry.name;
    if (!name) continue;

    const childPrefix = prefix ? `${prefix}/${name}` : name;
    const childPath = `${dir}/${name}`;

    if (entry.isDirectory) {
      files.push(...await listMarkdownFiles(childPath, childPrefix));
      continue;
    }

    if (entry.isFile && /\.md$/i.test(name)) {
      files.push(childPrefix);
    }
  }

  return files;
}

async function listAllFiles(dir = NOTES_DIR, prefix = '') {
  let entries = [];
  try {
    entries = await readDir(dir, { baseDir: BaseDirectory.AppData });
  } catch {
    return [];
  }

  const files = [];
  for (const entry of entries) {
    const name = entry.name;
    if (!name) continue;

    const childPrefix = prefix ? `${prefix}/${name}` : name;
    const childPath = `${dir}/${name}`;

    if (entry.isDirectory) {
      files.push(...await listAllFiles(childPath, childPrefix));
      continue;
    }

    if (entry.isFile) {
      files.push(childPrefix);
    }
  }

  return files;
}

function extractAssetsFromContent(content) {
  const BLOCK_REGEX = /(code|math|latex|graph|pie|link|video|image|file|checklist|separator|md|markdown)\+block\{((?:\\}|[^}])*)\}/g;
  const BLOCK_NEWLINE_TOKEN = '__QN_BLOCK_NL__';
  const assets = new Set();
  let match;

  while ((match = BLOCK_REGEX.exec(content)) !== null) {
    const type = match[1];
    if (type !== 'image' && type !== 'file') continue;

    const blockContent = match[2].replace(/\\}/g, '}').replaceAll(BLOCK_NEWLINE_TOKEN, '\n');
    try {
      const data = JSON.parse(blockContent);
      if (data.relativePath) {
        assets.add(data.relativePath);
      }
    } catch {
      // Not JSON or missing relativePath
    }
  }
  return assets;
}

async function readJsonFile(path, fallbackKey, fallbackValue) {
  try {
    const raw = await readTextFile(path, { baseDir: BaseDirectory.AppData });
    writeFallback(fallbackKey, raw);
    return JSON.parse(raw);
  } catch {
    try {
      const fallbackRaw = readFallback(fallbackKey, '');
      return fallbackRaw ? JSON.parse(fallbackRaw) : fallbackValue;
    } catch {
      return fallbackValue;
    }
  }
}

async function writeJsonFile(path, fallbackKey, value) {
  const payload = JSON.stringify(value, null, 2);
  await ensureDir(VAULT_DIR);
  try {
    await writeTextFile(path, payload, { baseDir: BaseDirectory.AppData });
  } catch (error) {
    const fullPath = await getFullPath(path);
    console.error(`[Storage] Failed to write '${fullPath}', using fallback:`, error);
  }
  writeFallback(fallbackKey, payload);
}

export async function saveNotesToDisk(notes) {
  await ensureDir(NOTES_DIR);
  const persistedPaths = new Set();
  const persistedAssetDirs = new Set();

  for (const note of notes || []) {
    const { title, folder, relativePath } = splitNoteLocation(note);
    const filePath = `${NOTES_DIR}/${relativePath}`;
    const parentParts = relativePath.split('/').slice(0, -1);
    const noteDir = parentParts.join('/');
    
    if (parentParts.length > 0) {
      await ensureDir(`${NOTES_DIR}/${noteDir}`);
    }

    const content = `${encodeNoteMetadata(note, title, folder)}\n${String(note.content || '')}`;
    await writeTextFile(filePath, content, { baseDir: BaseDirectory.AppData });
    persistedPaths.add(relativePath);

    // Track asset directory
    const assetDirName = `${title}.assets`;
    const assetDirRelative = [noteDir, assetDirName].filter(Boolean).join('/');
    const assetDirPath = `${NOTES_DIR}/${assetDirRelative}`;
    persistedAssetDirs.add(assetDirRelative);

    // Cleanup unused assets within this note's asset folder
    try {
      const usedAssets = extractAssetsFromContent(note.content || '');
      const existingAssets = await readDir(assetDirPath, { baseDir: BaseDirectory.AppData }).catch(() => []);
      for (const entry of existingAssets) {
        if (!entry.isFile) continue;
        const assetRelativePath = `${assetDirRelative}/${entry.name}`;
        const fullAssetPath = `${assetDirPath}/${entry.name}`;
        if (!usedAssets.has(`${NOTES_DIR}/${assetRelativePath}`)) {
          await remove(fullAssetPath, { baseDir: BaseDirectory.AppData }).catch(() => {});
        }
      }
    } catch (error) {
      // Asset dir might not exist yet
    }
  }

  // Delete notes and asset folders that are no longer referenced
  const allFilesAndDirs = await readDir(NOTES_DIR, { baseDir: BaseDirectory.AppData, recursive: true }).catch(() => []);
  
  // We need a more robust way to find all files since readDir recursive might not be supported everywhere or might behave differently.
  // Re-using listAllFiles logic but adapted.
  const existingFiles = await listAllFiles();
  
  for (const path of existingFiles) {
    if (path.endsWith('.md')) {
      if (!persistedPaths.has(path)) {
        await remove(`${NOTES_DIR}/${path}`, { baseDir: BaseDirectory.AppData }).catch(() => {});
        // Also try to delete the .assets folder for this deleted note
        const assetDirForDeletedNote = path.replace(/\.md$/i, '.assets');
        await remove(`${NOTES_DIR}/${assetDirForDeletedNote}`, { baseDir: BaseDirectory.AppData, recursive: true }).catch(() => {});
      }
    } else {
      // It's likely an asset file. Check if its parent directory is still persisted.
      const pathParts = path.split('/');
      const fileName = pathParts.pop();
      const parentDir = pathParts.join('/');
      
      if (parentDir.endsWith('.assets')) {
        if (!persistedAssetDirs.has(parentDir)) {
          await remove(`${NOTES_DIR}/${parentDir}`, { baseDir: BaseDirectory.AppData, recursive: true }).catch(() => {});
        }
      }
    }
  }

  writeFallback(NOTES_STORAGE_KEY, JSON.stringify({ version: 2, notes }, null, 2));
}

export async function copyAssetToNoteFolder(note, file) {
  const { title, relativePath } = splitNoteLocation(note);
  const noteDir = relativePath.split('/').slice(0, -1).join('/');
  const safeFileName = safePathSegment(file?.name || 'attachment', 'attachment');
  const assetDirName = `${title}.assets`;
  const assetDir = [NOTES_DIR, noteDir, assetDirName].filter(Boolean).join('/');
  const storedName = `${Date.now()}-${safeFileName}`;
  const relativeAssetPath = [assetDir, storedName].join('/');

  await ensureDir(assetDir);
  const bytes = new Uint8Array(await file.arrayBuffer());
  await writeFile(relativeAssetPath, bytes, { baseDir: BaseDirectory.AppData });

  const appDataRoot = await appDataDir();
  return {
    src: joinAppDataPath(appDataRoot, relativeAssetPath),
    relativePath: relativeAssetPath,
    title: file.name || storedName,
    mime: file.type || '',
    size: file.size || 0
  };
}

export async function loadNotesFromDisk() {
  await ensureDir(NOTES_DIR);
  const markdownFiles = await listMarkdownFiles();

  if (markdownFiles.length > 0) {
    const notes = [];
    for (const relativePath of markdownFiles) {
      const raw = await readTextFile(`${NOTES_DIR}/${relativePath}`, { baseDir: BaseDirectory.AppData });
      notes.push(parseNoteFile(raw, relativePath));
    }
    return notes.sort((a, b) => String(a.path || '').localeCompare(String(b.path || '')));
  }

  try {
    const legacyRaw = await readTextFile(LEGACY_NOTES_FILE_NAME, { baseDir: BaseDirectory.AppData });
    const legacy = JSON.parse(legacyRaw);
    if (Array.isArray(legacy?.notes)) return legacy.notes;
  } catch {
    // No legacy JSON file available.
  }

  try {
    const fallbackRaw = readFallback(NOTES_STORAGE_KEY, '');
    if (!fallbackRaw) return [];
    const parsed = JSON.parse(fallbackRaw);
    return Array.isArray(parsed?.notes) ? parsed.notes : [];
  } catch {
    return [];
  }
}

export async function saveAppSettingsToDisk(settings) {
  await writeJsonFile(SETTINGS_FILE, SETTINGS_STORAGE_KEY, { version: 1, settings });
}

export async function loadAppSettingsFromDisk() {
  const payload = await readJsonFile(SETTINGS_FILE, SETTINGS_STORAGE_KEY, { settings: null });
  return payload?.settings || null;
}

export async function saveThemesToDisk(themes) {
  await writeJsonFile(THEMES_FILE, THEMES_STORAGE_KEY, { version: 1, themes });
}

export async function loadThemesFromDisk() {
  const payload = await readJsonFile(THEMES_FILE, THEMES_STORAGE_KEY, { themes: null });
  return payload?.themes || null;
}
