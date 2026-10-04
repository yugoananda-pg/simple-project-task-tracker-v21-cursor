"use server";

import { revalidatePath } from "next/cache";

import {
  actionFailure,
  actionSuccess,
  ActionError,
  type ActionResult,
} from "@/src/lib/actions/errors";
import { auditCreate, auditUpdate } from "@/src/lib/audit";
import { prisma } from "@/src/lib/prisma";
import { requireApprovedSessionUser } from "@/src/lib/rbac";
import {
  dbDateToLocalDateString,
  localDateStringToDbDate,
} from "@/src/lib/task-defaults";

export type HolidayDto = {
  id: string;
  date: string;
  description: string;
  isNational: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

function requireSuperPm(
  user: Awaited<ReturnType<typeof requireApprovedSessionUser>>,
): void {
  if (user.globalRole !== "super_pm") {
    throw new ActionError(
      "Only a Super PM may manage the holiday calendar.",
      "FORBIDDEN",
    );
  }
}

function validateDescription(description: string): string {
  const trimmed = description.trim();
  if (!trimmed) {
    throw new ActionError("Please enter a holiday description.", "VALIDATION");
  }
  if (trimmed.length > 200) {
    throw new ActionError(
      "Holiday description must be 200 characters or fewer.",
      "VALIDATION",
    );
  }
  return trimmed;
}

function parseHolidayDate(value: string): Date {
  const datePart = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    throw new ActionError("Please enter a valid date (YYYY-MM-DD).", "VALIDATION");
  }
  return localDateStringToDbDate(datePart);
}

function mapHoliday(row: {
  id: string;
  date: Date;
  description: string;
  isNational: boolean;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
}): HolidayDto {
  return {
    id: row.id,
    date: dbDateToLocalDateString(row.date),
    description: row.description,
    isNational: row.isNational,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}

/** Any signed-in user may read holidays (needed for schedule maths). */
export async function listHolidays(): Promise<ActionResult<HolidayDto[]>> {
  try {
    await requireApprovedSessionUser();
    const rows = await prisma.holiday.findMany({
      orderBy: { date: "asc" },
    });
    return actionSuccess(rows.map(mapHoliday));
  } catch (error) {
    return actionFailure(error);
  }
}

/** Returns YYYY-MM-DD keys for working-day engines. */
export async function listHolidayDateKeys(): Promise<ActionResult<string[]>> {
  try {
    await requireApprovedSessionUser();
    const rows = await prisma.holiday.findMany({
      select: { date: true },
      orderBy: { date: "asc" },
    });
    return actionSuccess(rows.map((row) => dbDateToLocalDateString(row.date)));
  } catch (error) {
    return actionFailure(error);
  }
}

export async function createHoliday(input: {
  date: string;
  description: string;
  isNational?: boolean;
}): Promise<ActionResult<HolidayDto>> {
  try {
    const user = await requireApprovedSessionUser();
    requireSuperPm(user);

    const date = parseHolidayDate(input.date);
    const description = validateDescription(input.description);
    const isNational = input.isNational ?? true;

    const existing = await prisma.holiday.findUnique({ where: { date } });
    if (existing) {
      throw new ActionError(
        "A holiday is already registered on that date.",
        "VALIDATION",
      );
    }

    const row = await prisma.holiday.create({
      data: {
        date,
        description,
        isNational,
        ...auditCreate(user.id),
      },
    });

    revalidatePath("/settings/holidays");
    revalidatePath("/");
    revalidatePath("/projects", "layout");
    return actionSuccess(mapHoliday(row));
  } catch (error) {
    return actionFailure(error);
  }
}

export async function updateHoliday(input: {
  id: string;
  date?: string;
  description?: string;
  isNational?: boolean;
}): Promise<ActionResult<HolidayDto>> {
  try {
    const user = await requireApprovedSessionUser();
    requireSuperPm(user);

    const current = await prisma.holiday.findUnique({ where: { id: input.id } });
    if (!current) {
      throw new ActionError("Holiday not found.", "NOT_FOUND");
    }

    const data: {
      date?: Date;
      description?: string;
      isNational?: boolean;
      updatedBy: string;
    } = { ...auditUpdate(user.id) };

    if (input.date !== undefined) {
      data.date = parseHolidayDate(input.date);
      const clash = await prisma.holiday.findFirst({
        where: {
          date: data.date,
          NOT: { id: input.id },
        },
      });
      if (clash) {
        throw new ActionError(
          "A holiday is already registered on that date.",
          "VALIDATION",
        );
      }
    }
    if (input.description !== undefined) {
      data.description = validateDescription(input.description);
    }
    if (input.isNational !== undefined) {
      data.isNational = input.isNational;
    }

    const row = await prisma.holiday.update({
      where: { id: input.id },
      data,
    });

    revalidatePath("/settings/holidays");
    revalidatePath("/");
    revalidatePath("/projects", "layout");
    return actionSuccess(mapHoliday(row));
  } catch (error) {
    return actionFailure(error);
  }
}

export async function deleteHoliday(
  holidayId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireApprovedSessionUser();
    requireSuperPm(user);

    const current = await prisma.holiday.findUnique({ where: { id: holidayId } });
    if (!current) {
      throw new ActionError("Holiday not found.", "NOT_FOUND");
    }

    await prisma.holiday.delete({ where: { id: holidayId } });

    revalidatePath("/settings/holidays");
    revalidatePath("/");
    revalidatePath("/projects", "layout");
    return actionSuccess({ id: holidayId });
  } catch (error) {
    return actionFailure(error);
  }
}
