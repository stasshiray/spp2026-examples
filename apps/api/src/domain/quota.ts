export const LIKE_DAILY_LIMIT = 20;
export const SUPERLIKE_DAILY_LIMIT = 5;
export const INVITE_DAILY_LIMIT = 10;
export const REPORT_DAILY_LIMIT = 10;

export function swipeQuotaLimit(kind: "like" | "superlike"): number {
  return kind === "like" ? LIKE_DAILY_LIMIT : SUPERLIKE_DAILY_LIMIT;
}
