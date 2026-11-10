import {
  Building2,
  CalendarDays,
  DoorOpen,
  GitCompareArrows,
  LayoutDashboard,
  Mail,
  Settings,
} from "lucide-react";
import type { SidebarInterface } from "./types";

/**
 * Roles inside the admin portal. Entry is gated in src/app/admin/layout.tsx to
 * the booking_admin grant.
 */
const roles = {
  superadmin: {
    label: "Super Admin",
    description: "Listed in SUPERADMIN_EMAILS. Carries the ashoka_admin grant.",
  },
  booking_authority: {
    label: "Booking Authority",
    description: "Listed under an authority in BOOKING_AUTHORITIES. Sees only the Bookings category.",
    seesUnrestricted: false,
  },
} as const;

const BOOKING_ROLES = ["superadmin", "booking_authority"];

export const adminSidebar: SidebarInterface = {
  id: "admin",
  basePath: "/admin",
  title: "Admin Portal",
  roles,
  categories: [
    {
      id: "room-bookings",
      title: "Room bookings",
      items: [
        { title: "Inbox", icon: LayoutDashboard, href: "/bookings", roles: BOOKING_ROLES, requiresAccess: "booking_admin" },
        { title: "Clashes", icon: GitCompareArrows, href: "/bookings/clashes", roles: BOOKING_ROLES, requiresAccess: "booking_admin" },
        { title: "Rooms", icon: DoorOpen, href: "/bookings/rooms", roles: BOOKING_ROLES, requiresAccess: "booking_admin" },
        { title: "Calendar", icon: CalendarDays, href: "/bookings/calendar", roles: BOOKING_ROLES, requiresAccess: "booking_admin" },
        { title: "Organisations", icon: Building2, href: "/bookings/organisations", roles: BOOKING_ROLES, requiresAccess: "booking_admin" },
        { title: "Sent emails", icon: Mail, href: "/bookings/outbox", roles: BOOKING_ROLES, requiresAccess: "booking_admin" },
        { title: "Rules", icon: Settings, href: "/bookings/settings", roles: BOOKING_ROLES, requiresAccess: "booking_admin" },
      ],
    },
  ],
};
