export type SwipeKind = "pass" | "like" | "superlike";

export type SwipeAction =
  | { kind: "pass"; targetId: number }
  | { kind: "like"; targetId: number }
  | { kind: "superlike"; targetId: number; note: string };

export type MatchOutcome =
  { status: "passed" } | { status: "liked"; mutual: false } | { status: "matched"; mutual: true };

export type OutcomeOf<K extends SwipeKind> = K extends "pass"
  ? { status: "passed" }
  : { status: "liked"; mutual: false } | { status: "matched"; mutual: true };

export type PositiveSwipe = Exclude<SwipeKind, "pass">;

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}

export function isPositiveSwipe(kind: SwipeKind): kind is PositiveSwipe {
  return kind !== "pass";
}

type SwipeHandler = (action: SwipeAction, mutual: boolean) => MatchOutcome;

function positiveOutcome(_action: SwipeAction, mutual: boolean): MatchOutcome {
  return mutual ? { status: "matched", mutual: true } : { status: "liked", mutual: false };
}

const swipeHandlers = {
  pass: (_action: SwipeAction, _mutual: boolean) => ({ status: "passed" as const }),
  like: positiveOutcome,
  superlike: positiveOutcome,
} satisfies Record<SwipeKind, SwipeHandler>;

export function applySwipe(
  action: Extract<SwipeAction, { kind: "pass" }>,
  mutual: boolean,
): OutcomeOf<"pass">;
export function applySwipe(
  action: Extract<SwipeAction, { kind: "like" }>,
  mutual: boolean,
): OutcomeOf<"like">;
export function applySwipe(
  action: Extract<SwipeAction, { kind: "superlike" }>,
  mutual: boolean,
): OutcomeOf<"superlike">;
export function applySwipe(action: SwipeAction, mutual: boolean): MatchOutcome;
export function applySwipe(action: SwipeAction, mutual: boolean): MatchOutcome {
  switch (action.kind) {
    case "pass":
      return swipeHandlers.pass(action, mutual);
    case "like":
      return swipeHandlers.like(action, mutual);
    case "superlike":
      return swipeHandlers.superlike(action, mutual);
    default:
      return assertNever(action);
  }
}
