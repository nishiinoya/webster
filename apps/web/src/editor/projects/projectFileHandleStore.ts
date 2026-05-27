import type { WebsterFileHandle } from "./projectFiles";

const databaseName = "webster.editor";
const databaseVersion = 1;
const storeName = "fileHandles";
const lastProjectKey = "lastProject";
const recentProjectPrefix = "recentProject:";

type StoredProjectHandle = {
  filename: string;
  handle: WebsterFileHandle;
  id: string;
  savedAt: string;
};

export type RecentProjectHandle = {
  filename: string;
  handle: WebsterFileHandle;
  id: string;
  savedAt: string;
};

export async function rememberProjectFileHandle(handle: WebsterFileHandle) {
  const database = await openDatabase();
  const filename = handle.name ?? "untitled.webster";
  const savedAt = new Date().toISOString();
  const store = database.transaction(storeName, "readwrite").objectStore(storeName);

  await runStoreRequest(
    store.put({
      filename,
      handle,
      id: lastProjectKey,
      savedAt
    } satisfies StoredProjectHandle)
  );
  await runStoreRequest(
    store.put({
      filename,
      handle,
      id: `${recentProjectPrefix}${filename}`,
      savedAt
    } satisfies StoredProjectHandle)
  );
  database.close();
}

export async function readRememberedProjectFileHandle() {
  const database = await openDatabase();
  const stored = await runStoreRequest<StoredProjectHandle | undefined>(
    database.transaction(storeName, "readonly").objectStore(storeName).get(lastProjectKey)
  );

  database.close();
  return stored?.handle ?? null;
}

export async function listRememberedProjectFiles() {
  const database = await openDatabase();
  const stored = await runStoreRequest<StoredProjectHandle[]>(
    database.transaction(storeName, "readonly").objectStore(storeName).getAll()
  );

  database.close();

  return stored
    .filter((project) => project.id.startsWith(recentProjectPrefix))
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt))
    .map((project) => ({
      filename: project.filename,
      handle: project.handle,
      id: project.id,
      savedAt: project.savedAt
    } satisfies RecentProjectHandle));
}

export async function forgetRememberedProjectFileHandle() {
  const database = await openDatabase();

  await runStoreRequest(
    database.transaction(storeName, "readwrite").objectStore(storeName).delete(lastProjectKey)
  );
  database.close();
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: "id" });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function runStoreRequest<T = unknown>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
