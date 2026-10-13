type Logger = Pick<Console, "error">;

function collectErrorParts(error: unknown): { message: string; codes: string[] } {
  const codes: string[] = [];
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      messages.push(current.message);
      if ("code" in current && current.code != null) codes.push(String(current.code));
      current = current.cause;
      continue;
    }
    if (typeof current === "object") {
      const record = current as { message?: unknown; code?: unknown; cause?: unknown };
      if (record.message != null) messages.push(String(record.message));
      if (record.code != null) codes.push(String(record.code));
      current = record.cause;
      continue;
    }
    messages.push(String(current));
    break;
  }

  return { message: messages.join(" "), codes };
}

export function isTransientNetworkError(error: unknown): boolean {
  const { message, codes } = collectErrorParts(error);
  return (
    codes.includes("EHOSTUNREACH") ||
    codes.includes("ECONNRESET") ||
    /fetch failed/i.test(message) ||
    /EHOSTUNREACH/i.test(message) ||
    /ECONNRESET/i.test(message)
  );
}

export function handleUnhandledRejection(
  reason: unknown,
  logger: Logger = console,
): void {
  logger.error("Unhandled promise rejection", reason);
}

export function handleUncaughtException(
  error: unknown,
  logger: Logger = console,
  exitProcess: (code: number) => never = (code) => process.exit(code) as never,
): void {
  logger.error("Uncaught exception", error);
  if (!isTransientNetworkError(error)) {
    exitProcess(1);
  }
}

let installed = false;

export function installProcessErrorHandlers(logger: Logger = console): void {
  if (installed) return;
  installed = true;
  process.on("unhandledRejection", (reason) => {
    handleUnhandledRejection(reason, logger);
  });
  process.on("uncaughtException", (error) => {
    handleUncaughtException(error, logger);
  });
}
