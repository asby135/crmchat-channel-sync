export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delayMs: number,
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  let lastCall = 0;
  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    const now = Date.now();
    const elapsed = now - lastCall;
    if (elapsed < delayMs) {
      await sleep(delayMs - elapsed);
    }
    lastCall = Date.now();
    return fn(...args) as ReturnType<T>;
  };
}
