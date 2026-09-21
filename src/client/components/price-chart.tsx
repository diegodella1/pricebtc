import { useId, useMemo } from "react";

import type { HistoryPoint } from "../../shared/contracts.js";

interface PriceChartProps {
  points: HistoryPoint[];
  positive?: boolean;
  compact?: boolean;
  showVolume?: boolean;
  loading?: boolean;
  error?: string | null;
}

interface ChartGeometry {
  line: string;
  area: string;
  volumes: Array<{ x: number; height: number; width: number }>;
}

const WIDTH = 600;
const HEIGHT = 180;
const PADDING = 8;
const VOLUME_HEIGHT_RATIO = 0.25;

function getGeometry(points: HistoryPoint[], showVolume: boolean): ChartGeometry | null {
  const values = points.map(({ price }) => Number(price)).filter(Number.isFinite);
  if (values.length < 2) return null;

  let minimum = values[0] ?? 0;
  let maximum = minimum;
  for (const value of values) {
    if (value < minimum) minimum = value;
    if (value > maximum) maximum = value;
  }
  const spread = maximum - minimum || Math.max(Math.abs(maximum) * 0.01, 1);
  
  const priceHeight = showVolume ? HEIGHT * (1 - VOLUME_HEIGHT_RATIO) : HEIGHT;
  const usablePriceHeight = priceHeight - PADDING * 2;
  const usableWidth = WIDTH - PADDING * 2;

  const coordinates = values.map((value, index) => {
    const x = PADDING + (index / (values.length - 1)) * usableWidth;
    const y = PADDING + (1 - (value - minimum) / spread) * usablePriceHeight;
    return [x, y] as const;
  });
  const line = coordinates.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} L${(WIDTH - PADDING).toFixed(2)},${priceHeight} L${PADDING},${priceHeight} Z`;

  let volumes: Array<{ x: number; height: number; width: number }> = [];
  if (showVolume && points.length > 0) {
    const volumeValues = points.map(({ volume }) => Number(volume)).filter(Number.isFinite);
    const maxVolume = Math.max(...volumeValues, 1);
    const volumeTop = priceHeight + PADDING;
    const volumeBottom = HEIGHT - PADDING;
    const usableVolumeHeight = volumeBottom - volumeTop;
    const barWidth = usableWidth / values.length;

    volumes = volumeValues.map((vol, index) => {
      const normalizedHeight = (vol / maxVolume) * usableVolumeHeight;
      return {
        x: PADDING + (index / values.length) * usableWidth,
        height: normalizedHeight,
        width: barWidth * 0.8,
      };
    });
  }

  return { line, area, volumes };
}

export function PriceChart({ points, positive = true, compact = false, showVolume = false, loading = false, error = null }: PriceChartProps) {
  const rawId = useId();
  const gradientId = `chart-${rawId.replaceAll(":", "")}`;
  const geometry = useMemo(() => getGeometry(points, showVolume), [points, showVolume]);

  if (!geometry) {
    if (loading) {
      return (
        <div className={`chart-placeholder${compact ? " chart-placeholder--compact" : ""}`} role="status">
          <span className="chart-placeholder__label">Loading Bitcoin price history…</span>
        </div>
      );
    }
    return (
      <div className={`chart-empty${compact ? " chart-empty--compact" : ""}`} role="status" title={error ?? undefined}>
        HISTORY UNAVAILABLE
      </div>
    );
  }

  return (
    <div className={`price-chart${compact ? " price-chart--compact" : ""}${positive ? " is-positive" : " is-negative"}${showVolume ? " price-chart--with-volume" : ""}`}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label="Bitcoin price chart">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="price-chart__area" d={geometry.area} fill={`url(#${gradientId})`} />
        <path className="price-chart__line" d={geometry.line} vectorEffect="non-scaling-stroke" />
        {showVolume && geometry.volumes.map((vol, index) => (
          <rect
            key={index}
            className="price-chart__volume"
            x={vol.x}
            y={HEIGHT - PADDING - vol.height}
            width={vol.width}
            height={vol.height}
            opacity="0.5"
          />
        ))}
      </svg>
    </div>
  );
}
