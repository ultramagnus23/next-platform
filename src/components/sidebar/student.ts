import { ClipboardList, DoorOpen } from "lucide-react";
import type { SidebarInterface } from "./types";

/** The club lead's side of the booking portal. Same shell as the admin portal, its own two destinations. */
export const studentSidebar: SidebarInterface = {
  id: "student",
  basePath: "/student",
  title: "Book a space",
  roles: {
    club_lead: { label: "Club lead", description: "A student who requests spaces for a club or society." },
  },
  categories: [
    {
      id: "my-bookings",
      title: "Bookings",
      items: [
        { title: "Your requests", icon: ClipboardList, href: "/" },
        { title: "Find a space", icon: DoorOpen, href: "/new" },
      ],
    },
  ],
};
