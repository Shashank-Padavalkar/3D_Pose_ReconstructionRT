import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { BodyCalibration } from '../calibration/BodyCalibration';
import { CalibrationManager } from '../calibration/CalibrationManager';
import {
  clearCalibration,
  loadCalibration,
  saveCalibration,
} from '../calibration/calibrationStorage';
import type { CameraStatus } from '../camera/cameraTypes';
import { WebcamController } from '../camera/WebcamController';
import { CalibrationOverlay, type CalibrationStage } from '../components/CalibrationOverlay';
import { SettingsPanel } from '../components/SettingsPanel';
import { MetricsPanel } from '../components/MetricsPanel';
import { StatusBar, type StatusItem } from '../components/StatusBar';
import { ThreePosePanel } from '../components/ThreePosePanel';
import { Timeline } from '../components/Timeline';
import { TopToolbar } from '../components/TopToolbar';
import { VideoPosePanel } from '../components/VideoPosePanel';
import { drawPoseOverlay } from '../components/drawPoseOverlay';
import { FpsCounter } from '../utils/fpsCounter';
import { downloadJson, readFileText, timestampForFilename } from '../utils/download';
import { distance } from '../utils/math';
import { MediaPipeWorkerInference } from '../pose/MediaPipeWorkerInference';
import type { PoseInferenceStatus } from '../pose/PoseInference';
import { PoseProcessor } from '../pose/PoseProcessor';
import { EMPTY_METRICS, type PoseMetrics, type ProcessedPoseFrame } from '../pose/poseTypes';
import { PlaybackController } from '../recording/PlaybackController';
import { RecordingManager } from '../recording/RecordingManager';
import type { PoseRecording } from '../recording/recordingSchema';
import { parseRecordingJson } from '../recording/recordingValidation';
import { PoseScene } from '../three/PoseScene';
import {
  APPROXIMATE_NOTICE,
  MODEL_NAME,
  PRIVACY_NOTICE,
  type CameraPreset,
  type DisplayMode,
  type PoseViewMode,
  type RootMode,
} from './constants';
import { validateBodyVisibility } from './trackingValidation';
import { DEFAULT_APP_SETTINGS, type AppSettings } from './settings';
import './App.css';

interface RuntimeStats {
  inferenceFps: number;
  renderFps: number;
  latencyMs: number;
}

interface PlaybackUiState {
  positionMs: number;
  durationMs: number;
  frameIndex: number;
  speed: number;
  loop: boolean;
}

const INITIAL_CAMERA_STATUS: CameraStatus = {
  state: 'idle',
  message: 'Camera has not been started.',
  actualSettings: null,
};

const INITIAL_INFERENCE_STATUS: PoseInferenceStatus = {
  state: 'idle',
  mode: 'worker',
  delegate: null,
  message: 'Pose model has not been initialized.',
};

const INITIAL_PLAYBACK_UI: PlaybackUiState = {
  positionMs: 0,
  durationMs: 0,
  frameIndex: 0,
  speed: 1,
  loop: false,
};

