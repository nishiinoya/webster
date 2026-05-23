import { Injectable, Logger } from '@nestjs/common';
import { ProjectOperation, WebsterProjectManifest } from '@webster/shared';
import { applyPatch, deepClone } from 'fast-json-patch';

@Injectable()
export class OperationApplierService {
  private readonly logger = new Logger(OperationApplierService.name);

  /**
   * Apply an operation to the current manifest.
   * Priority:
   *   1. `op.scenePatch` (RFC 6902) — apply to the current manifest. This is
   *      the hot path for keystroke-level edits and saves a lot of bandwidth.
   *   2. `op.scene` — full snapshot fallback (first commit of a session, after
   *      resync, or when a patch would be too large to be worth it).
   *   3. Nothing changed — return manifest unchanged so the gateway still
   *      bumps version and broadcasts the action payload.
   */
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
        if (!allowSceneFallback || !op.scene) {
          throw err;
        }
        // intentional fall-through to the full scene fallback
      }
    }

    if (op.scene) {
      return op.scene;
    }

    return manifest;
  }
}
