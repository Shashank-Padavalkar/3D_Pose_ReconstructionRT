declare module '@mediapipe/tasks-vision/vision_wasm_module_internal.js' {
  type ModuleFactory = (overrides?: Record<string, unknown>) => Promise<unknown>;
  const moduleFactory: ModuleFactory;
  export default moduleFactory;
}
