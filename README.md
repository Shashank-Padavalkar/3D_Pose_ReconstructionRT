# Local Pose Lab

Local Pose Lab is a webcam-based, real-time 3D human-pose reconstruction demo. It runs MediaPipe Pose Landmarker Full entirely in the browser, filters and constrains the detected skeleton, and drives an interactive procedural Three.js mannequin. The interface pairs a live 2D landmark overlay with a rotatable 3D view, calibration, approximate movement metrics, and pose-only recording/playback.

This is an engineering visualization. Monocular 3D depth and all biomechanical measurements are approximate; they are not motion-capture, clinical, coaching, or impact-analysis data.

## Demo capabilities

- Local webcam capture with actual device resolution and frame-rate reporting.
- MediaPipe worker inference with transferable `ImageBitmap` frames and main-thread fallback.
- Latest-frame-wins scheduling, so slow inference never creates a growing frame queue.
- Mirror-correct 2D overlay without swapping anatomical left and right.
- Raw, One-Euro-filtered, and fixed-length constrained pose representations.
- Short confidence-aware velocity prediction instead of snapping missing joints to the origin.
- Stored body-proportion calibration with optional left/right symmetry.
- Procedural mannequin and lightweight skeleton modes in an orbitable Three.js scene.
- Anchored and explicitly approximate camera-relative root modes.
- Floor grounding, with optional experimental planted-foot locking.
- Approximate pelvis/chest rotation, X-factor, joint flexion, tilt, and normalized sway.
- Pose-only recording, validated JSON import/export, seeking, interpolation, loop, and speed control.
- Local PNG capture of the 3D canvas.

## Architecture summary

The camera controller owns the media stream and video-frame callback. A worker-first inference adapter transfers one bitmap at a time to MediaPipe. Results are converted once from MediaPipe coordinates, enriched with derived joints, confidence-gated, One-Euro filtered, predicted through short dropouts, constrained to calibrated segment lengths, oriented, grounded, and measured. High-frequency poses stay in refs and imperative renderers; React receives throttled status and metric snapshots. Recording stores only serializable pose values—never video pixels.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full data flow.

## Technology stack

- Vite
- React and strict TypeScript
- Three.js with OrbitControls
- MediaPipe Tasks Vision / Pose Landmarker Full
- Web Workers and browser media APIs
- Vitest
- ESLint and Prettier
- Plain CSS

There is no backend, Python runtime, cloud database, analytics SDK, or upload path.

## Requirements

- Node.js 20 or newer (the installed Vite version may require a newer supported Node release).
- npm.
- A modern browser with WebGL 2, `getUserMedia`, WebAssembly, and module-worker support for the fastest path.
- A camera and permission to use it.
- HTTPS in production. Browsers also allow camera access from `http://localhost` during development.

## Installation

```bash
npm install
npm run setup
npm run dev
```

Open the local URL printed by Vite. `npm run setup` must be run after dependency installation and before the first camera session.

## MediaPipe model setup

`npm run setup` runs the cross-platform Node script at `scripts/setup-mediapipe.mjs`. It:

1. Creates `public/models` and `public/wasm`.
2. Copies the installed Tasks Vision JavaScript/WASM runtime files into `public/wasm`.
3. Downloads the official float16 Pose Landmarker Full task bundle to `public/models/pose_landmarker_full.task`.
4. Reuses an existing model when it passes a minimum-size validity check.

The model download comes directly from the official Google-hosted MediaPipe model bucket. Runtime inference does not contact that bucket; Vite serves the copied files locally.

## Development commands

```bash
npm run dev          # Vite development server
npm run test         # one Vitest run
npm run test:watch   # Vitest watch mode
npm run lint         # ESLint
npm run format       # Prettier check
```

## Production build

```bash
npm run build
npm run preview
```

Deploy the generated `dist` directory to an HTTPS origin. Keep `/models` and `/wasm` at the same public paths used in development.

## Browser and camera requirements

Chromium-based desktop browsers provide the most predictable combination of transferable `ImageBitmap`, module workers, MediaPipe GPU delegation, webcam frame callbacks, and WebGL. Firefox and Safari can use the same app, but browser-specific worker or GPU limitations may select CPU or main-thread inference automatically. The UI reports the selected mode and delegate.

The app requests an ideal 1280×720 stream at 60 FPS from the user-facing camera. Those values are preferences, not guarantees. The actual track settings are displayed after startup. A full-body view, even lighting, low motion blur, and a camera roughly at torso height improve stability.

