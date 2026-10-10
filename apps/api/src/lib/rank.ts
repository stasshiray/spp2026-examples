// Предикат знает тип поля: city — string, age — number.
export type FieldPredicates<T> = {
  [K in keyof T]?: (value: T[K]) => boolean;
};

export function topBy<T>(items: readonly T[], score: (item: T) => number, limit: number): T[] {
  return [...items].sort((left, right) => score(right) - score(left)).slice(0, limit);
}

export function bestOf<T extends { score: number }>(items: readonly T[]): T | undefined {
  return items.reduce<T | undefined>((best, item) => {
    if (!best || item.score > best.score) {
      return item;
    }

    return best;
  }, undefined);
}

export function matchesPredicates<T>(item: T, predicates: FieldPredicates<T>): boolean {
  const keys = Object.keys(predicates) as (keyof T)[];

  return keys.every((key) => {
    const predicate = predicates[key];

    return predicate === undefined || predicate(item[key]);
  });
}
