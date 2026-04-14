import type { WebsterFileHandle } from "./projectFiles";

const databaseName = "webster.editor";
const databaseVersion = 1;
const storeName = "fileHandles";
const lastProjectKey = "lastProject";

type StoredProjectHandle = {
  filename: string;
  handle: WebsterFileHandle;
  id: typeof lastProjectKey;
  savedAt: string;
};

export async function rememberProjectFileHandle(handle: WebsterFileHandle) {
  const database = await openDatabase();

  await runStoreRequest(
    database
      .transaction(storeName, "readwrite")
      .objectStore(storeName)
      .put({
        filename: handle.name ?? "untitled.webster",
        handle,
        id: lastProjectKey,
        savedAt: new Date().toISOString()
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
