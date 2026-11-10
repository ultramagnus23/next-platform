'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { API_BASE } from '../data'
import type { BookingSettings, Room } from '../types'
import { formatMinutes } from '../utils'
import { CategoriesTab } from './settings-categories'
import { RulesTab } from './settings-rules'
import { WorkflowsTab } from './settings-workflows'

interface SettingsViewProps {
  initial: BookingSettings
  rooms: Room[]
  canEdit: boolean
  demo: boolean
}

export function SettingsView({ initial, rooms, canEdit, demo }: SettingsViewProps) {
  const router = useRouter()
  const [settings, setSettings] = useState(initial)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const disabled = !canEdit

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const change = (patch: Partial<BookingSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
    setDirty(true)
  }

  async function save() {
    setSaving(true)
    try {
      const response = await fetch(`${API_BASE}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      const json = (await response.json()) as { success: boolean; error?: string }
      if (response.ok && json.success) {
        toast.success('Settings saved.')
        setDirty(false)
        router.refresh()
      } else {
        toast.error(json.error ?? 'Could not save the settings.')
      }
    } catch {
      toast.error('Network error. Try again.')
    }
    setSaving(false)
  }

  function discard() {
    setSettings(initial)
    setDirty(false)
  }

  const buildings = [...new Set(rooms.map((r) => r.building))].sort()

  return (
    <div className="grid grid-cols-1 gap-4">
      {disabled ? (
        <p className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm">
          <Lock className="h-4 w-4" aria-hidden="true" />
          Only a super admin can change settings. You can read them here.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
          <Button variant="outline" onClick={discard} disabled={!dirty || saving}>
            Discard changes
          </Button>
          {dirty && <span className="text-sm text-muted-foreground">You have unsaved changes.</span>}
        </div>
      )}

      <Tabs defaultValue="categories" className="min-w-0">
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="categories">Categories and priority</TabsTrigger>
            <TabsTrigger value="workflows">Approval workflows</TabsTrigger>
            <TabsTrigger value="auto">Auto-approval</TabsTrigger>
            <TabsTrigger value="offices">Offices</TabsTrigger>
            <TabsTrigger value="rooms">Rooms and timetable</TabsTrigger>
            <TabsTrigger value="general">Limits</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="categories" className="pt-3">
          <CategoriesTab categories={settings.categories} disabled={disabled} onChange={(categories) => change({ categories })} />
        </TabsContent>
        <TabsContent value="workflows" className="pt-3">
          <WorkflowsTab
            workflows={settings.workflows}
            offices={settings.offices}
            categories={settings.categories}
            disabled={disabled}
            onChange={(workflows) => change({ workflows })}
          />
        </TabsContent>
        <TabsContent value="auto" className="pt-3">
          <RulesTab
            rules={settings.autoApproval}
            categories={settings.categories}
            buildings={buildings}
            disabled={disabled}
            onChange={(autoApproval) => change({ autoApproval })}
          />
        </TabsContent>
        <TabsContent value="offices" className="grid gap-3 pt-3">
          <p className="text-sm text-muted-foreground">
            {demo
              ? 'Demo values. Real members come from the BOOKING_OFFICES setting on the server.'
              : 'Members come from the BOOKING_OFFICES setting on the server.'}
          </p>
          <ul className="grid gap-2 md:grid-cols-2">
            {settings.offices.map((a) => (
              <li key={a.id} className="rounded-md border border-border bg-card p-3 text-sm">
                <p className="font-medium">
                  {a.label} {a.isFinal && <span className="text-xs text-muted-foreground">(final authority)</span>}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Inbox: {a.inboxEmails.join(', ') || 'None'}</p>
                <p className="text-xs text-muted-foreground">Members: {a.memberEmails.join(', ') || 'None'}</p>
              </li>
            ))}
          </ul>
        </TabsContent>
        <TabsContent value="rooms" className="grid gap-3 pt-3">
          <p className="text-sm text-muted-foreground">The venue list is the campus inventory. Opening hours are placeholders until IT confirms them.</p>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {rooms.map((r) => (
              <li key={r.id} className="rounded-md border border-border bg-card p-2.5 text-sm">
                <p className="font-medium">
                  {r.building}{r.floor ? `, ${r.floor} floor` : ""}, {r.name} ({r.category})
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.capacity} seats · open {formatMinutes(r.openFromMin)} to {formatMinutes(r.openUntilMin)}
                  {r.features.length > 0 ? ` · ${r.features.join(', ')}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </TabsContent>
        <TabsContent value="general" className="pt-3">
          <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
            {([
              ['buffer', 'Changeover buffer (minutes)', 'changeoverBufferMin', 0, 120, 'Gap required between two bookings in the same room. 0 allows back-to-back bookings.'],
              ['notice', 'Minimum notice (hours)', 'minNoticeHours', 0, 720, 'Requests that start sooner get a short notice flag and need a look.'],
              ['cap', 'Weekly limit per club (default)', 'defaultWeeklyCap', 1, 50, 'A club at this many bookings in a week gets a flag. Individual clubs can have their own limit.'],
              ['hold', 'Offer hold (hours)', 'offerHoldHours', 1, 168, 'How long an offered room is held for a club before it is released.'],
              ['undo', 'Undo window (seconds)', 'undoSeconds', 0, 120, 'How long an approver can undo a decision.'],
              ['dur', 'Longest booking (minutes)', 'maxDurationMin', 15, 1440, 'A longer booking gets a flag and needs a look.'],
              ['window', 'Booking window (days)', 'bookingWindowDays', 1, 365, 'Requests for dates further out than this get a flag.'],
            ] as const).map(([id, label, key, min, max, help]) => (
              <div key={id} className="grid gap-1.5">
                <Label htmlFor={id}>{label}</Label>
                <Input
                  id={id}
                  type="number"
                  min={min}
                  max={max}
                  disabled={disabled}
                  value={settings[key]}
                  onChange={(e) => change({ [key]: Math.min(max, Math.max(min, Number(e.target.value) || min)) } as Partial<BookingSettings>)}
                />
                <p className="text-xs text-muted-foreground">{help}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 grid max-w-2xl gap-3">
            <h3>Response target per office (hours)</h3>
            <p className="text-xs text-muted-foreground">After this long at a step, a request is marked overdue, floats to the top and the office gets an email.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {settings.offices.map((o) => (
                <div key={o.id} className="grid gap-1.5">
                  <Label htmlFor={`target-${o.id}`}>{o.shortLabel}</Label>
                  <Input
                    id={`target-${o.id}`}
                    type="number"
                    min={1}
                    max={720}
                    disabled={disabled}
                    value={o.responseTargetHours}
                    onChange={(e) =>
                      change({ offices: settings.offices.map((x) => (x.id === o.id ? { ...x, responseTargetHours: Math.min(720, Math.max(1, Number(e.target.value) || 1)) } : x)) })
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
