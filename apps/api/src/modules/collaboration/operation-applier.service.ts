import { Injectable, Logger } from '@nestjs/common';
import { ProjectOperation, WebsterProjectManifest } from '@webster/shared';
import { applyPatch, deepClone } from 'fast-json-patch';

@Injectable()
export class OperationApplierService {
  private readonly logger = new Logger(OperationApplierService.name);

  apply(
    manifest: WebsterProjectManifest,
    op: ProjectOperation,
    options: { allowSceneFallback?: boolean } = {},
  ): WebsterProjectManifest {
    const allowSceneFallback = options.allowSceneFallback ?? true;

    if (op.scenePatch && op.scenePatch.length > 0) {
      try {
        const cloned = deepClone(manifest) as WebsterProjectManifest;
        const result = applyPatch(
          cloned,
          op.scenePatch as never[],
          false,
          true,
        );
        return result.newDocument as WebsterProjectManifest;
      } catch (err) {
        this.logger.warn(
          `scenePatch failed for op ${op.clientOperationId}: ${(err as Error).message}`,
        );
        const maskFallback = applyMaskSnapshotFallback(manifest, op);

        if (maskFallback) {
          return maskFallback;
        }

        if (!allowSceneFallback || !op.scene) {
          throw err;
        }
      }
    }

    if (op.scene) {
      return op.scene;
    }

    return manifest;
  }
}

type MaskSnapshotPayload = {
  layerId: string;
  mask: Record<string, unknown> | null;
};

function applyMaskSnapshotFallback(
  manifest: WebsterProjectManifest,
  op: ProjectOperation,
): WebsterProjectManifest | null {
  const snapshots = readMaskSnapshots(op.payload?.maskSnapshots);

  if (!snapshots.length) {
    return null;
  }

  const cloned = deepClone(manifest) as WebsterProjectManifest;
  let didApply = false;

  for (const snapshot of snapshots) {
    const layer = cloned.layers.find((candidate) => candidate.id === snapshot.layerId);

    if (!layer) {
      continue;
    }

    layer.mask = snapshot.mask;
    didApply = true;
  }

  return didApply ? cloned : null;
}

function readMaskSnapshots(value: unknown): MaskSnapshotPayload[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((snapshot) => {
      if (!snapshot || typeof snapshot !== 'object') {
        return null;
      }

      const layerId = (snapshot as { layerId?: unknown }).layerId;
      const mask = readSerializedMask((snapshot as { mask?: unknown }).mask);

      return typeof layerId === 'string' ? { layerId, mask } : null;
    })
    .filter((snapshot): snapshot is MaskSnapshotPayload => Boolean(snapshot));
}

function readSerializedMask(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const mask = value as Record<string, unknown>;

  return typeof mask.data === 'string' &&
    typeof mask.enabled === 'boolean' &&
    typeof mask.height === 'number' &&
    typeof mask.id === 'string' &&
    typeof mask.width === 'number'
    ? {
        data: mask.data,
        enabled: mask.enabled,
        height: mask.height,
        id: mask.id,
        width: mask.width,
      }
    : null;
}