const CALIBRATION_TARGET_SAMPLES = 75;

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const sceneContainerRef = useRef<HTMLDivElement>(null);
  const webcamRef = useRef<WebcamController | null>(null);
  const inferenceRef = useRef<MediaPipeWorkerInference | null>(null);
  const processorRef = useRef<PoseProcessor | null>(null);
  const sceneRef = useRef<PoseScene | null>(null);
  const recorderRef = useRef(new RecordingManager());
  const playbackRef = useRef(new PlaybackController());
  const livePoseRef = useRef<ProcessedPoseFrame | null>(null);
  const inferenceFpsRef = useRef(new FpsCounter());
  const settingsRef = useRef<AppSettings>({ ...DEFAULT_APP_SETTINGS });
  const mirroredRef = useRef(true);
  const labelsVisibleRef = useRef(false);
  const calibrationRef = useRef<BodyCalibration | null>(null);
  const calibrationManagerRef = useRef<CalibrationManager | null>(null);
  const calibrationPreviousPoseRef = useRef<ProcessedPoseFrame | null>(null);
  const calibrationStageRef = useRef<CalibrationStage>('idle');
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackAnimationRef = useRef<number | null>(null);
  const playingRef = useRef(false);
  const recordingRef = useRef(false);
  const lastMetricsUpdateRef = useRef(0);
  const lastStatsUpdateRef = useRef(0);
  const lastCalibrationUpdateRef = useRef(0);
  const lastWarningRef = useRef<string | null>(null);

  const [cameraStatus, setCameraStatus] = useState(INITIAL_CAMERA_STATUS);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [inferenceStatus, setInferenceStatus] = useState(INITIAL_INFERENCE_STATUS);
  const [settings, setSettings] = useState<AppSettings>({ ...DEFAULT_APP_SETTINGS });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [displayMode, setDisplayModeState] = useState<DisplayMode>('overlay');
  const [poseViewMode, setPoseViewModeState] = useState<PoseViewMode>('constrained');
  const [rootMode, setRootModeState] = useState<RootMode>('anchored');
  const [mirrored, setMirrored] = useState(true);
  const [gridVisible, setGridVisible] = useState(true);
  const [axesVisible, setAxesVisible] = useState(false);
  const [labelsVisible, setLabelsVisible] = useState(false);
  const [activePreset, setActivePreset] = useState<CameraPreset>('perspective');
  const [webglError, setWebglError] = useState<string | null>(null);
  const [appError, setAppError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<PoseMetrics>({ ...EMPTY_METRICS });
  const [trackingWarning, setTrackingWarning] = useState<string | null>(null);
  const [trackingConfidence, setTrackingConfidence] = useState(0);
  const [stats, setStats] = useState<RuntimeStats>({
    inferenceFps: 0,
    renderFps: 0,
    latencyMs: 0,
  });
  const [calibration, setCalibration] = useState<BodyCalibration | null>(() => loadCalibration());
  const [calibrationStage, setCalibrationStageState] = useState<CalibrationStage>('idle');
  const [calibrationCountdown, setCalibrationCountdown] = useState(3);
  const [calibrationSamples, setCalibrationSamples] = useState(0);
  const [calibrationMessage, setCalibrationMessage] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingData, setRecordingData] = useState<PoseRecording | null>(null);
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [recordedFrames, setRecordedFrames] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playbackUi, setPlaybackUi] = useState(INITIAL_PLAYBACK_UI);

  const setCalibrationStage = useCallback((stage: CalibrationStage) => {
    calibrationStageRef.current = stage;
    setCalibrationStageState(stage);
  }, []);

  const presentPose = useCallback((frame: ProcessedPoseFrame, warning: string | null) => {
    sceneRef.current?.updatePose(frame);
    const canvas = overlayRef.current;
    const video = videoRef.current;
    if (canvas && video) {
      const currentSettings = settingsRef.current;
      const currentCalibration = calibrationRef.current;
      drawPoseOverlay(canvas, video, frame, {
        mirrored: mirroredRef.current,
        confidenceThreshold: currentSettings.confidenceThreshold,
        showLabels: labelsVisibleRef.current,
        showBoundingBox: currentSettings.showBoundingBox,
        showBodyCenterline: currentSettings.showBodyCenterline,
        showHeadReference: currentSettings.showHeadReference,
        showPelvisReference: currentSettings.showPelvisReference,
        showShoulderLine: currentSettings.showShoulderLine,
        showHipLine: currentSettings.showHipLine,
        showGroundLine: currentSettings.showGroundLine,
        warning,
        reference: {
          ...(currentCalibration?.reference.normalizedPelvisCenter
            ? { pelvisX: currentCalibration.reference.normalizedPelvisCenter.x }
            : {}),
          ...(currentCalibration?.reference.sceneHeadCenter && frame.normalized2D.headCenter
            ? { headX: approximateNormalizedHeadReference(frame) }
            : {}),
        },
      });
    }
  }, []);

  const updateCalibrationFromFrame = useCallback(
    (frame: ProcessedPoseFrame, nowMs: number): void => {
      if (calibrationStageRef.current !== 'collecting') return;
      const validation = validateBodyVisibility(
        frame,
        Math.max(0.55, settingsRef.current.confidenceThreshold),
      );
      if (!validation.valid) {
        if (nowMs - lastCalibrationUpdateRef.current >= 100) {
          setCalibrationMessage(validation.message);
          lastCalibrationUpdateRef.current = nowMs;
        }
        calibrationPreviousPoseRef.current = frame;
        return;
      }

      const previous = calibrationPreviousPoseRef.current;
      calibrationPreviousPoseRef.current = frame;
      if (previous && calibrationMovement(previous, frame) > 0.035) {
        if (nowMs - lastCalibrationUpdateRef.current >= 100) {
          setCalibrationMessage('Hold still during calibration.');
          lastCalibrationUpdateRef.current = nowMs;
        }
        return;
      }

      const manager = calibrationManagerRef.current;
      if (!manager) return;
      const pelvis2D = frame.normalized2D.pelvisCenter;
      const shoulders2D = frame.normalized2D.shoulderCenter;
      const progress = manager.addSample(frame.filtered3D, frame.confidences, {
        ...(pelvis2D ? { normalizedPelvisCenter: { x: pelvis2D.x, y: pelvis2D.y } } : {}),
        ...(shoulders2D
          ? { normalizedShoulderCenter: { x: shoulders2D.x, y: shoulders2D.y } }
          : {}),
        ...(frame.pelvisOrientation ? { pelvisOrientation: frame.pelvisOrientation } : {}),
        ...(frame.chestOrientation ? { chestOrientation: frame.chestOrientation } : {}),
      });
      if (nowMs - lastCalibrationUpdateRef.current >= 100 || progress.complete) {
        setCalibrationSamples(progress.acceptedSamples);
        setCalibrationMessage(
          progress.accepted
            ? 'Good—keep holding the neutral pose.'
            : calibrationReason(progress.reason),
        );
        lastCalibrationUpdateRef.current = nowMs;
      }
      if (!progress.complete) return;

      try {
        const profile = manager.finalize();
        if (!saveCalibration(profile)) {
          throw new Error('The browser could not persist the calibration profile.');
        }
        setCalibration(profile);
        calibrationRef.current = profile;
        processorRef.current?.setCalibration(profile);
        sceneRef.current?.calibrateReferenceLines(frame);
        setCalibrationMessage('Calibration complete and saved locally.');
        setCalibrationStage('complete');
        countdownTimerRef.current = setTimeout(() => setCalibrationStage('idle'), 900);
      } catch (error) {
        console.error('Calibration failed', error);
        setCalibrationMessage(error instanceof Error ? error.message : 'Calibration failed.');
        setCalibrationStage('failed');
      }
    },
    [setCalibrationStage],
  );

  const handleInferenceFrame = useCallback(
    async (videoFrame: { video: HTMLVideoElement; timestampMs: number }): Promise<void> => {
      const inference = inferenceRef.current;
      const processor = processorRef.current;
      if (!inference || !processor || inference.isBusy) return;
      let result;
      try {
        result = await inference.infer(videoFrame.video, videoFrame.timestampMs);
      } catch (error) {
        console.error('Pose inference frame failed', error);
        setAppError(error instanceof Error ? error.message : 'Pose inference failed.');
        return;
      }
      if (!result) return;
      const nowMs = performance.now();
      const inferenceFps = inferenceFpsRef.current.tick(nowMs);
      if (nowMs - lastStatsUpdateRef.current >= 1000) {
        setStats({
          inferenceFps,
          renderFps: sceneRef.current?.getRenderFps() ?? 0,
          latencyMs: Math.max(result.inferenceTimeMs, nowMs - result.timestampMs),
        });
        lastStatsUpdateRef.current = nowMs;
      }
      const frame = processor.process(result);
      if (!frame) {
        if (nowMs - lastMetricsUpdateRef.current >= 100) {
          setTrackingWarning('Tracking lost. Keep your full body visible.');
          setTrackingConfidence(0);
          lastMetricsUpdateRef.current = nowMs;
        }
        return;
      }

      livePoseRef.current = frame;
      const validation = validateBodyVisibility(frame, settingsRef.current.confidenceThreshold);
      lastWarningRef.current = validation.message;
      updateCalibrationFromFrame(frame, nowMs);
      if (recordingRef.current) recorderRef.current.addFrame(frame);

      if (!playingRef.current) presentPose(frame, validation.message);
      if (nowMs - lastMetricsUpdateRef.current >= 100) {
        if (!playingRef.current) setMetrics(frame.metrics);
        setTrackingConfidence(frame.averageConfidence);
        setTrackingWarning(validation.message);
        if (recordingRef.current) {
          setRecordingDurationMs(recorderRef.current.durationMs);
          setRecordedFrames(recorderRef.current.frameCount);
        }
        lastMetricsUpdateRef.current = nowMs;
      }
    },
    [presentPose, updateCalibrationFromFrame],
  );

  useEffect(() => {
    let mounted = true;
    calibrationRef.current = calibration;
    const processor = new PoseProcessor({ calibration });
    processorRef.current = processor;
    const webcam = new WebcamController({
      onStatusChange: (status) => mounted && setCameraStatus({ ...status }),
      onFrameError: (error) => {
        console.error('Camera frame loop failed', error);
        if (mounted) setAppError(error.message);
      },
    });
    webcamRef.current = webcam;
    const inference = new MediaPipeWorkerInference({
      onStatusChange: (status) => mounted && setInferenceStatus({ ...status }),
    });
    inferenceRef.current = inference;

    if (sceneContainerRef.current) {
      try {
        sceneRef.current = new PoseScene(sceneContainerRef.current, {
          displayMode: 'overlay',
          poseSource: 'constrained',
        });
      } catch (error) {
        console.error('WebGL scene initialization failed', error);
        const message =
          error instanceof Error ? error.message : 'WebGL could not be initialized on this device.';
        queueMicrotask(() => mounted && setWebglError(message));
      }
    }

    void inference.initialize().catch((error: unknown) => {
      if (!mounted) return;
      console.error('Pose model initialization failed', error);
      setAppError(
        `Pose model could not load. Run npm run setup and reload. ${
          error instanceof Error ? error.message : ''
        }`.trim(),
      );
    });

    return () => {
      mounted = false;
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
      if (playbackAnimationRef.current !== null) cancelAnimationFrame(playbackAnimationRef.current);
      webcam.dispose();
      inference.dispose();
      sceneRef.current?.dispose();
      sceneRef.current = null;
      webcamRef.current = null;
      inferenceRef.current = null;
      processorRef.current = null;
    };
    // Runtime classes intentionally live for the component lifetime; settings are updated separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
    mirroredRef.current = mirrored;
    labelsVisibleRef.current = labelsVisible;
    calibrationRef.current = calibration;
    playingRef.current = playing;
    recordingRef.current = recording;
  }, [calibration, labelsVisible, mirrored, playing, recording, settings]);

  useEffect(() => {
    processorRef.current?.updateSettings({
      confidenceThresholds: {
        usable: settings.confidenceThreshold,
        high: Math.max(0.65, settings.confidenceThreshold),
      },
      filter: {
        minCutoff: settings.minCutoff,
        beta: settings.beta,
        derivativeCutoff: settings.derivativeCutoff,
      },
      axisInversion: {
        x: settings.invertX,
        y: settings.invertY,
        z: settings.invertZ,
      },
      rootMotionMode: rootMode,
      groundingEnabled: settings.footGrounding,
      footLockingEnabled: settings.footLocking,
    });
    sceneRef.current?.setDebugOverlays({
      raw: settings.showRawOverlay,
      filtered: settings.showFilteredOverlay,
      constrained: settings.showConstrainedOverlay,
      references: {
        head: settings.showHeadReference,
        pelvis: settings.showPelvisReference,
        shoulders: settings.showShoulderLine,
        hips: settings.showHipLine,
        centerline: settings.showBodyCenterline,
        ground: settings.showGroundLine,
      },
    });
  }, [rootMode, settings]);

  const startCamera = useCallback(async () => {
    const webcam = webcamRef.current;
    const video = videoRef.current;
    if (!webcam || !video) return;
    setCameraBusy(true);
    setAppError(null);
    try {
      await webcam.start(video);
      processorRef.current?.reset();
      inferenceFpsRef.current.reset();
      await inferenceRef.current?.initialize();
      webcam.startFrameLoop(handleInferenceFrame);
    } catch (error) {
      console.error('Camera startup failed', error);
      setAppError(error instanceof Error ? error.message : 'Camera startup failed.');
    } finally {
      setCameraBusy(false);
    }
  }, [handleInferenceFrame]);

  const stopCamera = useCallback(() => {
    webcamRef.current?.stop();
    processorRef.current?.reset();
    const canvas = overlayRef.current;
    const context = canvas?.getContext('2d');
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    setMetrics({ ...EMPTY_METRICS });
    setTrackingWarning(null);
    setTrackingConfidence(0);
  }, []);

  const cancelCalibration = useCallback(() => {
    if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
    countdownTimerRef.current = null;
    calibrationManagerRef.current = null;
    calibrationPreviousPoseRef.current = null;
    setCalibrationSamples(0);
    setCalibrationMessage(null);
    setCalibrationStage('idle');
  }, [setCalibrationStage]);

  const startCalibration = useCallback(() => {
    if (cameraStatus.state !== 'active') {
      setAppError('Start the camera before calibration.');
      return;
    }
    cancelCalibration();
    calibrationManagerRef.current = new CalibrationManager({
      minimumSamples: 60,
      targetSamples: CALIBRATION_TARGET_SAMPLES,
      maximumSamples: 90,
      minimumAverageConfidence: Math.max(0.6, settingsRef.current.confidenceThreshold),
      symmetryEnabled: settingsRef.current.symmetricLimbs,
      bodyHeightMeters: settingsRef.current.bodyHeightCm
        ? settingsRef.current.bodyHeightCm / 100
        : null,
    });
    setCalibrationCountdown(3);
    setCalibrationSamples(0);
    setCalibrationMessage('Stand fully visible in a neutral upright pose.');
    setCalibrationStage('countdown');
    let remaining = 3;
    const tick = () => {
      remaining -= 1;
      if (remaining <= 0) {
        setCalibrationCountdown(0);
        setCalibrationStage('collecting');
        setCalibrationMessage('Hold still while valid pose samples are collected.');
        return;
      }
      setCalibrationCountdown(remaining);
      countdownTimerRef.current = setTimeout(tick, 1000);
    };
    countdownTimerRef.current = setTimeout(tick, 1000);
  }, [cameraStatus.state, cancelCalibration, setCalibrationStage]);

  const resetCalibration = useCallback(() => {
    cancelCalibration();
    clearCalibration();
    setCalibration(null);
    calibrationRef.current = null;
    processorRef.current?.setCalibration(null);
    sceneRef.current?.clearReferenceCalibration();
  }, [cancelCalibration]);

  const pausePlayback = useCallback(
    (returnToLive = false): void => {
      playbackRef.current.pause();
      playingRef.current = false;
      setPlaying(false);
      if (playbackAnimationRef.current !== null) {
        cancelAnimationFrame(playbackAnimationRef.current);
        playbackAnimationRef.current = null;
      }
      if (returnToLive && livePoseRef.current && cameraStatus.state === 'active') {
        presentPose(livePoseRef.current, lastWarningRef.current);
      }
    },
    [cameraStatus.state, presentPose],
  );

  const startRecording = useCallback(() => {
    if (cameraStatus.state !== 'active') return;
    pausePlayback(false);
    const actual = cameraStatus.actualSettings;
    recorderRef.current.start(
      {
        source: 'webcam',
        model: MODEL_NAME,
        requestedResolution: '1280×720 @ 60 FPS ideal',
        ...(actual?.width && actual.height
          ? { actualResolution: `${actual.width}×${actual.height}` }
          : {}),
        ...(actual?.frameRate ? { actualFrameRate: actual.frameRate } : {}),
      },
      calibrationRef.current,
    );
    setRecordingData(null);
    setRecordedFrames(0);
    setRecordingDurationMs(0);
    recordingRef.current = true;
    setRecording(true);
  }, [cameraStatus, pausePlayback]);

  const stopRecording = useCallback(() => {
    recordingRef.current = false;
    setRecording(false);
    const snapshot = recorderRef.current.stop();
    setRecordingData(snapshot);
    if (snapshot) {
      playbackRef.current.load(snapshot);
      setPlaybackUi({ ...INITIAL_PLAYBACK_UI, durationMs: playbackRef.current.durationMs });
      setRecordedFrames(snapshot.frames.length);
      setRecordingDurationMs(playbackRef.current.durationMs);
    }
  }, []);

  const renderPlaybackFrame = useCallback(
    (nowMs: number, forceUi = false): boolean => {
      const frame = playbackRef.current.update(nowMs);
      if (frame) presentPose(frame, null);
      const state = playbackRef.current.state;
      if (frame && (forceUi || nowMs - lastMetricsUpdateRef.current >= 100)) {
        setMetrics(frame.metrics);
        setPlaybackUi({
          positionMs: state.positionMs,
          durationMs: state.durationMs,
          frameIndex: state.frameIndex,
          speed: state.speed,
          loop: state.loop,
        });
        lastMetricsUpdateRef.current = nowMs;
      }
      return state.playing;
    },
    [presentPose],
  );

  const playbackLoop = useCallback(
    function runPlaybackLoop(nowMs: number) {
      const continues = renderPlaybackFrame(nowMs);
      if (continues && playingRef.current) {
        playbackAnimationRef.current = requestAnimationFrame(runPlaybackLoop);
        return;
      }
      playbackAnimationRef.current = null;
      playingRef.current = false;
      setPlaying(false);
      const live = livePoseRef.current;
      if (live && cameraStatus.state === 'active') presentPose(live, lastWarningRef.current);
    },
    [cameraStatus.state, presentPose, renderPlaybackFrame],
  );

  const playRecording = useCallback(() => {
    if (!recordingData) return;
    playbackRef.current.play();
    playingRef.current = true;
    setPlaying(true);
    if (playbackAnimationRef.current !== null) cancelAnimationFrame(playbackAnimationRef.current);
    playbackAnimationRef.current = requestAnimationFrame(playbackLoop);
  }, [playbackLoop, recordingData]);

  const clearRecording = useCallback(() => {
    pausePlayback(true);
    recorderRef.current.clear();
    setRecordingData(null);
    setRecordedFrames(0);
    setRecordingDurationMs(0);
    setPlaybackUi(INITIAL_PLAYBACK_UI);
  }, [pausePlayback]);

  const importRecording = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      try {
        const validation = parseRecordingJson(await readFileText(file));
        if (!validation.valid || !validation.recording) {
          throw new Error(validation.error ?? 'The recording is invalid.');
        }
        pausePlayback(false);
        recorderRef.current.load(validation.recording);
        playbackRef.current.load(validation.recording);
        processorRef.current?.reset();
        const importedCalibration = validation.recording.calibration;
        setCalibration(importedCalibration);
        calibrationRef.current = importedCalibration;
        processorRef.current?.setCalibration(importedCalibration);
        setRecordingData(validation.recording);
        setRecordedFrames(validation.recording.frames.length);
        setRecordingDurationMs(playbackRef.current.durationMs);
        setPlaybackUi({ ...INITIAL_PLAYBACK_UI, durationMs: playbackRef.current.durationMs });
        setAppError(null);
        const first = playbackRef.current.update();
        if (first) presentPose(first, null);
      } catch (error) {
        console.error('Recording import failed', error);
        setAppError(error instanceof Error ? error.message : 'Recording import failed.');
      }
    },
    [pausePlayback, presentPose],
  );

  const seekPlayback = useCallback(
    (positionMs: number) => {
      if (!recordingData) return;
      playbackRef.current.seek(positionMs);
      renderPlaybackFrame(performance.now(), true);
    },
    [recordingData, renderPlaybackFrame],
  );

  const updatePlaybackSpeed = useCallback((speed: number) => {
    playbackRef.current.setSpeed(speed);
    setPlaybackUi((state) => ({ ...state, speed }));
  }, []);

  const updatePlaybackLoop = useCallback((loop: boolean) => {
    playbackRef.current.setLoop(loop);
    setPlaybackUi((state) => ({ ...state, loop }));
  }, []);

  const resetApplication = useCallback(() => {
    pausePlayback(true);
    if (recordingRef.current) stopRecording();
    processorRef.current?.reset();
    sceneRef.current?.resetCamera();
    setActivePreset('perspective');
    setAppError(null);
    setMetrics({ ...EMPTY_METRICS });
  }, [pausePlayback, stopRecording]);

  const statusItems = useMemo<StatusItem[]>(() => {
    const cameraActive = cameraStatus.state === 'active';
    const inferenceReady = inferenceStatus.state === 'ready';
    return [
      {
        label: 'Camera',
        value: cameraStatus.state,
        state: cameraActive ? 'good' : cameraStatus.state === 'error' ? 'error' : 'neutral',
        title: cameraStatus.message,
      },
      {
        label: 'Model',
        value: inferenceReady
          ? `${inferenceStatus.mode} · ${inferenceStatus.delegate ?? '—'}`
          : inferenceStatus.state,
        state: inferenceReady ? 'good' : inferenceStatus.state === 'error' ? 'error' : 'warning',
        title: inferenceStatus.message,
      },
      {
        label: 'Calibration',
        value: calibration ? `${calibration.sampleCount} samples` : 'not calibrated',
        state: calibration ? 'good' : 'neutral',
      },
      {
        label: 'Confidence',
        value: `${Math.round(trackingConfidence * 100)}%`,
        state:
          trackingConfidence >= 0.65 ? 'good' : trackingConfidence >= 0.4 ? 'warning' : 'error',
      },
      {
        label: 'Inference',
        value: `${stats.inferenceFps.toFixed(1)} fps`,
        state: stats.inferenceFps >= 18 ? 'good' : 'neutral',
      },
      {
        label: 'Render',
        value: `${stats.renderFps.toFixed(1)} fps`,
        state: stats.renderFps >= 45 ? 'good' : 'neutral',
      },
      {
        label: 'Latency',
        value: `${stats.latencyMs.toFixed(0)} ms`,
        state: stats.latencyMs < 150 ? 'good' : 'warning',
      },
      {
        label: 'Recording',
        value: recording ? 'active' : recordingData ? 'ready' : 'idle',
        state: recording ? 'error' : recordingData ? 'good' : 'neutral',
      },
      { label: 'Frames', value: recordedFrames.toString(), state: 'neutral' },
    ];
  }, [
    calibration,
    cameraStatus,
    inferenceStatus,
    recordedFrames,
    recording,
    recordingData,
    stats,
    trackingConfidence,
  ]);

  const cameraActual = cameraStatus.actualSettings;
  const actualResolution =
    cameraActual?.width && cameraActual.height
      ? `${cameraActual.width}×${cameraActual.height}`
      : 'Unknown resolution';
  const cameraActive = cameraStatus.state === 'active';

  return (
    <div className="app-shell">
      <TopToolbar
        cameraActive={cameraActive}
        cameraBusy={cameraBusy}
        calibrated={calibration !== null}
        recording={recording}
        hasRecording={recordingData !== null}
        playing={playing}
        mirrored={mirrored}
        displayMode={displayMode}
        poseViewMode={poseViewMode}
        rootMode={rootMode}
        settingsOpen={settingsOpen}
        onStartCamera={() => void startCamera()}
        onStopCamera={stopCamera}
        onCalibrate={startCalibration}
        onResetCalibration={resetCalibration}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        onClearRecording={clearRecording}
        onPlay={playRecording}
        onPause={() => pausePlayback(false)}
        onReset={resetApplication}
        onImport={(event) => void importRecording(event)}
        onExport={() =>
          recordingData &&
          downloadJson(recordingData, `pose-recording-${timestampForFilename()}.json`)
        }
        onScreenshot={() => {
          try {
            sceneRef.current?.captureScreenshot();
          } catch (error) {
            setAppError(error instanceof Error ? error.message : 'Screenshot export failed.');
          }
        }}
        onMirroredChange={(nextMirrored) => {
          mirroredRef.current = nextMirrored;
          setMirrored(nextMirrored);
        }}
        onDisplayModeChange={(mode) => {
          setDisplayModeState(mode);
          sceneRef.current?.setDisplayMode(mode);
        }}
        onPoseViewModeChange={(mode) => {
          setPoseViewModeState(mode);
          sceneRef.current?.setPoseSource(mode);
        }}
        onRootModeChange={(mode) => {
          setRootModeState(mode);
          processorRef.current?.setRootMotionMode(mode);
        }}
        onSettingsToggle={() => setSettingsOpen((open) => !open)}
      />

      {appError && (
        <div className="app-error" role="alert">
          <strong>Action needed</strong>
          <span>{appError}</span>
          <button type="button" aria-label="Dismiss error" onClick={() => setAppError(null)}>
            ×
          </button>
        </div>
      )}

      <main className="workspace">
        <div className="viewer-grid">
          <VideoPosePanel
            videoRef={videoRef}
            canvasRef={overlayRef}
            mirrored={mirrored}
            cameraActive={cameraActive}
            actualResolution={actualResolution}
            actualFrameRate={cameraActual?.frameRate ?? null}
            warning={trackingWarning}
          />
          <ThreePosePanel
            containerRef={sceneContainerRef}
            activePreset={activePreset}
            gridVisible={gridVisible}
            axesVisible={axesVisible}
            labelsVisible={labelsVisible}
            webglError={webglError}
            onPreset={(preset) => {
              setActivePreset(preset);
              sceneRef.current?.setCameraPreset(preset);
            }}
            onResetCamera={() => {
              setActivePreset('perspective');
              sceneRef.current?.resetCamera();
            }}
            onGridToggle={() => {
              setGridVisible((visible) => {
                sceneRef.current?.setGridVisible(!visible);
                return !visible;
              });
            }}
            onAxesToggle={() => {
              setAxesVisible((visible) => {
                sceneRef.current?.setAxesVisible(!visible);
                return !visible;
              });
            }}
            onLabelsToggle={() => {
              setLabelsVisible((visible) => {
                const nextVisible = !visible;
                labelsVisibleRef.current = nextVisible;
                sceneRef.current?.setLabelsVisible(nextVisible);
                return nextVisible;
              });
            }}
          />
        </div>
        <MetricsPanel metrics={metrics} />
      </main>

      <Timeline
        hasRecording={recordingData !== null}
        playing={playing}
        positionMs={playbackUi.positionMs}
        durationMs={playbackUi.durationMs}
        frameIndex={playbackUi.frameIndex}
        frameCount={recordedFrames}
        speed={playbackUi.speed}
        loop={playbackUi.loop}
        recording={recording}
        recordingDurationMs={recordingDurationMs}
        onPlay={playRecording}
        onPause={() => pausePlayback(false)}
        onSeek={seekPlayback}
        onSpeed={updatePlaybackSpeed}
        onLoop={updatePlaybackLoop}
      />
      <StatusBar items={statusItems} />
      <footer className="privacy-footer">
        <strong>{APPROXIMATE_NOTICE}</strong>
        <span>{PRIVACY_NOTICE}</span>
      </footer>

      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        inferenceMode={inferenceStatus.mode === 'worker' ? 'Web Worker' : 'Main Thread'}
        delegate={inferenceStatus.delegate ?? 'Not ready'}
        onChange={(patch) => setSettings((current) => ({ ...current, ...patch }))}
        onClose={() => setSettingsOpen(false)}
      />
      <CalibrationOverlay
        stage={calibrationStage}
        countdown={calibrationCountdown}
        sampleCount={calibrationSamples}
        targetSamples={CALIBRATION_TARGET_SAMPLES}
        message={calibrationMessage}
        onCancel={cancelCalibration}
      />
    </div>
  );
}