## Calibration

1. Start the camera and keep the full body—including both feet and wrists—inside the view.
2. Select **Calibrate**.
3. During the three-second countdown, adopt a neutral upright stance.
4. Hold still while the application gathers valid, high-confidence samples.

Segment medians are saved to local storage. Recalibration replaces the profile; **Reset calibration** removes it. Optional body height changes only visual scale and does not make world landmarks metric-accurate.

## Recording and playback

Select **Record** while live tracking is active. The recorder stores processed landmarks, confidence values, root translation, calibration metadata, and derived metrics. It never stores webcam images. After stopping, use the timeline to play, pause, seek, loop, or select 0.25×, 0.5×, 1×, or 2× speed.

**Export JSON** downloads the current recording. **Import JSON** validates the schema, version, timestamps, finite numeric values, and frame structure before loading it. Playback temporarily drives the 2D/3D displays; pausing or finishing returns control to live tracking when the camera is still active.

## Troubleshooting

### Camera permission denied

Use the browser’s site controls to allow camera access, then reload. Corporate policies and operating-system privacy settings can also block access. The app cannot bypass those controls.

### Blank video

Confirm that another application is not exclusively using the camera. Stop and restart the camera, try another device in the browser’s site settings, and check the actual stream status shown at the bottom.

### Missing model

Run `npm run setup` and verify that `public/models/pose_landmarker_full.task` exists and is larger than 1 MB. A production host must serve `/models/pose_landmarker_full.task` without redirecting it to an HTML fallback page.

### Missing WASM

Run `npm install` and then `npm run setup`. Verify that `.js` and `.wasm` files exist in `public/wasm` and are served with successful HTTP responses. Restrictive Content Security Policy headers can prevent WebAssembly initialization.

### Worker initialization failure

The app reports the worker error and switches once to main-thread inference. If both modes fail, inspect the browser console for CSP, module-worker, model, or WASM errors. Do not create a second inference loop manually.

### Low FPS

Close other camera/GPU applications, reduce browser zoom or display resolution, improve lighting, and try a Chromium desktop browser. CPU fallback is expected to be slower. Rendering pixel ratio is deliberately capped at 2.

### Mirrored left/right

The mirror control affects only the displayed video and overlay. MediaPipe input and the mannequin remain anatomical. If the 3D body itself is reversed, return the developer axis-inversion controls to their defaults.

### Model faces the wrong direction

Open advanced settings and use the X/Y/Z developer inversion controls to diagnose device- or browser-specific coordinate behavior. The standard transform is X unchanged, Y inverted, and Z inverted.

### Avatar floating

Enable foot grounding and keep ankles, heels, and toes visible. Occluded feet produce a less reliable floor estimate. Experimental foot locking should be disabled if it pulls the pose unnaturally.

### Full body not detected

Move farther from the camera, keep both feet and wrists in frame, improve front lighting, avoid loose occluding objects, and face the camera during calibration.

### WebGL unavailable

Enable hardware acceleration, update graphics drivers, and check the browser’s WebGL status page. The video/2D pipeline may still operate, but the 3D view requires WebGL.

## Privacy

All camera frames, landmarks, calibration values, screenshots, and recordings stay in the browser. The application has no server endpoint and no analytics. A network request occurs only when the developer runs `npm run setup` to download the public MediaPipe model; normal runtime inference is local. Exporting JSON or PNG creates a local browser download.

## Known limitations

- MediaPipe world landmarks are not guaranteed to be metric-accurate.
- A single camera cannot resolve depth uniquely.
- Occlusion, motion blur, lighting, clothing, and framing can cause incorrect depth or temporary tracking loss.
- Joint locations do not fully describe axial body-segment twist.
- Approximate root movement is camera-relative and strongly clamped, not a recovered world trajectory.
- Ordinary webcams are not appropriate for impact analysis or motion-capture-grade biomechanics.

See [docs/LIMITATIONS.md](docs/LIMITATIONS.md) for detail.

## Future improvements

Potential follow-up work includes synchronized pose/video recording, GLB humanoid retargeting, calibrated camera import, WebGPU benchmarking, domain-specific motion priors, motion trails, CSV metrics, and a pose-quality score. These are deliberately outside the required local demo.
#   3 D _ P o s e _ R e c o n s t r u c t i o n R T  
 