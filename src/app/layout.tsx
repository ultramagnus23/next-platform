import "@/lib/platform-logger";
import type { Metadata } from "next";
import { Nunito, Nunito_Sans } from "next/font/google";
import "./globals.css";
import { Suspense } from "react";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/providers/theme-provider";

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
  title: "Room Bookings",
  description: "Room and event booking admin portal",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${nunito.variable} ${nunitoSans.variable} antialiased`}>
        <ThemeProvider
          defaultTheme="system"
          storageKey="booking-theme"
        >
          <SessionProvider
            refetchInterval={5 * 60} // Refetch session every 5 minutes instead of 30 seconds
            refetchOnWindowFocus={false} // Don't refetch when window gains focus
          >
            <Suspense>
              {children}
              <Toaster position="top-right" />
            </Suspense>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
