import { describe, expect, it, vi } from "vitest";

import { parseEnvironment } from "../src/server/config.js";
import {
  applySelfCheckResult,
  localHealthzUrl,
  probeLocalHealthz,
  startHttpSelfCheck,
} from "../src/server/http-self-check.js";
import { startBindTimeout } from "../src/server/startup-guard.js";
import { logStartup } from "../src/server/startup-log.js";

describe("startup bind timeout", () => {
  it("logs to stderr and exits when the HTTP server does not bind in time", () => {
    let fire: (() => void) | undefined;
    const exit = vi.fn();
    const write = vi.fn();
    const now = () => new Date("2026-10-15T12:00:00.000Z");

    startBindTimeout({
      host: "127.0.0.1",
      port: 3466,
      timeoutMs: 60_000,
      write,
      exit,
      now,
      schedule: (callback) => {
        fire = callback;
        return () => {
          fire = undefined;
        };
      },
    });

    fire?.();
    expect(write).toHaveBeenCalledWith(
      "2026-10-15T12:00:00.000Z [fatal] HTTP server failed to bind 127.0.0.1:3466 within 60s; exiting so systemd can restart\n",
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("clears the timer once the HTTP server is bound", () => {
    let fire: (() => void) | undefined;
    const exit = vi.fn();
    const write = vi.fn();

    const guard = startBindTimeout({
      host: "127.0.0.1",
      port: 3466,
      timeoutMs: 60_000,
      write,
      exit,
      schedule: (callback) => {
        fire = callback;
        return () => {
          fire = undefined;
        };
      },
    });

    guard.clear();
    fire?.();
    expect(write).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it("ignores a late fire after clear even if the scheduler still holds the callback", () => {
    let fire: (() => void) | undefined;
    const exit = vi.fn();
    const write = vi.fn();

    const guard = startBindTimeout({
      host: "127.0.0.1",
      port: 3466,
      timeoutMs: 1,
      write,
      exit,
      schedule: (callback) => {
        fire = callback;
        return () => undefined;
      },
    });

    guard.clear();
    fire?.();
    expect(exit).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
});

describe("HTTP self-check", () => {
  const url = "http://127.0.0.1:3466/healthz";

  it("exits after N consecutive local /healthz probe failures", () => {
    const exit = vi.fn();
    const write = vi.fn();
    const now = () => new Date("2026-10-15T15:00:00.000Z");
    const state = { consecutiveFailures: 0 };
    const options = { url, failureThreshold: 3, write, exit, now };

    expect(applySelfCheckResult(state, false, options)).toBe("retry");
    expect(applySelfCheckResult(state, false, options)).toBe("retry");
    expect(exit).not.toHaveBeenCalled();
    expect(applySelfCheckResult(state, false, options)).toBe("exit");
    expect(exit).toHaveBeenCalledWith(1);
    expect(write).toHaveBeenCalledWith(
      "2026-10-15T15:00:00.000Z [fatal] HTTP self-check failed 3 consecutive times for http://127.0.0.1:3466/healthz; exiting so systemd can restart\n",
    );
  });

  it("resets the failure count after a successful probe", () => {
    const exit = vi.fn();
    const state = { consecutiveFailures: 0 };
    const options = { url, failureThreshold: 3, write: vi.fn(), exit };

    applySelfCheckResult(state, false, options);
    applySelfCheckResult(state, false, options);
    expect(applySelfCheckResult(state, true, options)).toBe("ok");
    expect(state.consecutiveFailures).toBe(0);
    expect(applySelfCheckResult(state, false, options)).toBe("retry");
    expect(exit).not.toHaveBeenCalled();
  });

  it("treats any HTTP response as a live listener, including degraded health", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ status: "degraded" }), { status: 200 }));
    await expect(probeLocalHealthz(url, fetchImpl)).resolves.toBe(true);
  });

  it("treats connection failures as a dead listener", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(probeLocalHealthz(url, fetchImpl)).resolves.toBe(false);
  });

  it("probes loopback when the server binds 0.0.0.0", () => {
    expect(localHealthzUrl("0.0.0.0", 3466)).toBe("http://127.0.0.1:3466/healthz");
    expect(localHealthzUrl("::", 3466)).toBe("http://[::1]:3466/healthz");
    expect(localHealthzUrl("127.0.0.1", 3466)).toBe("http://127.0.0.1:3466/healthz");
  });

  it("runs the scheduled probe and exits after the configured streak", async () => {
    const exit = vi.fn();
    const write = vi.fn();
    let tick: (() => void) | undefined;
    const probe = vi.fn(async () => false);

    const check = startHttpSelfCheck({
      url,
      intervalMs: 30_000,
      failureThreshold: 2,
      probe,
      write,
      exit,
      now: () => new Date("2026-10-15T15:01:00.000Z"),
      schedule: (callback) => {
        tick = callback;
        return () => {
          tick = undefined;
        };
      },
    });

    tick?.();
    await vi.waitFor(() => expect(probe).toHaveBeenCalledTimes(1));
    expect(exit).not.toHaveBeenCalled();
    tick?.();
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
    expect(probe).toHaveBeenCalledTimes(2);
    check.stop();
  });
});

describe("startup logging and config", () => {
  it("writes timestamped startup milestones to stderr", () => {
    const write = vi.fn();
    logStartup(
      "HTTP listening",
      { host: "127.0.0.1", port: 3466 },
      () => new Date("2026-10-15T12:00:00.000Z"),
      write,
    );
    expect(write).toHaveBeenCalledWith(
      "2026-10-15T12:00:00.000Z [startup] HTTP listening host=127.0.0.1 port=3466\n",
    );
  });

  it("defaults the bind timeout and self-check knobs", () => {
    const environment = parseEnvironment({});
    expect(environment.STARTUP_BIND_TIMEOUT_SECONDS).toBe(60);
    expect(environment.HTTP_SELFCHECK_INTERVAL_SECONDS).toBe(30);
    expect(environment.HTTP_SELFCHECK_FAILURE_THRESHOLD).toBe(3);
  });

  it("reads bind timeout and self-check overrides from the environment", () => {
    const environment = parseEnvironment({
      STARTUP_BIND_TIMEOUT_SECONDS: "90",
      HTTP_SELFCHECK_INTERVAL_SECONDS: "15",
      HTTP_SELFCHECK_FAILURE_THRESHOLD: "5",
    });
    expect(environment.STARTUP_BIND_TIMEOUT_SECONDS).toBe(90);
    expect(environment.HTTP_SELFCHECK_INTERVAL_SECONDS).toBe(15);
    expect(environment.HTTP_SELFCHECK_FAILURE_THRESHOLD).toBe(5);
  });
});
