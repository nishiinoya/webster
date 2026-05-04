import type { ChangeEvent, DragEvent } from "react";
import { useRef, useState } from "react";
import type { Imported3DModel } from "../../import3d/Imported3DModel";
import { import3DModelPackage } from "../../import3d/import3DModel";
import { cn } from "../classNames";

type Object3DImportDialogProps = {
  onClose: () => void;
  onUseModel: (model: Imported3DModel) => void;
  replaceLayerName?: string | null;
};

const acceptedModelFiles =
  ".obj,.mtl,.zip,.glb,.gltf,.bin,.stl,.ply,.fbx,.dae,.3ds,image/*,text/plain,application/zip,model/gltf+json,model/gltf-binary";

export function Object3DImportDialog({
  onClose,
  onUseModel,
  replaceLayerName
}: Object3DImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [loadedModel, setLoadedModel] = useState<Imported3DModel | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canLoad = files.length > 0 && !isLoading;
  const canUse = Boolean(loadedModel) && !isLoading;

  function handleFiles(nextFiles: FileList | File[]) {
    setFiles(Array.from(nextFiles));
    setLoadedModel(null);
    setError(null);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      handleFiles(event.target.files);
      event.target.value = "";
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);

    if (event.dataTransfer.files.length > 0) {
      handleFiles(event.dataTransfer.files);
    }
  }

  async function loadSelectedPackage() {
    if (!canLoad) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setLoadedModel(null);

    try {
      setLoadedModel(await import3DModelPackage(files));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "The selected model package could not be loaded."
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-6" role="presentation">
      <div
        aria-modal="true"
        className="grid max-h-[min(780px,calc(100vh-48px))] w-[min(760px,100%)] gap-4 overflow-auto rounded-lg border border-[#383e46] bg-[#17191d] p-[18px] shadow-[0_24px_48px_rgba(0,0,0,0.42)]"
        role="dialog"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="m-0 text-lg font-bold text-[#f2f4f7]">
              {replaceLayerName ? "Change 3D model" : "Import 3D model"}
            </h2>
            <p className="m-0 mt-1 text-xs font-bold text-[#8b929b]">
              OBJ/MTL, ZIP packages, GLB, glTF, STL, and PLY
            </p>
          </div>

          <button
            aria-label="Close 3D import dialog"
            className={dialogButtonClass}
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <section className={dialogSectionClass} aria-label="Model package files">
          <div className="flex items-center justify-between gap-3">
            <h3 className={dialogSectionTitleClass}>Package files</h3>

            <button
              className={dialogButtonClass}
              disabled={isLoading}
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              Choose files...
            </button>
          </div>

          <div
            className={cn(
              "grid min-h-[134px] place-items-center rounded-lg border border-dashed border-[#30353d] bg-[#101113] p-4 text-center",
              isDragging && "border-[#4aa391] bg-[#10231f]"
            )}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setIsDragging(false);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <div className="grid gap-2">
              <strong className="text-[13px] text-[#eef1f4]">
                {files.length > 0
                  ? `${files.length} file${files.length === 1 ? "" : "s"} selected`
                  : "Drop model package files"}
              </strong>

              {files.length > 0 ? (
                <div className="flex max-w-[600px] flex-wrap justify-center gap-1.5">
                  {files.slice(0, 10).map((file) => (
                    <span
                      className="max-w-[190px] truncate rounded-md border border-[#30353d] bg-[#202329] px-2 py-1 text-[11px] font-bold text-[#c9cdd2]"
                      key={`${file.name}-${file.size}-${file.lastModified}`}
                      title={file.name}
                    >
                      {file.name}
                    </span>
                  ))}

                  {files.length > 10 ? (
                    <span className="rounded-md border border-[#30353d] bg-[#202329] px-2 py-1 text-[11px] font-bold text-[#8b929b]">
                      +{files.length - 10}
                    </span>
                  ) : null}
                </div>
              ) : (
                <span className="text-[12px] font-bold text-[#8b929b]">
                  .obj .mtl .zip .glb .gltf .bin .stl .ply .fbx .dae .3ds and images
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button className={dialogButtonClass} onClick={onClose} type="button">
              Cancel
            </button>

            <button
              className={dialogButtonClass}
              disabled={!canLoad}
              onClick={() => void loadSelectedPackage()}
              type="button"
            >
              {isLoading ? "Loading..." : "Load"}
            </button>
          </div>

          <input
            ref={fileInputRef}
            accept={acceptedModelFiles}
            className="absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0_0_0_0)]"
            multiple
            onChange={handleInputChange}
            type="file"
          />
        </section>

        {error ? (
          <div className="rounded-lg border border-[#6f3434] bg-[#261616] p-3 text-[13px] font-bold text-[#ffb9b9]">
            {error}
          </div>
        ) : null}

        {loadedModel ? <ImportSummary model={loadedModel} /> : null}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            className={dialogButtonClass}
            disabled={!canUse}
            onClick={() => {
              if (loadedModel) {
                onUseModel(loadedModel);
              }
            }}
            type="button"
          >
            {replaceLayerName ? "Replace selected layer" : "Add as layer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportSummary({ model }: { model: Imported3DModel }) {
  return (
    <section className={dialogSectionClass} aria-label="Import summary">
      <div className="grid gap-1.5 text-xs font-bold text-[#c9cdd2] sm:grid-cols-3">
        <span>Model: {model.name}</span>
        <span>Format: {model.sourceFormat.toUpperCase()}</span>
        <span>Parts: {model.stats.partCount}</span>
        <span>Materials: {model.stats.materialCount}</span>
        <span>Textures: {model.stats.textureCount}</span>
        <span>Assigned maps: {model.stats.assignedTextureCount}</span>
        <span>Vertices: {model.stats.vertexCount}</span>
        <span>Triangles: {model.stats.triangleCount}</span>
      </div>

      <NameList
        emptyLabel="No material names found"
        names={model.summary.materialNames}
        title="Materials"
      />

      <NameList
        emptyLabel="No texture files loaded"
        names={model.summary.loadedTextureNames}
        title="Loaded textures"
      />

      <NameList
        emptyLabel="No texture maps assigned"
        names={model.summary.assignedTextureMaps}
        title="Assigned texture maps"
      />

      <NameList
        emptyLabel="No unassigned texture files"
        names={model.summary.unassignedTextureNames}
        title="Unassigned textures"
      />

      {model.summary.guessedTextureMaps.length > 0 ? (
        <NameList
          emptyLabel=""
          names={model.summary.guessedTextureMaps}
          title="Guessed assignments"
        />
      ) : null}

      {model.warnings.length > 0 ? (
        <NameList emptyLabel="" names={model.warnings} title="Warnings" />
      ) : null}
    </section>
  );
}

function NameList({
  emptyLabel,
  names,
  title
}: {
  emptyLabel: string;
  names: string[];
  title: string;
}) {
  return (
    <div className="grid gap-1">
      <strong className="text-[11px] font-extrabold uppercase text-[#8b929b]">
        {title}
      </strong>

      {names.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {names.map((name, index) => (
            <span
              className="max-w-[320px] truncate rounded-md border border-[#30353d] bg-[#111317] px-2 py-1 text-[11px] font-bold text-[#c9cdd2]"
              key={`${name}-${index}`}
              title={name}
            >
              {name}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-[12px] font-bold text-[#6f7680]">
          {emptyLabel}
        </span>
      )}
    </div>
  );
}

const dialogButtonClass =
  "rounded-lg border border-[#333941] bg-[#202329] px-3 py-2 font-bold text-[#eef1f4] hover:border-[#4aa391] hover:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731] disabled:cursor-not-allowed disabled:text-[#6f7680] disabled:hover:border-[#333941] disabled:hover:bg-[#202329]";

const dialogSectionClass =
  "grid gap-3 rounded-lg border border-[#30353d] bg-[#111317] p-3";

const dialogSectionTitleClass =
  "m-0 text-[13px] font-extrabold uppercase tracking-normal text-[#9aa1ab]";
