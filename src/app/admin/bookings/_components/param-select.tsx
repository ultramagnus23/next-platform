'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const ALL = '__all__'

interface ParamSelectProps {
  param: string
  label: string
  value: string | undefined
  options: Array<{ value: string; label: string }>
  allLabel?: string
  className?: string
}

/** A select that keeps its value in one URL parameter and leaves the others alone. */
export function ParamSelect({ param, label, value, options, allLabel, className }: ParamSelectProps) {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()

  function change(next: string) {
    const params = new URLSearchParams(search.toString())
    if (next === ALL) params.delete(param)
    else params.set(param, next)
    params.delete('page')
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <div className={className ?? 'grid gap-1'}>
      <Label htmlFor={`ps-${param}`} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select value={value ?? (allLabel ? ALL : undefined)} onValueChange={change}>
        <SelectTrigger id={`ps-${param}`} className="h-8 w-full min-w-44">
          <SelectValue placeholder="Choose" />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          {allLabel && <SelectItem value={ALL}>{allLabel}</SelectItem>}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
