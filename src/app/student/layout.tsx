import { Suspense } from 'react'
import Navbar from '@/components/navbar/navbar'
import { AppSidebar } from '@/components/sidebar'
import { SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { isSandbox } from '@/app/admin/bookings/_server/offices'
import { DemoControls } from './_components/demo-controls'
import { getStudentService } from './_server/student'
import { formatInstant } from './utils'

export const metadata = { title: 'Book a space | Platform', description: 'Request a room for your club event and follow every approval.' }

/**
 * The club side uses the same shell as the admin portal: sidebar, top bar, fonts, colours and components.
 * Only the two destinations differ.
 */
export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const service = await getStudentService()
  const demo = isSandbox() || process.env.BOOKING_DEMO_MODE === 'true'
  return (
    <div className="booking-scope antialiased">
      <TooltipProvider>
        <SidebarProvider defaultOpen>
          <div className="flex min-h-screen w-full overflow-x-hidden">
            <AppSidebar interfaceId="student" role="club_lead" access={[]} />
            <div className="flex h-screen min-w-0 flex-1 flex-col overflow-y-auto">
              <Navbar hideAccount={demo} />
              <Suspense>
                <main id="main-content" tabIndex={-1} className="grid flex-1 content-start gap-4 bg-muted/60 px-2 pb-6 pt-6 focus:outline-hidden dark:bg-transparent xs:px-3 sm:px-4 md:px-6 lg:px-8">
                  {demo && <DemoControls sandbox={isSandbox()} nowLabel={formatInstant(service.now().toISOString())} />}
                  {children}
                </main>
              </Suspense>
            </div>
          </div>
        </SidebarProvider>
      </TooltipProvider>
    </div>
  )
}
