export function cryptoConfigEnabled(config: {
  enabled?: boolean;
  assets?: unknown;
} | null | undefined): boolean {
  return Boolean(config?.enabled && Array.isArray(config.assets) && config.assets.length > 0);
}
