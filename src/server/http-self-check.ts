import { logFatal } from "./startup-log.js";

const PROBE_TIMEOUT_MS = 5_000;

export function localHealthzUrl(host: string, port: number): string {
  const loopback =
    host === "0.0.0.0" ? "127.0.0.1" : host === "::" || host === "[::]" ? "::1" : host;
  const wrapped = loopback.includes(":") && !loopback.startsWith("[") ? `[${loopback}]` : loopback;
  return `http://${wrapped}:${port}/healthz`;
}

export async function probeLocalHealthz(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    return Number.isInteger(response.status);
  } catch {
    return false;
  }
}

export interface SelfCheckState {
  consecutiveFailures: number;
}

export function applySelfCheckResult(
  state: SelfCheckState,
  ok: boolean,
  options: {
    url: string;
    failureThreshold: number;
    write?: (chunk: string) => void;
    exit?: (code: number) => void;
    now?: () => Date;
  },
): "ok" | "retry" | "exit" {
  if (ok) {
    state.consecutiveFailures = 0;
    return "ok";
  }

  state.consecutiveFailures += 1;
  if (state.consecutiveFailures < options.failureThreshold) return "retry";

  logFatal(
    `HTTP self-check failed ${state.consecutiveFailures} consecutive times for ${options.url}; exiting so systemd can restart`,
    undefined,
    options.now,
    options.write,
  );
  (options.exit ?? ((code) => process.exit(code)))(1);
  return "exit";
}

export interface HttpSelfCheckOptions {
  url: string;
  intervalMs: number;
  failureThreshold: number;
  probe?: (url: string) => Promise<boolean>;
  write?: (chunk: string) => void;
  exit?: (code: number) => void;
  now?: () => Date;
  shouldRun?: () => boolean;
  schedule?: (callback: () => void, delayMs: number) => () => void;
}

export function startHttpSelfCheck(options: HttpSelfCheckOptions): { stop: () => void } {
  const state: SelfCheckState = { consecutiveFailures: 0 };
  const probe = options.probe ?? probeLocalHealthz;
  let stopped = false;

  const tick = async (): Promise<void> => {
    if (stopped || options.shouldRun?.() === false) return;
    const ok = await probe(options.url);
    if (stopped || options.shouldRun?.() === false) return;
    applySelfCheckResult(state, ok, options);
  };

  const schedule =
    options.schedule ??
    ((callback: () => void, delayMs: number) => {
      const timer = setInterval(callback, delayMs);
      return () => clearInterval(timer);
    });
  const cancel = schedule(() => {
    void tick();
  }, options.intervalMs);

  return {
    stop() {
      stopped = true;
      cancel();
    },
  };
}
