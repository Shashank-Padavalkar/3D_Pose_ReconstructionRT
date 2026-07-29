export const APP_NAME = 'Local Pose Lab';
export const MODEL_NAME = 'MediaPipe Pose Landmarker Full';
export const APPROXIMATE_NOTICE =
  '3D depth and biomechanical measurements are approximate and should not be treated as motion-capture data.';
export const PRIVACY_NOTICE = 'All processing happens locally in your browser.';

export type DisplayMode = 'skeleton' | 'mannequin' | 'overlay';
export type PoseViewMode = 'raw' | 'filtered' | 'constrained';
export type RootMode = 'anchored' | 'approximate';
export type CameraPreset = 'front' | 'back' | 'left' | 'right' | 'top' | 'perspective';
