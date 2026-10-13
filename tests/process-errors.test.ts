import { describe, expect, it, vi } from "vitest";

import {
  handleUncaughtException,
  handleUnhandledRejection,
  isTransientNetworkError,
} from "../src/server/process-errors.js";

describe("process error handlers", () => {
  it("recognizes EHOSTUNREACH, ECONNRESET, and fetch failed as transient network errors", () => {
    expect(
      isTransientNetworkError(
        Object.assign(new TypeError("fetch failed"), {
          cause: Object.assign(new Error("connect EHOSTUNREACH 1.1.1.1:443"), { code: "EHOSTUNREACH" }),
        }),
      ),
    ).toBe(true);
    expect(
      isTransientNetworkError(
        Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }),
      ),
    ).toBe(true);
    expect(isTransientNetworkError(new TypeError("fetch failed"))).toBe(true);
    expect(isTransientNetworkError(new Error("boom"))).toBe(false);
  });

  it("logs unhandled rejections without exiting", () => {
    const logger = { error: vi.fn() };
    const exit = vi.fn() as unknown as (code: number) => never;
    const error = Object.assign(new TypeError("fetch failed"), {
      cause: { code: "EHOSTUNREACH" },
    });
    handleUnhandledRejection(error, logger);
    expect(logger.error).toHaveBeenCalledWith("Unhandled promise rejection", error);
    expect(exit).not.toHaveBeenCalled();
  });

  it("logs uncaught network exceptions and does not exit", () => {
    const logger = { error: vi.fn() };
    const exit = vi.fn() as unknown as (code: number) => never;
    const error = Object.assign(new TypeError("fetch failed"), {
      cause: { code: "ECONNRESET" },
    });
    handleUncaughtException(error, logger, exit);
    expect(logger.error).toHaveBeenCalledWith("Uncaught exception", error);
    expect(exit).not.toHaveBeenCalled();
  });

  it("exits on non-network uncaught exceptions after logging", () => {
    const logger = { error: vi.fn() };
    const exit = vi.fn() as unknown as (code: number) => never;
    const error = new Error("disk is full");
    handleUncaughtException(error, logger, exit);
    expect(logger.error).toHaveBeenCalledWith("Uncaught exception", error);
    expect(exit).toHaveBeenCalledWith(1);
  });
});
