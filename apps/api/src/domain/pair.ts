export type PairIds = {
  profileLowId: number;
  profileHighId: number;
};

export function orderedPair(left: number, right: number): [number, number] {
  return left < right ? [left, right] : [right, left];
}

export function otherId(pair: PairIds, viewerId: number) {
  return pair.profileLowId === viewerId ? pair.profileHighId : pair.profileLowId;
}

export function isParticipant(pair: PairIds, viewerId: number) {
  return pair.profileLowId === viewerId || pair.profileHighId === viewerId;
}
