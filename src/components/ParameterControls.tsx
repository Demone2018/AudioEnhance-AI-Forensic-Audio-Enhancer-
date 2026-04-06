import type { ProcessingParams, Language } from '../types/audio';
import { t } from '../i18n/translations';

interface ParameterControlsProps {
  params: ProcessingParams;
  onUpdate: <K extends keyof ProcessingParams>(key: K, value: ProcessingParams[K]) => void;
  disabled: boolean;
  lang: Language;
}

function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="relative mt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only peer"
        />
        <div className="w-10 h-5 bg-slate-700 rounded-full peer-checked:bg-cyan-600 transition-colors" />
        <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
      </div>
      <div>
        <div className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors">
          {label}
        </div>
        <div className="text-xs text-slate-500">{description}</div>
      </div>
    </label>
  );
}

function Slider({
  label,
  description,
  value,
  onChange,
  min,
  max,
  step,
  unit,
  disabled,
}: {
  label: string;
  description?: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <label className="text-sm font-medium text-slate-200">{label}</label>
        <span className="text-sm font-mono text-cyan-400">
          {value}
          {unit}
        </span>
      </div>
      {description && <p className="text-xs text-slate-500">{description}</p>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
      />
    </div>
  );
}

export function ParameterControls({ params, onUpdate, disabled, lang }: ParameterControlsProps) {
  return (
    <div className="space-y-6">
      {/* Sliders */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          {t('parameters', lang)}
        </h3>

        <Slider
          label={t('sensitivity', lang)}
          description={t('sensitivityDesc', lang)}
          value={params.sensitivity}
          onChange={(v) => onUpdate('sensitivity', v)}
          min={0}
          max={100}
          step={1}
          disabled={disabled}
        />

        <Slider
          label={t('gain', lang)}
          value={params.gainDb}
          onChange={(v) => onUpdate('gainDb', v)}
          min={-20}
          max={40}
          step={1}
          unit="dB"
          disabled={disabled}
        />

        <Slider
          label={t('trebleBoost', lang)}
          description={t('trebleBoostDesc', lang)}
          value={params.trebleBoost}
          onChange={(v) => onUpdate('trebleBoost', v)}
          min={0}
          max={24}
          step={1}
          unit="dB"
          disabled={disabled}
        />
      </div>

      {/* Toggles */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          {t('filters', lang)}
        </h3>

        <Toggle
          label={t('enableEQ', lang)}
          description={t('enableEQDesc', lang)}
          checked={params.enableEQ}
          onChange={(v) => onUpdate('enableEQ', v)}
          disabled={disabled}
        />

        <Toggle
          label={t('enableQSJ', lang)}
          description={t('enableQSJDesc', lang)}
          checked={params.enableQSJ}
          onChange={(v) => onUpdate('enableQSJ', v)}
          disabled={disabled}
        />

        {params.enableQSJ && (
          <div className="ml-6">
            <Toggle
              label={t('pureQSJ', lang)}
              description={t('pureQSJDesc', lang)}
              checked={params.pureQSJ}
              onChange={(v) => onUpdate('pureQSJ', v)}
              disabled={disabled}
            />
          </div>
        )}

        <Toggle
          label={t('enableForensicBoost', lang)}
          description={t('enableForensicBoostDesc', lang)}
          checked={params.enableForensicBoost}
          onChange={(v) => onUpdate('enableForensicBoost', v)}
          disabled={disabled}
        />

        <Toggle
          label={t('enableNoiseReduction', lang)}
          description={t('enableNoiseReductionDesc', lang)}
          checked={params.enableNoiseReduction}
          onChange={(v) => onUpdate('enableNoiseReduction', v)}
          disabled={disabled}
        />

        <Toggle
          label={t('enableHumRemoval', lang)}
          description={t('enableHumRemovalDesc', lang)}
          checked={params.enableHumRemoval}
          onChange={(v) => onUpdate('enableHumRemoval', v)}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
