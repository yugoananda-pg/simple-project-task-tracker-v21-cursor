import { redirect } from "next/navigation";

import HolidayCalendarClient from "@/src/components/settings/HolidayCalendarClient";
import { listHolidays } from "@/src/lib/actions/holidays";
import { requireApprovedPageUser } from "@/src/lib/rbac";

export default async function SettingsHolidaysPage() {
  const user = await requireApprovedPageUser();
  if (user.globalRole !== "super_pm") {
    redirect("/");
  }

  const result = await listHolidays();
  const holidays = result.success ? result.data : [];

  return <HolidayCalendarClient initialHolidays={holidays} />;
}
