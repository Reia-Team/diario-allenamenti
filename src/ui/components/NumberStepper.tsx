import { useEffect, useRef, useState } from 'react';
import { IconMinus, IconPlus } from '../icons';
import { formatNumber, parseDecimal, round } from '../../domain/format';

interface Props {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  step: number;
  min?: number;
  max?: number;
  decimals?: number;
  integer?: boolean;
  unit?: string;
  compact?: boolean;
  /** Valore da cui partire premendo + quando il campo è vuoto. */
  startFrom?: number;
  disabled?: boolean;
}

/**
 * Campo numerico per l'uso in palestra: pulsanti −/+ grandi, tocco sul valore per digitare.
 * Un campo vuoto resta vuoto (null): non viene mai trasformato in 0.
 */
export function NumberStepper({
  label, value, onChange, step, min = 0, max = 9999, decimals = 2, integer, unit, compact, startFrom, disabled,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const clamp = (v: number) => {
    let n = Math.min(max, Math.max(min, v));
    n = integer ? Math.round(n) : round(n, 3);
    return n;
  };

  const bump = (dir: 1 | -1) => {
    if (value === null) {
      onChange(clamp(startFrom ?? (dir > 0 ? step : min)));
      return;
    }
    onChange(clamp(value + dir * step));
  };

  const commit = () => {
    const parsed = parseDecimal(text);
    onChange(parsed === null ? null : clamp(parsed));
    setEditing(false);
  };

  return (
    <div className={`stepper${compact ? ' compact' : ''}`} role="group" aria-label={label}>
      <button type="button" aria-label={`Diminuisci ${label.toLowerCase()}`} onClick={() => bump(-1)} disabled={disabled || (value !== null && value <= min)}>
        <IconMinus size={compact ? 22 : 28} />
      </button>
      <div
        className="value"
        onClick={() => {
          if (disabled || editing) return;
          setText(value === null ? '' : String(value).replace('.', ','));
          setEditing(true);
        }}
      >
        {editing ? (
          <input
            ref={inputRef}
            aria-label={label}
            inputMode={integer ? 'numeric' : 'decimal'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <strong className={value === null ? 'empty' : undefined} aria-live="polite">
            {value === null ? '—' : formatNumber(value, integer ? 0 : decimals)}
          </strong>
        )}
        <small>{unit ? `${label} · ${unit}` : label}</small>
      </div>
      <button type="button" aria-label={`Aumenta ${label.toLowerCase()}`} onClick={() => bump(1)} disabled={disabled || (value !== null && value >= max)}>
        <IconPlus size={compact ? 22 : 28} />
      </button>
    </div>
  );
}
