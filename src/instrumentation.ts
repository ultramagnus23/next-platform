export async function register() {
  await import("@/lib/platform-logger");
  // Build the demo data when the server starts, so the first person to sign in does not wait for it.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.BOOKING_DEMO_MODE === "true") {
    const { getBookingService } = await import("@/app/admin/bookings/_server/service");
    await getBookingService().listRooms();
  }
}
