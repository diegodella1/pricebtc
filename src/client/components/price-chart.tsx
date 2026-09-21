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
  volumes: Array<{ x: number; height: number; width: number; buyHeight: number; sellHeight: number; label: string }>;
}

const WIDTH = 600;
const HEIGHT = 180;
const PADDING = 8;
const VOLUME_HEIGHT_RATIO = 0.25;

function volumeAmount(value: string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function getGeometry(points: HistoryPoint[], showVolume: boolean): ChartGeometry | null {
  const validPoints = points.filter(({ price }) => Number.isFinite(Number(price)));
  const values = validPoints.map(({ price }) => Number(price));
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

  let volumes: ChartGeometry["volumes"] = [];
  if (showVolume && points.length > 0) {
    const volumeValues = validPoints.map(point => {
      const buy = volumeAmount(point.buyVolume);
      const sell = volumeAmount(point.sellVolume);
      return { buy, sell, total: Math.max(volumeAmount(point.volume), buy + sell) };
    });
    const maxVolume = Math.max(...volumeValues.map(volume => volume.total), Number.EPSILON);
    const volumeTop = priceHeight + PADDING;
    const volumeBottom = HEIGHT - PADDING;
    const usableVolumeHeight = volumeBottom - volumeTop;
    const barWidth = usableWidth / values.length;

    volumes = volumeValues.map((vol, index) => {
      const point = validPoints[index]!;
      const split = point.buyVolume != null && point.sellVolume != null;
      return {
        x: PADDING + (index / values.length) * usableWidth,
        height: (vol.total / maxVolume) * usableVolumeHeight,
        buyHeight: (vol.buy / maxVolume) * usableVolumeHeight,
        sellHeight: (vol.sell / maxVolume) * usableVolumeHeight,
        width: barWidth * 0.8,
        label: `${point.timestamp} · Candle volume: ${point.volume ?? "unavailable"} BTC. ${split ? `Recorded buys: ${point.buyVolume} BTC; recorded sells: ${point.sellVolume} BTC. Split may be partial.` : "Buy/sell split unavailable."}`,
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
          <g key={index}>
            <title>{vol.label}</title>
            <rect className="price-chart__volume" x={vol.x} y={HEIGHT - PADDING - vol.height} width={vol.width} height={vol.height} />
            {vol.buyHeight > 0 && <rect className="price-chart__buy-volume" x={vol.x} y={HEIGHT - PADDING - vol.buyHeight} width={vol.width} height={vol.buyHeight} />}
            {vol.sellHeight > 0 && <rect className="price-chart__sell-volume" x={vol.x} y={HEIGHT - PADDING - vol.buyHeight - vol.sellHeight} width={vol.width} height={vol.sellHeight} />}
          </g>
        ))}
      </svg>
    </div>
  );
}
