import { serializeWidgetConfig, WIDGET_LAYOUT_META, type WidgetConfig, type WidgetMode } from "../../shared/widget-config.js";

export function widgetExport(config: WidgetConfig, mode: WidgetMode, origin = window.location.origin) {
  const query = serializeWidgetConfig(config).toString();
  const url = `${origin}/${mode}?${query}`;
  const safeUrl = url.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  const meta = WIDGET_LAYOUT_META[config.layout];
  const code = `<iframe src="${safeUrl}" title="Live Bitcoin price — ${meta.label}" loading="lazy" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" style="border:0;display:block;width:100%;max-width:100%;min-height:${meta.minHeight}px;aspect-ratio:${meta.aspectRatio}" data-pricebtc-layout="${config.layout}"></iframe>`;
  const markdown = `[![Bitcoin Price](${url})](${origin}/studio)`;
  return { query, url, code, markdown };
}

export function getWidgetDimensions(config: WidgetConfig) {
  const meta = WIDGET_LAYOUT_META[config.layout];
  return {
    minWidth: meta.minWidth,
    minHeight: meta.minHeight,
    aspectRatio: meta.aspectRatio,
    aspectLabel: meta.aspectLabel,
  };
}

export async function writeClipboard(value: string): Promise<void> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall through for hosts without Clipboard API permission.
    }
  }

  const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const helper = document.createElement("textarea");
  helper.value = value;
  helper.setAttribute("readonly", "");
  helper.style.position = "fixed";
  helper.style.opacity = "0";
  document.body.append(helper);
  helper.select();
  const copied = document.execCommand("copy");
  helper.remove();
  previouslyFocused?.focus({ preventScroll: true });
  if (!copied) throw new Error("Clipboard access unavailable");
}
