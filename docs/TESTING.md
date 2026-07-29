# Testing

## Automated checks

Run the full unit suite and production compiler/bundler:

```bash
npm run test
npm run build
```

Optional code-quality checks:

```bash
npm run lint
npm run format
```

The Vitest suite uses deterministic synthetic landmarks and covers:

- centralized coordinate conversion and axis inversion;
- midpoint, interpolation, median, joint angles, and angle normalization;
- stationary-noise reduction and moving-signal response in the One Euro filter;
- confidence classification and conservative visibility/presence combination;
- missing-joint prediction velocity cap and timeout;
- calibrated bone-length enforcement under seeded positional noise;
- right-handed, orthogonal pelvis and chest frames;
- quaternion sign continuity;
- root-motion smoothing/clamping;
- defensive recording JSON/version/timestamp/numeric validation.

The math tests avoid camera, browser GPU, and model nondeterminism. A passing unit suite does not prove camera or MediaPipe compatibility on a particular device.

## Manual browser smoke test

After `npm install` and `npm run setup`:

1. Run `npm run dev` and open the printed localhost URL in a Chromium desktop browser.
2. Confirm that the initial page has no persistent console errors.
3. Start the camera, grant permission, and confirm the actual resolution/FPS appears.
4. Verify 2D landmarks and connections align with the contained video at wide and narrow window sizes.
5. Toggle mirror display and confirm only video/overlay mirror; raise one anatomical hand and verify the 3D side remains correct.
6. Confirm the status identifies inference mode and delegate, and latency does not grow continuously.
7. Rotate the 3D camera and exercise front/back/left/right/top/perspective/reset presets.
8. Toggle skeleton/mannequin/overlay, raw/filtered/constrained, grid, axes, labels, reference lines, and debug axes.
9. Partially occlude a wrist briefly; confirm it predicts/holds rather than jumping to the scene origin.
10. Calibrate from a neutral full-body stance; confirm poor/incomplete views do not complete and successful lengths persist after reload.
11. Move arms and legs after calibration and check for stable segment lengths and grounded feet.
12. Record several seconds, stop, seek, change speed, loop, export JSON, clear, and import that JSON again.
13. Try a malformed or unsupported-version JSON file and verify a friendly error with no crash.
14. Export a 3D screenshot and inspect the local PNG.
15. Stop the camera and verify the browser camera indicator turns off. Reload/unmount during capture and verify it also turns off.

## Performance observation

Use browser performance and memory tools for a five-minute live session. Expected behavior is a bounded one-frame inference path, stable latency, no retained `ImageBitmap` objects, reused Three.js geometry/materials, and no steadily growing media or render allocation. Render and inference FPS are reported separately; inference rate can be lower without reducing the display refresh loop.

## Browser matrix

At minimum, manually sample a current Chrome or Edge desktop build. Where available, also test Firefox and Safari for main-thread fallback, CPU fallback, camera cleanup, and WebGL behavior. Document device/browser-specific delegate failures rather than assuming requested webcam settings or GPU support.
