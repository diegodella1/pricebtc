import { logFatal } from "./startup-log.js";

export interface BindTimeoutHandle {
  clear(): void;
}

export interface BindTimeoutOptions {
  host: string;
  port: number;
  timeoutMs: number;
  write?: (chunk: string) => void;
  exit?: (code: number) => void;
  now?: () => Date;
  schedule?: (callback: () => void, delayMs: number) => () => void;
}

function defaultSchedule(callback: () => void, delayMs: number): () => void {
  const timer = setTimeout(callback, delayMs);
  return () => clearTimeout(timer);
}

export function startBindTimeout(options: BindTimeoutOptions): BindTimeoutHandle {
  const write = options.write;
  const exit = options.exit ?? ((code) => process.exit(code));
  const schedule = options.schedule ?? defaultSchedule;
  let cleared = false;

  const cancel = schedule(() => {
    if (cleared) return;
    const seconds = Math.max(1, Math.round(options.timeoutMs / 1000));
    logFatal(
      `HTTP server failed to bind ${options.host}:${options.port} within ${seconds}s; exiting so systemd can restart`,
      undefined,
      options.now,
      write,
    );
    exit(1);
  }, options.timeoutMs);

  return {
    clear() {
      cleared = true;
      cancel();
    },
  };
}
