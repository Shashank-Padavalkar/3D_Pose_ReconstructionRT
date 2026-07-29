export interface AppSettings {
  confidenceThreshold: number;
  minCutoff: number;
  beta: number;
  derivativeCutoff: number;
  invertX: boolean;
  invertY: boolean;
  invertZ: boolean;
  bodyHeightCm: number | null;
  symmetricLimbs: boolean;
  footGrounding: boolean;
  footLocking: boolean;
  showRawOverlay: boolean;
  showFilteredOverlay: boolean;
  showConstrainedOverlay: boolean;
  showBoundingBox: boolean;
  showBodyCenterline: boolean;
  showHeadReference: boolean;
  showPelvisReference: boolean;
  showShoulderLine: boolean;
  showHipLine: boolean;
  showGroundLine: boolean;
}

export const DEFAULT_APP_SETTINGS: Readonly<AppSettings> = {
  confidenceThreshold: 0.4,
  minCutoff: 1,
  beta: 0.06,
  derivativeCutoff: 1,
  invertX: false,
  invertY: false,
  invertZ: false,
  bodyHeightCm: null,
  symmetricLimbs: true,
  footGrounding: true,
  footLocking: false,
  showRawOverlay: false,
  showFilteredOverlay: false,
  showConstrainedOverlay: true,
  showBoundingBox: true,
  showBodyCenterline: true,
  showHeadReference: true,
  showPelvisReference: true,
  showShoulderLine: true,
  showHipLine: true,
  showGroundLine: true,
};
