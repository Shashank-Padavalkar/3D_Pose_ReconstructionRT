import type { AppSettings } from '../app/settings';

interface SettingsPanelProps {
  open: boolean;
  settings: AppSettings;
  inferenceMode: string;
  delegate: string;
  onChange: (patch: Partial<AppSettings>) => void;
  onClose: () => void;
}

function Toggle({
  label,
  checked,
  onChange,
  note,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  note?: string;
}) {
  return (
    <label className="toggle-row">
      <span>
        {label}
        {note && <small>{note}</small>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

export function SettingsPanel({
  open,
  settings,
  inferenceMode,
  delegate,
  onChange,
  onClose,
}: SettingsPanelProps) {
  if (!open) return null;
  return (
    <aside id="settings-panel" className="settings-panel" aria-label="Pose settings">
      <div className="settings-header">
        <div>
          <p className="eyebrow">Configuration</p>
          <h2>Tracking settings</h2>
        </div>
        <button type="button" aria-label="Close settings" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="runtime-summary">
        <span>Inference</span>
        <strong>{inferenceMode}</strong>
        <span>Delegate</span>
        <strong>{delegate}</strong>
      </div>

      <section>
        <h3>Tracking</h3>
        <label className="range-row">
          <span>
            Confidence threshold <output>{settings.confidenceThreshold.toFixed(2)}</output>
          </span>
          <input
            type="range"
            min="0.2"
            max="0.8"
            step="0.05"
            value={settings.confidenceThreshold}
            onChange={(event) => onChange({ confidenceThreshold: Number(event.target.value) })}
          />
        </label>
        <Toggle
          label="Symmetric limb lengths"
          checked={settings.symmetricLimbs}
          onChange={(symmetricLimbs) => onChange({ symmetricLimbs })}
        />
        <label className="number-row">
          <span>
            Optional body height
            <small>Visual scaling only; not a metric calibration.</small>
          </span>
          <input
            type="number"
            min="100"
            max="230"
            placeholder="cm"
            value={settings.bodyHeightCm ?? ''}
            onChange={(event) =>
              onChange({ bodyHeightCm: event.target.value ? Number(event.target.value) : null })
            }
          />
        </label>
      </section>

      <section>
        <h3>Ground contact</h3>
        <Toggle
          label="Enable foot grounding"
          checked={settings.footGrounding}
          onChange={(footGrounding) => onChange({ footGrounding })}
        />
        <Toggle
          label="Experimental foot locking"
          note="Releases automatically when foot velocity rises."
          checked={settings.footLocking}
          onChange={(footLocking) => onChange({ footLocking })}
        />
      </section>

      <section>
        <h3>Reference lines</h3>
        <Toggle
          label="Head reference"
          checked={settings.showHeadReference}
          onChange={(showHeadReference) => onChange({ showHeadReference })}
        />
        <Toggle
          label="Pelvis reference"
          checked={settings.showPelvisReference}
          onChange={(showPelvisReference) => onChange({ showPelvisReference })}
        />
        <Toggle
          label="Shoulder line"
          checked={settings.showShoulderLine}
          onChange={(showShoulderLine) => onChange({ showShoulderLine })}
        />
        <Toggle
          label="Hip line"
          checked={settings.showHipLine}
          onChange={(showHipLine) => onChange({ showHipLine })}
        />
        <Toggle
          label="Body centerline"
          checked={settings.showBodyCenterline}
          onChange={(showBodyCenterline) => onChange({ showBodyCenterline })}
        />
        <Toggle
          label="Ground line"
          checked={settings.showGroundLine}
          onChange={(showGroundLine) => onChange({ showGroundLine })}
        />
        <Toggle
          label="Tracking bounds"
          checked={settings.showBoundingBox}
          onChange={(showBoundingBox) => onChange({ showBoundingBox })}
        />
      </section>

      <details>
        <summary>Advanced filter and debug</summary>
        <div className="details-content">
          <label className="range-row">
            <span>
              Minimum cutoff <output>{settings.minCutoff.toFixed(2)}</output>
            </span>
            <input
              type="range"
              min="0.1"
              max="4"
              step="0.1"
              value={settings.minCutoff}
              onChange={(event) => onChange({ minCutoff: Number(event.target.value) })}
            />
          </label>
          <label className="range-row">
            <span>
              Movement beta <output>{settings.beta.toFixed(3)}</output>
            </span>
            <input
              type="range"
              min="0"
              max="0.3"
              step="0.005"
              value={settings.beta}
              onChange={(event) => onChange({ beta: Number(event.target.value) })}
            />
          </label>
          <label className="range-row">
            <span>
              Derivative cutoff <output>{settings.derivativeCutoff.toFixed(2)}</output>
            </span>
            <input
              type="range"
              min="0.1"
              max="4"
              step="0.1"
              value={settings.derivativeCutoff}
              onChange={(event) => onChange({ derivativeCutoff: Number(event.target.value) })}
            />
          </label>
          <div className="axis-controls">
            <span>Developer coordinate inversion</span>
            <Toggle
              label="Invert X"
              checked={settings.invertX}
              onChange={(invertX) => onChange({ invertX })}
            />
            <Toggle
              label="Invert Y"
              checked={settings.invertY}
              onChange={(invertY) => onChange({ invertY })}
            />
            <Toggle
              label="Invert Z"
              checked={settings.invertZ}
              onChange={(invertZ) => onChange({ invertZ })}
            />
          </div>
          <Toggle
            label="Raw skeleton debug"
            checked={settings.showRawOverlay}
            onChange={(showRawOverlay) => onChange({ showRawOverlay })}
          />
          <Toggle
            label="Filtered skeleton debug"
            checked={settings.showFilteredOverlay}
            onChange={(showFilteredOverlay) => onChange({ showFilteredOverlay })}
          />
          <Toggle
            label="Constrained skeleton debug"
            checked={settings.showConstrainedOverlay}
            onChange={(showConstrainedOverlay) => onChange({ showConstrainedOverlay })}
          />
        </div>
      </details>
    </aside>
  );
}
