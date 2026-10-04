/**
 * Client-safe audit actor labels (FR-AUD-06 / FR-AUD-08).
 * Persist UUIDs in the database; resolve names via User (actor master) for UI / SQL JOINs.
 */

export const SYSTEM_ACTOR_ID =
  "00000000-0000-4000-8000-000000000001" as const;

export const SYSTEM_ACTOR_DISPLAY_NAME = "System (automated)";

export const SYSTEM_ACTOR_EMAIL = "system@internal";

export function resolveActorDisplayName(
  actorId: string,
  liveName: string | null | undefined,
): string {
  if (actorId === SYSTEM_ACTOR_ID) {
    return SYSTEM_ACTOR_DISPLAY_NAME;
  }
  if (liveName && liveName.trim()) {
    return liveName.trim();
  }
  return "Former user";
}
