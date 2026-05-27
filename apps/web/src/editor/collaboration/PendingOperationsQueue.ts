import type { ProjectOperation } from "@webster/shared";

export class PendingOperationsQueue {
  private readonly operations: ProjectOperation[] = [];

  add(operation: ProjectOperation) {
    if (operation.phase !== "commit") {
      return;
    }

    if (this.operations.some((item) => item.clientOperationId === operation.clientOperationId)) {
      return;
    }

    this.operations.push(operation);
  }

  confirm(clientOperationId: string) {
    const index = this.operations.findIndex(
      (operation) => operation.clientOperationId === clientOperationId
    );

    if (index >= 0) {
      this.operations.splice(index, 1);
    }
  }

  clear() {
    this.operations.splice(0, this.operations.length);
  }

  list() {
    return [...this.operations];
  }

  get size() {
    return this.operations.length;
  }
}
