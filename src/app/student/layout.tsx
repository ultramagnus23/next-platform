import Link from 'next/link'
import { Public_Sans } from 'next/font/google'
import { isSandbox } from '@/app/admin/bookings/_server/offices'
import { DemoControls } from './_components/demo-controls'
import { getStudentService } from './_server/student'
import { formatInstant } from './utils'
import './student.css'

const publicSans = Public_Sans({ variable: '--font-public-sans', subsets: ['latin'], weight: ['400', '500', '600', '700'] })

export const metadata = { title: 'Book a space', description: 'Request a room or venue for your club event and follow every approval.' }

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const service = await getStudentService()
  const demo = isSandbox() || process.env.BOOKING_DEMO_MODE === 'true'
  return (
    <div className={`${publicSans.variable} student-scope`}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:bg-[var(--s-paper)] focus:p-2">
        Skip to the page
      </a>
      <header className="border-b border-[var(--s-line)]">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-2">
          <p className="font-semibold">Book a space</p>
          <nav aria-label="Student portal" className="flex gap-1">
            <Link data-plain href="/student" className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium hover:bg-[var(--s-raised)]">
              Your requests
            </Link>
            <Link data-plain href="/student/new" className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium hover:bg-[var(--s-raised)]">
              New request
            </Link>
          </nav>
        </div>
      </header>
      {demo && <DemoControls sandbox={isSandbox()} nowLabel={formatInstant(service.now().toISOString())} />}
      <main id="main" className="mx-auto grid max-w-3xl gap-6 px-4 py-6">
        {children}
      </main>
    </div>
  )
}
