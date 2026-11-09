import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import PageTitle from '@/components/page-title'

export interface Crumb {
  label: string
  href?: string
}

interface BookingsPageHeaderProps {
  title: string
  subheading?: string
  crumbs?: Crumb[]
  actions?: React.ReactNode
}

/** Title and breadcrumbs shared by every booking page. */
export function BookingsPageHeader({ title, subheading, crumbs = [], actions }: BookingsPageHeaderProps) {
  const trail: Crumb[] = [{ label: 'Bookings', href: '/admin/bookings' }, ...crumbs]
  return (
    <header className="flex flex-col gap-2">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          {trail.map((crumb, index) => {
            const last = index === trail.length - 1
            return (
              <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                {crumb.href && !last ? (
                  <Link href={crumb.href} className="hover:text-foreground hover:underline">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current={last ? 'page' : undefined}>{crumb.label}</span>
                )}
                {!last && <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
              </li>
            )
          })}
        </ol>
      </nav>
      <PageTitle text={title} subheading={subheading} actions={actions} animate={false} />
    </header>
  )
}
