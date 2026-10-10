type Loggable = {
  log?: { info: (obj: object, msg?: string) => void };
};

export function timedLegacy(
  _target: object,
  propertyKey: string | symbol,
  descriptor: PropertyDescriptor,
): PropertyDescriptor {
  const original: unknown = descriptor.value;

  if (typeof original !== "function") {
    return descriptor;
  }

  const method = String(propertyKey);
  descriptor.value = function (this: Loggable, ...args: unknown[]) {
    const started = performance.now();

    const result = original.apply(this, args);
    this.log?.info(
      { method, durationMs: Math.round(performance.now() - started) },
      "matching method finished",
    );

    return result;
  };

  return descriptor;
}
