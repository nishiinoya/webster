import { Injectable } from '@nestjs/common';
import { ProjectOperation, WebsterProjectManifest } from '@webster/shared';

@Injectable()
export class OperationApplierService {
  /**
   * Apply an operation to the current manifest.
   * If the operation carries a full scene snapshot, return it directly.
   * Otherwise return the manifest unchanged (granular ops are applied client-side).
   */
  apply(
    manifest: WebsterProjectManifest,
    op: ProjectOperation,
  ): WebsterProjectManifest {
    if (op.scene) {
      return op.scene;
    }
    return manifest;
  }
}
