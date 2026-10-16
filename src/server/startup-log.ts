function formatDetails(details?: Record<string, unknown>): string {
  if (!details) return "";
  const parts = Object.entries(details)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`);
  return parts.length ? ` ${parts.join(" ")}` : "";
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  if (error == null) return "";
  return String(error);
}

export function writeStderrLine(line: string, write: (chunk: string) => void = (chunk) => process.stderr.write(chunk)): void {
  write(line.endsWith("\n") ? line : `${line}\n`);
}

export function logStartup(
  message: string,
  details?: Record<string, unknown>,
  now: () => Date = () => new Date(),
  write?: (chunk: string) => void,
): void {
  writeStderrLine(`${now().toISOString()} [startup] ${message}${formatDetails(details)}`, write);
}

export function logFatal(
  message: string,
  error?: unknown,
  now: () => Date = () => new Date(),
  write?: (chunk: string) => void,
): void {
  const extra = error == null ? "" : ` ${formatError(error)}`;
  writeStderrLine(`${now().toISOString()} [fatal] ${message}${extra}`, write);
}