function calibrationMovement(previous: ProcessedPoseFrame, current: ProcessedPoseFrame): number {
  const names = ['pelvisCenter', 'leftWrist', 'rightWrist', 'leftAnkle', 'rightAnkle'] as const;
  const movements = names.flatMap((name) => {
    const before = previous.filtered3D[name];
    const after = current.filtered3D[name];
    return before && after ? [distance(before, after)] : [];
  });
  return movements.length > 0
    ? movements.reduce((total, movement) => total + movement, 0) / movements.length
    : Number.POSITIVE_INFINITY;
}

function calibrationReason(reason: string | undefined): string {
  if (reason === 'low-confidence') return 'Lighting is too poor or tracking confidence is low.';
  if (reason === 'missing-joints') return 'Keep your full body, wrists, and both feet visible.';
  if (reason === 'maximum-reached') return 'Calibration sample limit reached.';
  return 'Hold still while valid samples are collected.';
}

function approximateNormalizedHeadReference(frame: ProcessedPoseFrame): number {
  const head = frame.normalized2D.headCenter;
  if (!head) return 0.5;

  const leftShoulder = frame.normalized2D.leftShoulder;
  const rightShoulder = frame.normalized2D.rightShoulder;
  const shoulderWidth =
    leftShoulder && rightShoulder ? Math.abs(rightShoulder.x - leftShoulder.x) : 0;

  return head.x - (frame.metrics.headSwayBodyWidths ?? 0) * shoulderWidth;
}
