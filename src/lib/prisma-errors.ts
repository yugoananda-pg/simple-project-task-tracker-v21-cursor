import { Prisma } from "@prisma/client";

/** True when a Prisma write hit a unique constraint (e.g. duplicate email). */
export function isPrismaUniqueViolation(
  error: unknown,
  field?: string,
): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }
  if (!field) return true;
  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.some(
      (item) => typeof item === "string" && item.toLowerCase().includes(field),
    );
  }
  if (typeof target === "string") {
    return target.toLowerCase().includes(field);
  }
  return true;
}
