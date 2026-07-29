import ModuleFactory from '@mediapipe/tasks-vision/vision_wasm_module_internal.js';

interface LocalVisionFileset {
  wasmLoaderPath: string;
  wasmBinaryPath: string;
}

interface MediaPipeRuntimeGlobal {
  Module?: unknown;
  ModuleFactory?: typeof ModuleFactory;
}

const MODULE_WASM_FILENAME = 'vision_wasm_module_internal.wasm';
const verifiedAssetPaths = new Map<string, Promise<void>>();

/**
 * MediaPipe's module worker dynamically imports its loader. Vite deliberately
 * blocks source-code imports from `public`, so the ES module loader is bundled
 * from the installed package while its large WASM binary remains a local
 * `/public/wasm` asset prepared by `npm run setup`.
 */
export async function createLocalVisionFileset(wasmRoot: string): Promise<LocalVisionFileset> {
  const normalizedRoot = wasmRoot.replace(/\/$/, '');
  const wasmBinaryPath = `${normalizedRoot}/${MODULE_WASM_FILENAME}`;
  await verifyWasmAsset(wasmBinaryPath);
  return {
    // The factory is installed directly before each task construction, so the
    // TaskRunner must not attempt another dynamic loader import.
    wasmLoaderPath: '',
    wasmBinaryPath,
  };
}

/** MediaPipe clears the global factory after each task construction. */
export function installVisionModuleFactory(): void {
  const runtime = globalThis as typeof globalThis & MediaPipeRuntimeGlobal;
  runtime.Module = undefined;
  runtime.ModuleFactory = ModuleFactory;
}

async function verifyWasmAsset(path: string): Promise<void> {
  let verification = verifiedAssetPaths.get(path);
  if (!verification) {
    verification = fetch(path, { method: 'HEAD', cache: 'no-store' }).then((response) => {
      if (!response.ok) {
        throw new Error(
          `MediaPipe WASM asset is missing at ${path} (HTTP ${response.status}). Run npm run setup.`,
        );
      }
    });
    verifiedAssetPaths.set(path, verification);
  }
  try {
    await verification;
  } catch (error) {
    verifiedAssetPaths.delete(path);
    throw error;
  }
}
