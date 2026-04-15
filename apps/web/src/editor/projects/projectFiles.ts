import { EditorApp } from "../app/EditorApp";
import { rememberProjectFileHandle } from "./projectFileHandleStore";

export type WebsterFileHandle = {
  getFile?: () => Promise<File>;
  name?: string;
  createWritable: () => Promise<{
    close: () => Promise<void>;
    write: (data: Blob) => Promise<void>;
  }>;
  queryPermission?: (descriptor: WebsterFilePermissionDescriptor) => Promise<PermissionState>;
  requestPermission?: (descriptor: WebsterFilePermissionDescriptor) => Promise<PermissionState>;
};

type SaveFilePickerWindow = Window &
  typeof globalThis & {
    showOpenFilePicker?: (options: {
      excludeAcceptAllOption?: boolean;
      multiple?: boolean;
      types: Array<{
        accept: Record<string, string[]>;
        description: string;
      }>;
    }) => Promise<WebsterFileHandle[]>;
    showSaveFilePicker?: (options: {
      suggestedName: string;
      types: Array<{
        accept: Record<string, string[]>;
        description: string;
      }>;
    }) => Promise<WebsterFileHandle>;
  };

type WebsterFilePermissionDescriptor = {
  mode: "read" | "readwrite";
};

export type PickedProjectFile = {
  file: File;
  handle: WebsterFileHandle | null;
};

export async function saveProjectFile(
  editorApp: EditorApp,
  projectFileHandleRef: { current: WebsterFileHandle | null },
  forceNewPath = false,
  suggestedName = "untitled.webster"
) {
  if (forceNewPath || !projectFileHandleRef.current) {
    projectFileHandleRef.current = await getProjectFileHandle(suggestedName);
  }

  const blob = await runAfterPaint(() => editorApp.exportProjectFile());

  if (!projectFileHandleRef.current) {
    downloadBlob(blob, suggestedName);
    saveProjectMetadata(suggestedName, false);
    return;
  }

  if (!(await ensureWritePermission(projectFileHandleRef.current))) {
    projectFileHandleRef.current = await getProjectFileHandle(suggestedName);
  }

  if (!projectFileHandleRef.current) {
    downloadBlob(blob, suggestedName);
    saveProjectMetadata(suggestedName, false);
    return;
  }

  const writable = await projectFileHandleRef.current.createWritable();

  await writable.write(blob);
  await writable.close();
  await rememberProjectFileHandle(projectFileHandleRef.current).catch(() => undefined);
  saveProjectMetadata(projectFileHandleRef.current.name ?? "untitled.webster", true);
}

export function canPickProjectFileHandle() {
  return Boolean((window as SaveFilePickerWindow).showOpenFilePicker);
}

export async function pickProjectFileWithHandle(): Promise<PickedProjectFile | null> {
  const openPicker = (window as SaveFilePickerWindow).showOpenFilePicker;

  if (!openPicker) {
    return null;
  }

  const [handle] = await openPicker({
    excludeAcceptAllOption: false,
    multiple: false,
    types: [
      {
        accept: {
          "application/vnd.webster.project": [".webster"],
          "application/zip": [".webster"]
        },
        description: "Webster project"
      }
    ]
  });

  if (!handle?.getFile) {
    return null;
  }

  return {
    file: await handle.getFile(),
    handle
  };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function getProjectFileHandle(suggestedName: string) {
  const savePicker = (window as SaveFilePickerWindow).showSaveFilePicker;

  if (!savePicker) {
    return null;
  }

  return savePicker({
    suggestedName,
    types: [
      {
        accept: {
          "application/vnd.webster.project": [".webster"],
          "application/zip": [".webster"]
        },
        description: "Webster project"
      }
    ]
  });
}

async function ensureWritePermission(handle: WebsterFileHandle) {
  if (!handle.queryPermission || !handle.requestPermission) {
    return true;
  }

  const descriptor: WebsterFilePermissionDescriptor = { mode: "readwrite" };
  const currentPermission = await handle.queryPermission(descriptor);

  if (currentPermission === "granted") {
    return true;
  }

  return (await handle.requestPermission(descriptor)) === "granted";
}

function runAfterPaint<T>(task: () => Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    window.setTimeout(() => {
      task().then(resolve, reject);
    }, 0);
  });
}

function saveProjectMetadata(filename: string, hasWritableHandle: boolean) {
  localStorage.setItem(
    "webster.editor.projectSave",
    JSON.stringify({
      filename,
      hasWritableHandle,
      savedAt: new Date().toISOString()
    })
  );
}
