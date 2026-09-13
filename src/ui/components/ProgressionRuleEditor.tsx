import type { ProgressionRule, ProgressionRuleType, WeightUnit } from '../../domain/types';
import { PROGRESSION_HELP, PROGRESSION_LABEL } from '../../domain/progression';
import { kgToUnit, unitToKg } from '../../domain/units';
import { NumberStepper } from './NumberStepper';

const TYPES: ProgressionRuleType[] = ['double', 'fixed', 'percent', 'maintain', 'manual', 'none'];

export function ProgressionRuleEditor({ value, onChange, unit }: {
  value: ProgressionRule;
  onChange: (rule: ProgressionRule) => void;
  unit: WeightUnit;
}) {
  const set = (patch: Partial<ProgressionRule>) => onChange({ ...value, ...patch });
  const weightStep = unit === 'kg' ? 0.5 : 1;
  return (
    <div className="stack">
      <label className="field">
        <span>Regola</span>
        <select className="input" value={value.type} onChange={(e) => set({ type: e.target.value as ProgressionRuleType })}>
          {TYPES.map((t) => <option key={t} value={t}>{PROGRESSION_LABEL[t]}</option>)}
        </select>
        <small className="hint">{PROGRESSION_HELP[value.type]}</small>
      </label>
      {(value.type === 'double' || value.type === 'fixed') && (
        <NumberStepper
          label="Incremento"
          unit={unit}
          compact
          step={weightStep}
          min={weightStep}
          max={unit === 'kg' ? 50 : 100}
          value={kgToUnit(value.incrementKg, unit)}
          onChange={(v) => v !== null && set({ incrementKg: unitToKg(v, unit) })}
        />
      )}
      {value.type === 'percent' && (
        <>
          <NumberStepper label="Incremento" unit="%" compact step={0.5} min={0.5} max={50} value={value.percent}
            onChange={(v) => v !== null && set({ percent: v })} />
          <NumberStepper label="Arrotonda a" unit={unit} compact step={weightStep} min={weightStep} max={unit === 'kg' ? 10 : 20}
            value={kgToUnit(value.roundToKg, unit)} onChange={(v) => v !== null && set({ roundToKg: unitToKg(v, unit) })} />
        </>
      )}
      {(value.type === 'double' || value.type === 'fixed' || value.type === 'percent' || value.type === 'maintain') && (
        <NumberStepper
          label="Segnala calo oltre"
          unit="%"
          compact
          integer
          step={1}
          min={1}
          max={100}
          value={value.worseningThresholdPct}
          onChange={(v) => v !== null && set({ worseningThresholdPct: v })}
        />
      )}
    </div>
  );
}
