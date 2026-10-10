export type MatchReason =
  | { code: "same_city" }
  | { code: "age_gap"; years: number }
  | { code: "shared_interest"; interest: string };

export type SearchPreferences = {
  ageMin: number;
  ageMax: number;
  cities: string[];
  interests: string[];
};

type CardSlice = {
  city: string;
  age: number;
};

export function matchReasons(
  viewer: CardSlice,
  candidate: CardSlice,
  viewerWeights: Record<string, number>,
  candidateWeights: Record<string, number>,
): MatchReason[] {
  const reasons: MatchReason[] = [];

  if (viewer.city === candidate.city) {
    reasons.push({ code: "same_city" });
  }

  reasons.push({ code: "age_gap", years: Math.abs(viewer.age - candidate.age) });

  const shared = Object.keys(viewerWeights)
    .filter((interest) => Object.prototype.hasOwnProperty.call(candidateWeights, interest))
    .sort((left, right) => left.localeCompare(right, "ru"));

  for (const interest of shared) {
    reasons.push({ code: "shared_interest", interest });
  }

  return reasons;
}

export function scorePair(
  viewer: CardSlice,
  candidate: CardSlice,
  viewerWeights: Record<string, number>,
  candidateWeights: Record<string, number>,
): number {
  const cityScore = viewer.city === candidate.city ? 40 : 0;
  const ageScore = Math.max(0, 30 - Math.abs(viewer.age - candidate.age));
  let shared = 0;

  for (const interest of Object.keys(viewerWeights)) {
    if (!(interest in candidateWeights)) {
      continue;
    }

    shared += Math.min(viewerWeights[interest] ?? 0, candidateWeights[interest] ?? 0);
  }

  return cityScore + ageScore + shared;
}

export function passesPreferences(
  candidate: CardSlice,
  interestNames: readonly string[],
  preferences: SearchPreferences | null,
): boolean {
  if (!preferences) {
    return true;
  }

  if (candidate.age < preferences.ageMin || candidate.age > preferences.ageMax) {
    return false;
  }

  if (preferences.cities.length > 0 && !preferences.cities.includes(candidate.city)) {
    return false;
  }

  if (
    preferences.interests.length > 0 &&
    !preferences.interests.some((interest) => interestNames.includes(interest))
  ) {
    return false;
  }

  return true;
}
