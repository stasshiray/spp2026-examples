import type { Logger } from "pino";

const methodLoggers = new WeakMap<object, Logger>();

export function bindMethodLogger(target: object, log: Logger) {
  methodLoggers.set(target, log);
}

function logDuration(target: object, method: string, started: number) {
  const log = methodLoggers.get(target);
  log?.info(
    { method, durationMs: Math.round(performance.now() - started) },
    "matching method finished",
  );
}

export function timed<This extends object, Args extends unknown[], Result>(
  original: (this: This, ...args: Args) => Result,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Result>,
) {
  const method = String(context.name);

  return function (this: This, ...args: Args): Result {
    const started = performance.now();

    const result = original.apply(this, args);

    if (result instanceof Promise) {
      return result.finally(() => {
        logDuration(this, method, started);
      }) as Result;
    }

    logDuration(this, method, started);

    return result;
  };
}
