import { buildGridGeometry, type GridGeometryArgs } from './gridGeometry';

self.onmessage = (e: MessageEvent<{ id: number; args: GridGeometryArgs }>) => {
  const { id, args } = e.data;
  try {
    const data = buildGridGeometry(args);
    const transfer = [data.positions, data.normals, data.colors, data.indices].map(
      (a) => a.buffer as ArrayBuffer,
    );
    if (data.uvs) transfer.push(data.uvs.buffer as ArrayBuffer);
    self.postMessage({ id, data }, { transfer });
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
