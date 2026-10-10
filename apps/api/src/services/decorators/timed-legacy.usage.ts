import { timedLegacy } from "./timed-legacy";

export class LegacyTimedScore {
  log = {
    info(_obj: object, _msg?: string) {},
  };

  @timedLegacy
  score(left: number, right: number) {
    return left + right;
  }
}
