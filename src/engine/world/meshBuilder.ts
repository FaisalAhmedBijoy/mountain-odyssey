import { buildGridGeometry, type GridGeometryArgs, type GridGeometryData } from './gridGeometry';

export interface MeshBuilder {
  build(args: GridGeometryArgs): Promise<GridGeometryData>;
  dispose(): void;
}

/** Builds on the calling thread. Used by tests and as a fallback. */
export class SyncMeshBuilder implements MeshBuilder {
  async build(args: GridGeometryArgs): Promise<GridGeometryData> {
    return buildGridGeometry(args);
  }
  dispose(): void {}
}

interface Pending {
  resolve: (data: GridGeometryData) => void;
  reject: (err: Error) => void;
}

/** Builds terrain meshes off the main thread (spec §6.5). */
export class WorkerMeshBuilder implements MeshBuilder {
  private readonly worker: Worker;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;

  constructor() {
    this.worker = new Worker(new URL('./meshBuilder.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker.onmessage = (
      e: MessageEvent<{ id: number; data?: GridGeometryData; error?: string }>,
    ) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      if (e.data.data) p.resolve(e.data.data);
      else p.reject(new Error(e.data.error ?? 'Mesh worker failed'));
    };
    this.worker.onerror = (e) => this.rejectAll(new Error(e.message || 'Mesh worker crashed'));
  }

  build(args: GridGeometryArgs): Promise<GridGeometryData> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, args });
    });
  }

  dispose(): void {
    this.worker.terminate();
    this.rejectAll(new Error('Mesh builder disposed'));
  }

  private rejectAll(err: Error): void {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }
}
