import { useState, type MouseEvent } from 'react';
import type { Metric, ReadingPointDto } from '@org/shared';
import {
  METRIC_LABELS,
  formatDateTime,
  formatDay,
  formatTime,
  formatValue,
} from '../lib/format';

const W = 800;
const H = 260;
const PAD = { top: 16, right: 16, bottom: 28, left: 44 };

/** A "nice" step (1, 2, 5 x 10^n) so axis labels land on round numbers. */
function niceStep(range: number, ticks: number): number {
  const raw = range / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / magnitude;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * magnitude;
}

export function axisBounds(
  values: number[],
  fixed?: { min: number; max: number },
): { min: number; max: number; step: number } {
  if (fixed) return { ...fixed, step: niceStep(fixed.max - fixed.min, 4) };
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || Math.max(1, Math.abs(hi) * 0.1);
  const step = niceStep(span, 4);
  return {
    min: Math.floor((lo - span * 0.1) / step) * step,
    max: Math.ceil((hi + span * 0.1) / step) * step,
    step,
  };
}

type Props = {
  metric: Metric;
  points: ReadingPointDto[];
  /** Pass for percentages so the axis is always 0-100. */
  fixedAxis?: { min: number; max: number };
  /** Draws a dashed line, e.g. the "needs water" limit. */
  threshold?: number;
};

export function LineChart({ metric, points, fixedAxis, threshold }: Props) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <div className="chart chart--empty">No readings in this period yet.</div>
    );
  }

  const times = points.map((p) => Date.parse(p.time));
  const t0 = times[0];
  const t1 = times[times.length - 1];
  const values = points.flatMap((p) => [p.min, p.max]);
  if (threshold !== undefined) values.push(threshold);
  const { min, max, step } = axisBounds(values, fixedAxis);

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (t: number) =>
    PAD.left + (t1 === t0 ? plotW / 2 : ((t - t0) / (t1 - t0)) * plotW);
  const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * plotH;

  const line = points
    .map((p, i) => `${i ? 'L' : 'M'}${x(times[i])},${y(p.avg)}`)
    .join(' ');
  const area = `${line} L${x(t1)},${y(min)} L${x(t0)},${y(min)} Z`;
  const band =
    points.some((p) => p.min !== p.max) && points.length > 1
      ? `${points.map((p, i) => `${i ? 'L' : 'M'}${x(times[i])},${y(p.max)}`).join(' ')} ${points
          .map((_, i) => points.length - 1 - i)
          .map((i) => `L${x(times[i])},${y(points[i].min)}`)
          .join(' ')} Z`
      : null;

  const yTicks: number[] = [];
  for (let v = min; v <= max + step / 2; v += step)
    yTicks.push(Number(v.toFixed(6)));

  const spanMs = t1 - t0;
  const xLabel = (t: number) =>
    spanMs <= 2 * 24 * 3600 * 1000
      ? formatTime(new Date(t))
      : formatDay(new Date(t));
  const xTicks = [0, 1, 2, 3, 4].map((i) => t0 + (spanMs * i) / 4);

  const onMove = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const px = ((event.clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(x(times[i]) - px) < Math.abs(x(times[best]) - px)) best = i;
    }
    setHover(best);
  };

  const hovered = hover === null ? null : points[hover];

  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${METRIC_LABELS[metric]} chart with ${points.length} points`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line
              className="chart__grid"
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(v)}
              y2={y(v)}
            />
            <text
              className="chart__axis"
              x={PAD.left - 8}
              y={y(v)}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {v}
            </text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text
            key={i}
            className="chart__axis"
            x={x(t)}
            y={H - 8}
            textAnchor={
              i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'
            }
          >
            {xLabel(t)}
          </text>
        ))}
        {band && <path className="chart__band" d={band} />}
        <path className="chart__area" d={area} />
        {threshold !== undefined && (
          <g>
            <line
              className="chart__threshold"
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(threshold)}
              y2={y(threshold)}
            />
            <text
              className="chart__threshold-label"
              x={W - PAD.right - 4}
              y={y(threshold) - 6}
              textAnchor="end"
            >
              needs water below {threshold}%
            </text>
          </g>
        )}
        <path className="chart__line" d={line} />
        {points.length <= 60 &&
          points.map((p, i) => (
            <circle
              key={p.time}
              className="chart__dot"
              cx={x(times[i])}
              cy={y(p.avg)}
              r={2.5}
            />
          ))}
        {hovered && hover !== null && (
          <g>
            <line
              className="chart__cursor"
              x1={x(times[hover])}
              x2={x(times[hover])}
              y1={PAD.top}
              y2={H - PAD.bottom}
            />
            <circle
              className="chart__point"
              cx={x(times[hover])}
              cy={y(hovered.avg)}
              r={5}
            />
          </g>
        )}
      </svg>
      <div className="chart__readout" aria-live="polite">
        {hovered ? (
          <>
            <strong>{formatValue(metric, hovered.avg)}</strong>
            <span>{formatDateTime(hovered.time)}</span>
            {hovered.samples > 1 && (
              <span>
                range {formatValue(metric, hovered.min)} to{' '}
                {formatValue(metric, hovered.max)}
              </span>
            )}
          </>
        ) : (
          <span>Hover over the chart for exact values.</span>
        )}
      </div>
    </div>
  );
}
