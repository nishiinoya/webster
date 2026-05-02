/** Built-in and locally saved reusable Webster project templates. */
import { readScenePackageManifest } from "./ProjectPackage";

export type BuiltInProjectTemplate = {
  category: string;
  height: number;
  id: string;
  name: string;
  preview?: string;
  width: number;
};

export type UserProjectTemplateSummary = {
  createdAt: string;
  height: number;
  id: string;
  name: string;
  updatedAt: string;
  width: number;
};

export type UserProjectTemplate = UserProjectTemplateSummary & {
  projectBlob: Blob;
};

export type SaveUserProjectTemplateInput = {
  height: number;
  name: string;
  projectBlob: Blob;
  width: number;
};

const databaseName = "webster.editor.templates";
const databaseVersion = 1;
const storeName = "templates";

export const builtInProjectTemplates: BuiltInProjectTemplate[] = [
  {
    category: "Video",
    height: 720,
    id: "thumbnail-1280x720",
    name: "Thumbnail",
    preview: "16:9",
    width: 1280
  },
  {
    category: "Social",
    height: 1080,
    id: "instagram-post-1080x1080",
    name: "Instagram Post",
    preview: "Square",
    width: 1080
  },
  {
    category: "Social",
    height: 1920,
    id: "story-1080x1920",
    name: "Story",
    preview: "9:16",
    width: 1080
  },
  {
    category: "Print",
    height: 3000,
    id: "poster-2000x3000",
    name: "Poster",
    preview: "2:3",
    width: 2000
  },
  {
    category: "Presentation",
    height: 1080,
    id: "presentation-1920x1080",
    name: "Presentation",
    preview: "16:9",
    width: 1920
  },
  {
    category: "Print",
    height: 2100,
    id: "card-1500x2100",
    name: "Card",
    preview: "5:7",
    width: 1500
  }
];

export async function listUserProjectTemplates(): Promise<UserProjectTemplateSummary[]> {
  const database = await openDatabase();
  const templates = await runStoreRequest<UserProjectTemplate[]>(
    database.transaction(storeName, "readonly").objectStore(storeName).getAll()
  );

  database.close();

  return templates
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map(toTemplateSummary);
}

export async function getUserProjectTemplate(templateId: string) {
  const database = await openDatabase();
  const template = await runStoreRequest<UserProjectTemplate | undefined>(
    database.transaction(storeName, "readonly").objectStore(storeName).get(templateId)
  );

  database.close();

  return template ?? null;
}

export async function saveUserProjectTemplate(input: SaveUserProjectTemplateInput) {
  const database = await openDatabase();
  const now = new Date().toISOString();
  const template: UserProjectTemplate = {
    createdAt: now,
    height: input.height,
    id: crypto.randomUUID(),
    name: normalizeTemplateName(input.name),
    projectBlob: input.projectBlob,
    updatedAt: now,
    width: input.width
  };

  await runStoreRequest(
    database.transaction(storeName, "readwrite").objectStore(storeName).put(template)
  );
  database.close();

  return toTemplateSummary(template);
}

export async function importUserProjectTemplate(file: File) {
  const manifest = await readScenePackageManifest(file);
  const templateName = manifest.template?.name ?? stripProjectExtension(file.name);

  return saveUserProjectTemplate({
    height: Math.round(manifest.canvas.height),
    name: templateName,
    projectBlob: file,
    width: Math.round(manifest.canvas.width)
  });
}

export async function renameUserProjectTemplate(templateId: string, name: string) {
  const database = await openDatabase();
  const template = await runStoreRequest<UserProjectTemplate | undefined>(
    database.transaction(storeName, "readonly").objectStore(storeName).get(templateId)
  );

  if (!template) {
    database.close();
    return null;
  }

  const updatedTemplate: UserProjectTemplate = {
    ...template,
    name: normalizeTemplateName(name),
    updatedAt: new Date().toISOString()
  };

  await runStoreRequest(
    database.transaction(storeName, "readwrite").objectStore(storeName).put(updatedTemplate)
  );
  database.close();

  return toTemplateSummary(updatedTemplate);
}

export async function deleteUserProjectTemplate(templateId: string) {
  const database = await openDatabase();

  await runStoreRequest(
    database.transaction(storeName, "readwrite").objectStore(storeName).delete(templateId)
  );
  database.close();
}

function toTemplateSummary(template: UserProjectTemplate): UserProjectTemplateSummary {
  return {
    createdAt: template.createdAt,
    height: template.height,
    id: template.id,
    name: template.name,
    updatedAt: template.updatedAt,
    width: template.width
  };
}

function normalizeTemplateName(name: string) {
  return name.trim() || "Untitled template";
}

function stripProjectExtension(filename: string) {
  return filename.replace(/\.webster$/i, "").trim() || "Imported template";
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
