# Limitations

Local Pose Lab is an engineering demonstration, not a validated motion-capture or biomechanics system.

## Monocular geometry

MediaPipe world landmarks are not guaranteed to be metric-accurate. With one ordinary RGB camera, multiple 3D poses can explain the same 2D projection; monocular depth is fundamentally ambiguous. The root-depth mode estimates only a camera-relative proxy from apparent torso scale. It is strongly smoothed and clamped and must not be interpreted as real metric displacement.

## Visibility and capture quality

Self-occlusion or an object covering a joint can produce incorrect depth or left/right ambiguity. Fast movement—especially a golf swing—adds motion blur and may cause landmark lag or complete tracking failure. Low light, rolling shutter, compression, loose clothing, and a partial-body view can further degrade estimates. Confidence gating and short prediction reduce visual jumps but cannot recover observations that the camera never captured.

## Biomechanics

Body-segment twist cannot be fully recovered from joint positions alone. Pelvis, chest, and head frames are approximate constructions from sparse landmarks. Knee and elbow angles, yaw, tilt, X-factor, and sway are mathematical summaries of these estimates. They are not clinical measures, coaching prescriptions, or motion-capture-grade data.

A normal webcam is not sufficient for accurate impact analysis. It cannot reliably capture club-face orientation, high-speed contact, force, pressure, or true 3D trajectories. High-accuracy golf biomechanics would require synchronized calibrated cameras or dedicated sensors, camera calibration, domain-specific temporal models, and representative calibrated training/validation data.

## Calibration and constraints

Calibration measures the model’s own estimated proportions across a short neutral sequence. It does not measure physical limb lengths. Fixed-length constraints improve visual stability but can conceal a bad estimate and may shift distal joints. Optional height changes visual scale only.

Floor grounding assumes at least one ankle/heel/toe estimate is usable. Occluded feet can make the avatar float or create a delayed floor correction. Experimental foot locking is intentionally conservative and is not a physics solver.

## Performance and browser variation

Inference speed depends on browser, GPU/driver, camera resolution, thermal limits, and whether MediaPipe can run in a worker. Main-thread and CPU fallback modes remain functional but may reduce responsiveness or inference FPS. Browser support for `requestVideoFrameCallback`, transferable `ImageBitmap`, module workers, WebAssembly SIMD, and GPU delegation varies.

## Recording

Recordings contain pose values only and cannot be visually audited against the original video unless the user separately records it. Interpolation produces smooth playback but does not create new measured observations. Long pose recordings can still consume significant browser memory because several joint representations are deliberately retained for debugging and analysis.
