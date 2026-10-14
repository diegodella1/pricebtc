export const DEFAULT_WATCHER_COOLDOWN = {
  errorThreshold: 5,
  cooldownBaseSeconds: 60,
  cooldownMaxSeconds: 30 * 60,
} as const;

export type WatcherCooldownPolicy = {
  errorThreshold: number;
  cooldownBaseSeconds: number;
  cooldownMaxSeconds: number;
};

export type WatcherHealthState = "ok" | "cooldown";

export function watcherCooldownPolicy(
  source?: Partial<WatcherCooldownPolicy>,
): WatcherCooldownPolicy {
  return {
    errorThreshold: source?.errorThreshold ?? DEFAULT_WATCHER_COOLDOWN.errorThreshold,
    cooldownBaseSeconds:
      source?.cooldownBaseSeconds ?? DEFAULT_WATCHER_COOLDOWN.cooldownBaseSeconds,
    cooldownMaxSeconds:
      source?.cooldownMaxSeconds ?? DEFAULT_WATCHER_COOLDOWN.cooldownMaxSeconds,
  };
}

export function watcherCooldownPolicyFromConfig(config: {
  WATCHER_ERROR_THRESHOLD: number;
  WATCHER_COOLDOWN_BASE_SECONDS: number;
  WATCHER_COOLDOWN_MAX_SECONDS: number;
}): WatcherCooldownPolicy {
  return {
    errorThreshold: config.WATCHER_ERROR_THRESHOLD,
    cooldownBaseSeconds: config.WATCHER_COOLDOWN_BASE_SECONDS,
    cooldownMaxSeconds: config.WATCHER_COOLDOWN_MAX_SECONDS,
  };
}

export function watcherCooldownSeconds(
  consecutiveErrors: number,
  policy: WatcherCooldownPolicy = watcherCooldownPolicy(),
): number {
  if (consecutiveErrors < policy.errorThreshold) return 0;
  const exponent = Math.min(consecutiveErrors - policy.errorThreshold, 20);
  return Math.min(policy.cooldownMaxSeconds, policy.cooldownBaseSeconds * 2 ** exponent);
}

export function watcherNextRetryAt(
  lastPollAt: Date | string | null | undefined,
  consecutiveErrors: number,
  policy: WatcherCooldownPolicy = watcherCooldownPolicy(),
): Date | null {
  const cooldownSec = watcherCooldownSeconds(consecutiveErrors, policy);
  if (!cooldownSec || !lastPollAt) return null;
  return new Date(new Date(lastPollAt).getTime() + cooldownSec * 1000);
}

export function isWatcherCoolingDown(
  lastPollAt: Date | string | null | undefined,
  consecutiveErrors: number,
  now: Date,
  policy: WatcherCooldownPolicy = watcherCooldownPolicy(),
): boolean {
  const nextRetry = watcherNextRetryAt(lastPollAt, consecutiveErrors, policy);
  return Boolean(nextRetry && now.getTime() < nextRetry.getTime());
}

export function watcherHealthSnapshot(
  lastPollAt: Date | string | null | undefined,
  consecutiveErrors: number,
  now: Date,
  policy: WatcherCooldownPolicy = watcherCooldownPolicy(),
): {
  lastPollAgeSec: number | null;
  consecutiveErrors: number;
  state: WatcherHealthState;
  nextRetryInSec: number;
} {
  const lastPoll = lastPollAt ? new Date(lastPollAt) : null;
  const nextRetry = watcherNextRetryAt(lastPoll, consecutiveErrors, policy);
  const inCooldownRegime = consecutiveErrors >= policy.errorThreshold;
  return {
    lastPollAgeSec: lastPoll
      ? Math.max(0, Math.round((now.getTime() - lastPoll.getTime()) / 1000))
      : null,
    consecutiveErrors,
    state: inCooldownRegime ? "cooldown" : "ok",
    nextRetryInSec: nextRetry
      ? Math.max(0, Math.round((nextRetry.getTime() - now.getTime()) / 1000))
      : 0,
  };
}
