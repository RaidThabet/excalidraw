/**
 * Persistent store for the user's own SVG icons.
 *
 * IndexedDB rather than localStorage: dropping a folder of icons routinely runs
 * to megabytes of markup, and localStorage's ~5MB quota is shared with the
 * scene itself — filling it would start costing people their drawings.
 */
import { sanitizeSvg } from "./svgIcon";

export type LibraryIcon = {
  /** stable id: the source path, which is unique within a drop */
  id: string;
  name: string;
  /** folder path the icon came from; "" for icons dropped at the top level */
  category: string;
  svg: string;
};

const DB_NAME = "excalidraw-icon-library";
const DB_VERSION = 1;
const STORE = "icons";

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("category", "category", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const tx = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = run(transaction.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
};

export const listLibraryIcons = (): Promise<LibraryIcon[]> =>
  tx<LibraryIcon[]>("readonly", (store) => store.getAll());

export const putLibraryIcons = async (icons: LibraryIcon[]): Promise<void> => {
  if (icons.length === 0) {
    return;
  }
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      for (const icon of icons) {
        store.put(icon);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
};

export const deleteLibraryIcon = (id: string): Promise<void> =>
  tx<undefined>("readwrite", (store) => store.delete(id)).then(() => undefined);

export const clearLibraryCategory = async (
  category: string,
): Promise<number> => {
  const all = await listLibraryIcons();
  const doomed = all.filter((icon) => icon.category === category);
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      for (const icon of doomed) {
        store.delete(icon.id);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
  return doomed.length;
};

/** "icons/brand/logos/acme.svg" -> { name: "acme", category: "brand/logos" } */
export const describeIconPath = (
  filePath: string,
): { name: string; category: string } => {
  const parts = filePath.split("/").filter((part) => part && part !== ".");
  const file = parts.pop() ?? filePath;
  const name = file.replace(/\.svg$/i, "");
  // the drop's own root folder carries no meaning as a category
  return { name, category: parts.slice(1).join("/") };
};

export type IconImportResult = {
  imported: LibraryIcon[];
  /** paths that were not valid SVG after sanitization */
  rejected: string[];
};

const isSvgPath = (path: string) => /\.svg$/i.test(path);

/**
 * Walks a dropped DataTransfer, recursing through nested folders, and returns
 * every SVG found keyed by its folder path. Entries must be collected
 * synchronously — DataTransferItemList is emptied as soon as the drop handler
 * yields to the event loop.
 */
export const collectDroppedSvgs = async (
  dataTransfer: DataTransfer,
): Promise<{ path: string; text: string }[]> => {
  const roots: any[] = [];
  for (const item of Array.from(dataTransfer.items)) {
    const entry = (item as any).webkitGetAsEntry?.();
    if (entry) {
      roots.push(entry);
    }
  }

  const files: { path: string; text: string }[] = [];

  const readEntry = (entry: any, prefix: string): Promise<void> =>
    new Promise((resolve) => {
      if (entry.isFile) {
        entry.file(
          async (file: File) => {
            const path = `${prefix}${entry.name}`;
            if (isSvgPath(path)) {
              files.push({ path, text: await file.text() });
            }
            resolve();
          },
          () => resolve(),
        );
        return;
      }
      if (!entry.isDirectory) {
        resolve();
        return;
      }
      const reader = entry.createReader();
      const children: any[] = [];
      const readBatch = () =>
        reader.readEntries(
          async (batch: any[]) => {
            // readEntries yields at most 100 entries per call
            if (batch.length > 0) {
              children.push(...batch);
              readBatch();
              return;
            }
            for (const child of children) {
              await readEntry(child, `${prefix}${entry.name}/`);
            }
            resolve();
          },
          () => resolve(),
        );
      readBatch();
    });

  for (const root of roots) {
    await readEntry(root, "");
  }

  // a plain multi-file drop (no folders) still needs handling
  if (roots.length === 0) {
    for (const file of Array.from(dataTransfer.files)) {
      if (isSvgPath(file.name)) {
        files.push({ path: file.name, text: await file.text() });
      }
    }
  }

  return files;
};

/** Sanitizes and stores a batch of collected SVG files. */
export const importIcons = async (
  files: { path: string; text: string }[],
): Promise<IconImportResult> => {
  const imported: LibraryIcon[] = [];
  const rejected: string[] = [];

  for (const { path, text } of files) {
    const svg = sanitizeSvg(text);
    if (!svg) {
      rejected.push(path);
      continue;
    }
    const { name, category } = describeIconPath(path);
    imported.push({ id: path, name, category, svg });
  }

  await putLibraryIcons(imported);
  return { imported, rejected };
};

/** Groups icons by category, each group's icons sorted by name. */
export const groupIconsByCategory = (
  icons: LibraryIcon[],
): { category: string; icons: LibraryIcon[] }[] => {
  const groups = new Map<string, LibraryIcon[]>();
  for (const icon of icons) {
    const list = groups.get(icon.category) ?? [];
    list.push(icon);
    groups.set(icon.category, list);
  }
  return [...groups.entries()]
    .map(([category, list]) => ({
      category,
      icons: list.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
};
