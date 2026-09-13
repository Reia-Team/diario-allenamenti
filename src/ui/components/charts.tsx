import { useEffect, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { ChartPoint } from '../../domain/analysis';
import type { TrendResult } from '../../domain/trend';
import { chartTimeToISO, formatDateIt, formatDateShort } from '../../domain/dates';
import { formatNumber } from '../../domain/format';
import { useSettings } from '../hooks';

export interface ChartColors {
  accent: string;
  good: string;
  bad: string;
  neutral: string;
  grid: string;
  text: string;
  surface: string;
}

function readColors(): ChartColors {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    accent: v('--accent', '#5b8cff'),
    good: v('--good', '#34d27b'),
    bad: v('--bad', '#ff6464'),
    neutral: v('--neutral', '#a7afbf'),
    grid: v('--border', '#323847'),
    text: v('--muted', '#a7afbf'),
    surface: v('--surface-3', '#2c3140'),
  };
}

/** Colori del tema correnti (le variabili CSS non sono applicabili agli attributi SVG di Recharts). */
export function useChartColors(): ChartColors {
  const { theme } = useSettings();
  const [colors, setColors] = useState(readColors);
  useEffect(() => {
    const id = requestAnimationFrame(() => setColors(readColors()));
    return () => cancelAnimationFrame(id);
  }, [theme]);
  return colors;
}

const DAY = 86_400_000;

interface TooltipProps {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
  format: (v: number) => string;
}

function PointTooltip({ active, payload, format }: TooltipProps) {
  const p = payload?.[0]?.payload;
  if (!active || !p || p.date === null) return null;
  return (
    <div className="card tight small" style={{ boxShadow: '0 4px 16px rgba(0,0,0,.3)' }}>
      <div className="strong">{formatDateIt(p.date)}</div>
      <div>{p.value === null ? 'Dato non registrato' : format(p.value)}</div>
      {p.trend !== null && <div className="muted tiny">Tendenza: {format(p.trend)}</div>}
    </div>
  );
}

/**
 * Grafico di progressione: punti reali collegati solo tra sessioni vicine (valori null = linea interrotta)
 * e retta di tendenza tratteggiata colorata in base al trend.
 */
export function ProgressChart({ points, trend, format, ariaLabel }: {
  points: ChartPoint[];
  trend: TrendResult;
  format: (v: number) => string;
  ariaLabel: string;
}) {
  const colors = useChartColors();
  const times = points.map((p) => p.t);
  const min = Math.min(...times);
  const max = Math.max(...times);
  const pad = Math.max(2 * DAY, (max - min) * 0.04);
  const trendColor = trend.status === 'positive' ? colors.good : trend.status === 'negative' ? colors.bad : colors.neutral;

  return (
    <div className="chart-box" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 10, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={[min - pad, max + pad]}
            tickFormatter={(t: number) => formatDateShort(chartTimeToISO(t))}
            stroke={colors.text}
            fontSize={12}
            minTickGap={24}
          />
          <YAxis stroke={colors.text} fontSize={12} width={46} domain={['auto', 'auto']} tickFormatter={(v: number) => formatNumber(v, 1)} />
          <Tooltip content={<PointTooltip format={format} />} />
          {trend.status !== 'insufficient' && (
            <Line dataKey="trend" name="Tendenza" stroke={trendColor} strokeWidth={2} strokeDasharray="6 5" dot={false} activeDot={false} connectNulls isAnimationActive={false} />
          )}
          <Line
            dataKey="value"
            name="Valore"
            stroke={colors.accent}
            strokeWidth={3}
            dot={{ r: 4, fill: colors.accent, strokeWidth: 0 }}
            activeDot={{ r: 6 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WeeklyBars({ data, dataKey, format, ariaLabel, color }: {
  data: { label: string; [k: string]: number | string | null }[];
  dataKey: string;
  format: (v: number) => string;
  ariaLabel: string;
  color?: string;
}) {
  const colors = useChartColors();
  return (
    <div className="chart-box sm" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" stroke={colors.text} fontSize={11} interval="preserveStartEnd" minTickGap={8} />
          <YAxis stroke={colors.text} fontSize={11} width={44} allowDecimals={false} tickFormatter={(v: number) => formatNumber(v, 0)} />
          <Tooltip
            cursor={{ fill: colors.surface, opacity: 0.4 }}
            formatter={(v) => (typeof v === 'number' ? format(v) : String(v))}
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)' }}
          />
          <Bar dataKey={dataKey} fill={color ?? colors.accent} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
