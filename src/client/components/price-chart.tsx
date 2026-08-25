import { useId, useMemo } from "react";

import type { HistoryPoint } from "../../shared/contracts.js";

interface PriceChartProps {
  points: HistoryPoint[];
  positive?: boolean;
  compact?: boolean;
}

interface ChartGeometry {
  line: string;
  area: string;
}

const WIDTH = 600;
const HEIGHT = 180;
const PADDING = 8;

function getGeometry(points: HistoryPoint[]): ChartGeometry | null {
  const values = points.map(({ price }) => Number(price)).filter(Number.isFinite);
  if (values.length < 2) return null;

  let minimum = values[0] ?? 0;
  let maximum = minimum;
  for (const value of values) {
    if (value < minimum) minimum = value;
    if (value > maximum) maximum = value;
  }
  const spread = maximum - minimum || Math.max(Math.abs(maximum) * 0.01, 1);
  const usableHeight = HEIGHT - PADDING * 2;
  const usableWidth = WIDTH - PADDING * 2;

  const coordinates = values.map((value, index) => {
    const x = PADDING + (index / (values.length - 1)) * usableWidth;
    const y = PADDING + (1 - (value - minimum) / spread) * usableHeight;
    return [x, y] as const;
  });
  const line = coordinates.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} L${(WIDTH - PADDING).toFixed(2)},${HEIGHT} L${PADDING},${HEIGHT} Z`;
  return { line, area };
}

export function PriceChart({ points, positive = true, compact = false }: PriceChartProps) {
  const rawId = useId();
  const gradientId = `chart-${rawId.replaceAll(":", "")}`;
  const geometry = useMemo(() => getGeometry(points), [points]);

  if (!geometry) {
    return <div className={`chart-placeholder${compact ? " chart-placeholder--compact" : ""}`} aria-hidden="true" />;
  }

  return (
    <div className={`price-chart${compact ? " price-chart--compact" : ""}${positive ? " is-positive" : " is-negative"}`}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label="Bitcoin price chart">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="price-chart__area" d={geometry.area} fill={`url(#${gradientId})`} />
        <path className="price-chart__line" d={geometry.line} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
