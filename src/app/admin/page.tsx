import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminRootPage() {
  const user = await getAuthenticatedUser();
  const isStaffAdmin = user?.access.includes("ashoka_admin") ?? false;
  redirect(isStaffAdmin || !user?.access.includes("booking_admin") ? "/admin/organisations" : "/admin/bookings");
}
