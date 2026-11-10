"use client";

import Link from "next/link";
import { LogIn, LogOut, User } from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import ThemeToggle from "@/components/ui/theme-toggle";

/** Top bar for the booking admin portal: menu, home link, theme and account. */
export default function Navbar() {
  const { data: session } = useSession();
  const email = session?.user?.email ?? null;

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-3 backdrop-blur sm:px-4">
      <SidebarTrigger aria-label="Toggle menu" />
      <Link href="/admin/bookings" className="font-heading text-base font-bold tracking-tight">
        Room Bookings
      </Link>
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        {email ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" aria-label="Account menu">
                <User className="h-4 w-4" aria-hidden="true" />
                <span className="hidden max-w-40 truncate sm:inline">{email}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="max-w-64 truncate">{email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => signOut({ callbackUrl: "/login" })}>
                <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button size="sm" variant="outline" onClick={() => signIn("google", { callbackUrl: "/admin/bookings" })}>
            <LogIn className="h-4 w-4" aria-hidden="true" /> Sign in
          </Button>
        )}
      </div>
    </header>
  );
}
