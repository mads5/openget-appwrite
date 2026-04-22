import type { KineticTierId } from "@/types";

export const TIER_ORDER: KineticTierId[] = [
  "spark",
  "current",
  "kinetic",
  "reactor",
  "fusion",
  "singularity",
];

export const TIER_DISPLAY: Record<KineticTierId, string> = {
  spark: "Spark",
  current: "Current",
  kinetic: "Kinetic",
  reactor: "Reactor",
  fusion: "Fusion",
  singularity: "Singularity",
};

export function tierLabel(t: string | undefined | null): string {
  const k = t as KineticTierId;
  return TIER_DISPLAY[k] ?? "Spark";
}

export function isAtLeastTier(
  a: KineticTierId,
  min: KineticTierId,
): boolean {
  return TIER_ORDER.indexOf(a) >= TIER_ORDER.indexOf(min);
}
