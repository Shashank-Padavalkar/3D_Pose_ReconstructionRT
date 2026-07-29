import { Material, Object3D, Texture, WebGLRenderer, type BufferGeometry } from 'three';

function disposeTextureProperties(material: Material, disposedTextures: Set<Texture>): void {
  const properties = Object.values(material as unknown as Record<string, unknown>);
  for (const value of properties) {
    if (value instanceof Texture) {
      const texture = value as Texture;
      if (disposedTextures.has(texture)) continue;
      disposedTextures.add(texture);
      texture.dispose();
    }
  }
}

export function disposeMaterial(
  material: Material | readonly Material[],
  disposedMaterials: Set<Material> = new Set<Material>(),
  disposedTextures: Set<Texture> = new Set<Texture>(),
): void {
  const materials: readonly Material[] = material instanceof Material ? [material] : material;
  for (const item of materials) {
    if (disposedMaterials.has(item)) continue;
    disposedMaterials.add(item);
    disposeTextureProperties(item, disposedTextures);
    item.dispose();
  }
}

export function disposeObject3D(root: Object3D): void {
  const disposedGeometries = new Set<BufferGeometry>();
  const disposedMaterials = new Set<Material>();
  const disposedTextures = new Set<Texture>();

  root.traverse((object) => {
    const renderable = object as Object3D & {
      geometry?: BufferGeometry;
      material?: Material | Material[];
    };

    if (renderable.geometry && !disposedGeometries.has(renderable.geometry)) {
      disposedGeometries.add(renderable.geometry);
      renderable.geometry.dispose();
    }
    if (renderable.material) {
      disposeMaterial(renderable.material, disposedMaterials, disposedTextures);
    }
  });
}

export function disposeRenderer(renderer: WebGLRenderer, removeCanvas = true): void {
  renderer.renderLists.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  if (removeCanvas) renderer.domElement.remove();
}
