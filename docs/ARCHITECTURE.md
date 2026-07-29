# Architecture

## Overview

Local Pose Lab is a browser-only pipeline with six explicit boundaries:

```text
camera → inference → pose processing → reconstruction/metrics → rendering
                                      └──────────────────────→ recording/playback
```

The browser owns every stage. No frame, landmark, or recording is sent to a server.

## Frame capture

`WebcamController` requests ideal 1280×720, 60 FPS, and `facingMode: user`, attaches the returned stream to the video element, and reports actual track settings. It drives capture with `HTMLVideoElement.requestVideoFrameCallback` when available and `requestAnimationFrame` otherwise. Its `stop` and `dispose` paths cancel the outstanding callback, detach the video source, and stop every track. A track `ended` event is surfaced as a disconnect rather than silently leaving stale UI.

Visual mirroring is deliberately downstream from inference. CSS mirrors only the displayed video; the canvas maps overlay X to `1 - x`. The worker always receives the unmirrored camera frame, so anatomical left and right stay consistent.

## Worker inference and latest-frame-wins

`MediaPipeWorkerInference` is the preferred adapter. When it is idle, it creates an `ImageBitmap`, posts it to the module worker as a transferable, and marks itself busy. New capture callbacks are skipped while busy. There is no array, pending promise chain, or frame queue. The most recent processed pose remains renderable while inference works.

The worker initializes MediaPipe in VIDEO mode for one pose, attempts GPU delegation first, and retries with CPU if needed. It closes each bitmap in success and error paths and returns plain landmark arrays plus inference duration. VIDEO timestamps are monotonically increasing in the same `performance.now()` time domain.

If worker construction, initialization, bitmap transfer, or inference fails, the coordinating adapter tears the worker down once and initializes `MediaPipeMainThreadInference` behind the same interface. UI status identifies Worker versus Main Thread and GPU versus CPU. The fallback does not create a second camera loop.

## Pose processing

`PoseProcessor` turns an inference result into a serializable `ProcessedPoseFrame`:

1. Convert the 33 named world landmarks through the centralized MediaPipe-to-scene transform `(x, -y, -z)`, plus optional developer axis inversions.
2. Calculate confidence as `min(visibility, presence)`, falling back to visibility when presence is absent.
3. Create confidence-gated pelvis, shoulder, spine, chest, neck, head, and hand centers.
4. Subtract pelvis center so articulation is root-relative.
5. Accept high-confidence samples, more strongly smooth medium-confidence samples, and use capped velocity prediction during short low-confidence gaps.
6. Run one scalar One Euro filter per coordinate and joint. Filters adapt cutoff to motion speed.
7. Apply anchored or strongly smoothed/clamped approximate camera-relative root translation.
8. Enforce calibrated segment lengths outward through the skeleton.
9. Build stable pelvis, chest, and approximate head orientation frames.
10. Ground the lowest valid foot point at Y=0, with optional experimental planted-foot locking.
11. Calculate null-safe approximate metrics.

Low-confidence joints are never replaced with `(0, 0, 0)`. Prediction is limited to about 125 ms; after that, the last stable value is held and can be blended toward a parent-derived constrained position.

## Filtering

The One Euro implementation consists of `LowPassFilter`, scalar and vector `OneEuroFilter` variants, and a landmark filter bank. For each sample it filters velocity with `derivativeCutoff`, calculates `minCutoff + beta × |filtered derivative|`, and uses that adaptive cutoff for the value. Medium-confidence values use stronger smoothing. Camera restart, calibration reset, imported recording load, and prolonged tracking loss reset state.

## Calibration and constraints

Calibration waits through a three-second countdown and then collects 60–90 complete, high-confidence, sufficiently still frames. It stores median widths and segment lengths in local storage. Optional symmetry combines corresponding left and right limb medians. Optional height affects only visual avatar scale.

Constraints preserve each filtered parent-to-child direction while replacing its magnitude with the calibrated value. Torso reconstruction preserves lateral hip/shoulder axes while fixing hip width, shoulder width, and torso length. Tests apply seeded synthetic noise and check constrained segment lengths.

## Orientation reconstruction

Pelvis and chest frames use their lateral joint pair for X, the pelvis-to-shoulder direction as the provisional up vector, a cross product for Z, and another cross product for the corrected Y. Degenerate vectors preserve the last valid orientation. Matrix/quaternion outputs are finite and right-handed. When consecutive quaternion dot products are negative, the new quaternion sign is flipped before slerp so equivalent `q`/`-q` representations do not create an interpolation discontinuity. Euler angles are used only to present UI metrics.

## Three.js rendering

`PoseScene` is imperative and created once for the panel element. It owns the renderer, perspective camera, OrbitControls, lights, floor grid, axes, reference helpers, procedural mannequin, and skeleton overlay. Geometry and materials are allocated once; frame updates only change buffers and object transforms. The display RAF interpolates the latest processed poses, tracks render FPS independently, and never commits a React state update each frame.

Each procedural limb aligns a reusable +Y cylinder/capsule with its parent-to-child direction and scales length without changing radius. Central, left, right, predicted, and low-confidence states have distinct materials. A `ResizeObserver` updates camera aspect and renderer dimensions. Disposal stops RAF, disconnects observers and controls, and releases geometry, materials, textures, and the WebGL renderer.

Camera preset changes animate toward front, back, left, right, top, or perspective positions while keeping the orbit target near the pelvis/torso. Screenshot export renders immediately and downloads the canvas locally.

## 2D overlay

The canvas is sized at a capped device pixel ratio. Its coordinate mapper computes the actual contained video rectangle from source and panel aspect ratios, including letterbox offsets, before mapping normalized landmarks. Mirroring is applied only at that final display step. Connections, all 33 points, bounds, reference lines, confidence colors, and warnings are drawn imperatively when a new pose arrives or playback advances.

## Recording

`RecordingManager` snapshots processed inference frames rather than rendered frames. Each frame contains normalized landmarks, raw/filtered/constrained 3D values, confidence, root translation, orientations, and derived metrics using plain objects. Version, creation time, calibration, model, source, and actual/requested camera metadata wrap the frames.

Import performs defensive structural checks, rejects non-finite numbers and non-monotonic timestamps, and never directly trusts parsed JSON. No Three.js classes or image data enter the schema.

## Playback

`PlaybackController` maintains a monotonic playhead, speed, and loop state. It finds adjacent recorded frames and interpolates positions, landmarks, confidences, metrics, and continuous quaternion representations. While playing, it becomes the source for both renderers and UI measurements; live inference may continue without controlling the pose. At pause/end, live control resumes when the camera remains active.

## React state and update rates

High-frequency current pose, scene objects, recorder, processor, and inference adapters live in refs. Rendering runs on RAF, inference runs only when idle, overlay drawing is imperative, metric snapshots are throttled to approximately 10 Hz, and FPS/status updates to approximately 1 Hz. React state is limited to controls, status, calibration progress, timeline state, and those throttled snapshots.
