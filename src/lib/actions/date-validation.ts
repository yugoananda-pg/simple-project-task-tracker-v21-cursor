import { ActionError } from "@/src/lib/actions/errors";
import { isFutureLocalDate } from "@/src/lib/task-defaults";

/**
 * Actual / achieved calendar dates record events that have already occurred.
 * Reject strictly future local YYYY-MM-DD values (planned targets may still be future).
 */
export function assertActualDateNotFuture(
  value: string | null | undefined,
  label: string,
): void {
  if (isFutureLocalDate(value)) {
    throw new ActionError(`${label} cannot be in the future.`, "VALIDATION");
  }
}
