import { copyFile, mkdir, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task';
const MINIMUM_MODEL_BYTES = 1_000_000;

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = dirname(scriptDirectory);
const sourceWasmDirectory = join(
  projectDirectory,
  'node_modules',
  '@mediapipe',
  'tasks-vision',
  'wasm',
);
const publicWasmDirectory = join(projectDirectory, 'public', 'wasm');
const publicModelDirectory = join(projectDirectory, 'public', 'models');
const modelPath = join(publicModelDirectory, 'pose_landmarker_full.task');

async function isValidModel(path) {
  try {
    const details = await stat(path);
    return details.isFile() && details.size >= MINIMUM_MODEL_BYTES;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function copyWasmAssets() {
  let entries;
  try {
    entries = await readdir(sourceWasmDirectory, { withFileTypes: true });
  } catch (error) {
    throw new Error(
      `MediaPipe WASM source directory was not found at ${sourceWasmDirectory}. Run npm install first.`,
      { cause: error },
    );
  }

  const assets = entries.filter(
    (entry) => entry.isFile() && (entry.name.endsWith('.wasm') || entry.name.endsWith('.js')),
  );
  if (assets.length === 0) {
    throw new Error(`No MediaPipe WASM assets were found in ${sourceWasmDirectory}.`);
  }

  await mkdir(publicWasmDirectory, { recursive: true });
  for (const asset of assets) {
    await copyFile(join(sourceWasmDirectory, asset.name), join(publicWasmDirectory, asset.name));
  }
  console.log(`Copied ${assets.length} MediaPipe WASM assets to public/wasm.`);
}

async function downloadModel() {
  await mkdir(publicModelDirectory, { recursive: true });
  if (await isValidModel(modelPath)) {
    const details = await stat(modelPath);
    console.log(
      `Pose Landmarker Full model is already present (${(details.size / 1_000_000).toFixed(1)} MB).`,
    );
    return;
  }

  console.log('Downloading the official MediaPipe Pose Landmarker Full model…');
  const response = await fetch(MODEL_URL, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Model download failed: HTTP ${response.status} ${response.statusText}.`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < MINIMUM_MODEL_BYTES) {
    throw new Error(
      `Downloaded model is unexpectedly small (${bytes.byteLength} bytes); refusing to install it.`,
    );
  }

  const temporaryPath = `${modelPath}.download`;
  await writeFile(temporaryPath, bytes);
  try {
    await unlink(modelPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await rename(temporaryPath, modelPath);
  console.log(
    `Saved Pose Landmarker Full model (${(bytes.byteLength / 1_000_000).toFixed(1)} MB).`,
  );
}

async function main() {
  console.log('Preparing local MediaPipe assets…');
  await Promise.all([copyWasmAssets(), downloadModel()]);
  console.log('MediaPipe setup complete. All runtime assets are served locally.');
}

main().catch((error) => {
  console.error('MediaPipe setup failed.');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
