import { useEffect, useMemo } from "react";

import type { WidgetMode } from "../../shared/widget-config.js";
import { parseWidgetConfig } from "../../shared/widget-config.js";
import { WidgetRenderer } from "../components/widget-renderer.js";
import { useLivePrice, usePriceHistory } from "../hooks/use-market.js";

interface RendererPageProps {
  mode: WidgetMode;
}

export function RendererPage({ mode }: RendererPageProps) {
  const config = useMemo(() => parseWidgetConfig(new URLSearchParams(window.location.search), mode), [mode]);
  const { price, connectionState } = useLivePrice(config.currency);
  const { points } = usePriceHistory(config.currency, config.range, config.showChart);

  useEffect(() => {
    document.documentElement.classList.add("renderer-document");
    document.body.dataset.rendererBackground = config.background;
    document.title = `BTC / ${config.currency} — PRICEB.TC`;
    return () => {
      document.documentElement.classList.remove("renderer-document");
      delete document.body.dataset.rendererBackground;
    };
  }, [config.background, config.currency]);

  return (
    <main className="renderer-page">
      <WidgetRenderer config={config} mode={mode} price={price} history={points} connectionState={connectionState} />
    </main>
  );
}
