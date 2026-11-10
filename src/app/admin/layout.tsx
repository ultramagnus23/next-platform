import type { Metadata } from "next";
import { Nunito, Nunito_Sans } from "next/font/google";
import "../globals.css";
import Navbar from "@/components/navbar/navbar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Suspense } from "react";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

const nunito = Nunito({
  variable: "--font-heading",
  weight: ["200", "300", "400", "500", "600", "700", "800", "900"],
  subsets: ["latin"],
});

const nunitoSans = Nunito_Sans({
  variable: "--font-body",
  weight: ["200", "300", "400", "500", "600", "700", "800", "900"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Admin Portal | Platform",
  description: "Engineered by the Ministry of Technology of Ashoka University",
};

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const isAuthorized = session?.user?.access?.includes('booking_admin') ?? false;
  const bypassAuth = process.env.BYPASS_AUTH === 'true';

  if (!isAuthorized && !bypassAuth) {
    redirect("/unauthorized"); // or "/login"
  }

  // The local demo has no session, so the sidebar would hide every item. Show it as a super admin.
  const devBypass = bypassAuth && !session?.user && process.env.NODE_ENV !== 'production' && process.env.BOOKING_DEMO_MODE === 'true';
  const role = devBypass ? 'superadmin' : session?.user?.role;
  const access = devBypass ? ['booking_admin'] : (session?.user?.access ?? []);

  return (
    <div className={`${nunito.variable} ${nunitoSans.variable} antialiased`}>
      <TooltipProvider>
          <SidebarProvider defaultOpen>
            <div className="flex min-h-screen w-full overflow-x-hidden">
              <AppSidebar interfaceId="admin" role={role} access={access} />
              <div className="flex flex-1 flex-col min-w-0 h-screen overflow-y-auto">
                <Navbar />
                <Suspense>
                  <main id="main-content" tabIndex={-1} className="flex-1 pt-6 pb-4 px-2 xs:px-3 sm:px-4 md:px-6 lg:px-8 focus:outline-hidden">
                    {children}
                  </main>
                </Suspense>
              </div>
            </div>
          </SidebarProvider>
      </TooltipProvider>
    </div>
  );
}
