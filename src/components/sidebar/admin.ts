import {
  Building2,
  CalendarDays,
  ClipboardList,
  FileStack,
  GalleryHorizontalEnd,
  GitCompareArrows,
  LayoutDashboard,
  Library,
  Mail,
  Settings,
  UserCog,
} from "lucide-react";
import type { SidebarInterface } from "./types";

/**
 * Roles inside the admin portal. Entry is gated in src/app/admin/layout.tsx to
 * ADMIN_EMAILS or the ashoka_admin role/grant, so this is a single-role
 * interface today — add roles here as the portal grows.
 */
const roles = {
  superadmin: {
    label: "Super Admin",
    description: "Listed in SUPERADMIN_EMAILS. Carries the ashoka_admin grant.",
  },
  ashoka_admin: {
    label: "Ashoka Admin",
    description: "University staff listed in ADMIN_EMAILS, or holding the ashoka_admin grant.",
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
      id: "bookings",
      title: "Bookings",
      items: [
        { title: "Overview", icon: LayoutDashboard, href: "/bookings", roles: BOOKING_ROLES, requiresAccess: "booking_admin" },
        { title: "Requests", icon: ClipboardList, href: "/bookings/requests", roles: BOOKING_ROLES, requiresAccess: "booking_admin" },
        { title: "Conflicts", icon: GitCompareArrows, href: "/bookings/conflicts", roles: BOOKING_ROLES, requiresAccess: "booking_admin" },
        { title: "Calendar", icon: CalendarDays, href: "/bookings/calendar", roles: BOOKING_ROLES, requiresAccess: "booking_admin" },
        { title: "Organisations", icon: Building2, href: "/bookings/organisations", roles: BOOKING_ROLES, requiresAccess: "booking_admin" },
        { title: "Outbox", icon: Mail, href: "/bookings/outbox", roles: BOOKING_ROLES, requiresAccess: "booking_admin" },
        { title: "Settings", icon: Settings, href: "/bookings/settings", roles: BOOKING_ROLES, requiresAccess: "booking_admin" },
      ],
    },
    {
      id: "admin",
      title: "Administration",
      items: [
        {
          title: "Organisations",
          icon: FileStack,
          href: "/organisations",
          roles: ["superadmin", "ashoka_admin"],
        },
      ],
    },
    {
      id: "portals",
      title: "Portals",
      items: [
        {
          title: "Student Platform",
          icon: GalleryHorizontalEnd,
          href: "/platform",
          absolute: true,
          roles: ["superadmin", "ashoka_admin"],
        },
        {
          title: "Organisations Portal",
          icon: Library,
          href: "/organisations",
          absolute: true,
          requiresAccess: "organization",
        },
        { title: "My Profile", icon: UserCog, href: "/profile", roles: ["superadmin", "ashoka_admin"] },
      ],
    },
  ],
};
