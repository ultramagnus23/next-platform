'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { AutoApprovalRule, CategoryId, EventCategory } from '../types'
import { formatClock } from '../utils'

interface RulesTabProps {
  rules: AutoApprovalRule[]
  categories: EventCategory[]
  buildings: string[]
  disabled: boolean
  onChange: (next: AutoApprovalRule[]) => void
}

function toMin(value: string): number | undefined {
  if (!value) return undefined
  const [h, m] = value.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function toNum(value: string): number | undefined {
  const n = Number(value)
  return value !== '' && Number.isFinite(n) && n > 0 ? n : undefined
}

export function RulesTab({ rules, categories, buildings, disabled, onChange }: RulesTabProps) {
  const patch = (id: string, change: (r: AutoApprovalRule) => AutoApprovalRule) =>
    onChange(rules.map((r) => (r.id === id ? change(r) : r)))
  const cond = (id: string, c: Partial<AutoApprovalRule['conditions']>) =>
    patch(id, (r) => ({ ...r, conditions: { ...r.conditions, ...c } }))

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Rules are off by default. A request with any conflict or capacity problem is never auto-approved, whatever the rule
        says. Every auto-approval is logged as the system with the rule name.
      </p>
      {rules.map((rule) => {
        const c = rule.conditions
        return (
          <fieldset key={rule.id} className="grid gap-3 rounded-md border border-border bg-card p-3">
            <legend className="sr-only">{rule.name}</legend>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{rule.name}</p>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={rule.enabled}
                  disabled={disabled}
                  onCheckedChange={(v) => patch(rule.id, (r) => ({ ...r, enabled: v === true }))}
                  aria-label={`Enable ${rule.name}`}
                />
                {rule.enabled ? 'Enabled' : 'Disabled'}
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor={`${rule.id}-start`}>Starts at or after</Label>
                <Input id={`${rule.id}-start`} type="time" disabled={disabled} value={c.startAtOrAfterMin !== undefined ? formatClock(c.startAtOrAfterMin) : ''} onChange={(e) => cond(rule.id, { startAtOrAfterMin: toMin(e.target.value) })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${rule.id}-end`}>Ends at or before</Label>
                <Input id={`${rule.id}-end`} type="time" disabled={disabled} value={c.endAtOrBeforeMin !== undefined ? formatClock(c.endAtOrBeforeMin) : ''} onChange={(e) => cond(rule.id, { endAtOrBeforeMin: toMin(e.target.value) })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${rule.id}-att`}>Most people</Label>
                <Input id={`${rule.id}-att`} type="number" min={1} disabled={disabled} value={c.maxAttendance ?? ''} onChange={(e) => cond(rule.id, { maxAttendance: toNum(e.target.value) })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${rule.id}-lead`}>Least hours of notice</Label>
                <Input id={`${rule.id}-lead`} type="number" min={1} disabled={disabled} value={c.minNoticeHours ?? ''} onChange={(e) => cond(rule.id, { minNoticeHours: toNum(e.target.value) })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${rule.id}-cap`}>Most per organisation per week</Label>
                <Input id={`${rule.id}-cap`} type="number" min={1} disabled={disabled} value={c.maxPerOrgPerWeek ?? ''} onChange={(e) => cond(rule.id, { maxPerOrgPerWeek: toNum(e.target.value) })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${rule.id}-effect`}>Effect</Label>
                <Select value={rule.effect} disabled={disabled} onValueChange={(v) => patch(rule.id, (r) => ({ ...r, effect: v as AutoApprovalRule['effect'] }))}>
                  <SelectTrigger id={`${rule.id}-effect`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confirm">Confirm straight away</SelectItem>
                    <SelectItem value="skip_to_final_stage">Skip to the final stage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <fieldset className="grid gap-1.5">
              <legend className="text-sm font-medium">Categories (none means all)</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {categories.map((cat) => (
                  <label key={cat.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      disabled={disabled}
                      checked={c.categories?.includes(cat.id) ?? false}
                      onCheckedChange={(v) => {
                        const current = c.categories ?? []
                        const next: CategoryId[] = v === true ? [...current, cat.id] : current.filter((x) => x !== cat.id)
                        cond(rule.id, { categories: next.length > 0 ? next : undefined })
                      }}
                    />
                    {cat.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="grid gap-1.5">
              <legend className="text-sm font-medium">Buildings (none means all)</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {buildings.map((b) => (
                  <label key={b} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      disabled={disabled}
                      checked={c.buildings?.includes(b) ?? false}
                      onCheckedChange={(v) => {
                        const current = c.buildings ?? []
                        const next = v === true ? [...current, b] : current.filter((x) => x !== b)
                        cond(rule.id, { buildings: next.length > 0 ? next : undefined })
                      }}
                    />
                    {b}
                  </label>
                ))}
              </div>
            </fieldset>
          </fieldset>
        )
      })}
    </div>
  )
}
