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
            <TabsTrigger value="authorities">Authorities</TabsTrigger>
            <TabsTrigger value="rooms">Rooms</TabsTrigger>
            <TabsTrigger value="general">General</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="categories" className="pt-3">
          <CategoriesTab categories={settings.categories} disabled={disabled} onChange={(categories) => change({ categories })} />
        </TabsContent>
        <TabsContent value="workflows" className="pt-3">
          <WorkflowsTab
            workflows={settings.workflows}
            authorities={settings.authorities}
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
        <TabsContent value="authorities" className="grid gap-3 pt-3">
          <p className="text-sm text-muted-foreground">
            {demo
              ? 'Demo values. Real members come from the BOOKING_AUTHORITIES setting on the server.'
              : 'Members come from the BOOKING_AUTHORITIES setting on the server.'}
          </p>
          <ul className="grid gap-2 md:grid-cols-2">
            {settings.authorities.map((a) => (
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
          <p className="text-sm text-muted-foreground">Placeholder rooms. Replace with the official list from IT.</p>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {rooms.map((r) => (
              <li key={r.id} className="rounded-md border border-border bg-card p-2.5 text-sm">
                <p className="font-medium">
                  {r.building} · {r.floor} floor · {r.name}
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
          <div className="grid max-w-xs gap-1.5">
            <Label htmlFor="buffer">Changeover buffer (minutes)</Label>
            <Input
              id="buffer"
              type="number"
              min={0}
              max={120}
              step={5}
              disabled={disabled}
              value={settings.changeoverBufferMin}
              onChange={(e) => change({ changeoverBufferMin: Math.min(120, Math.max(0, Number(e.target.value) || 0)) })}
            />
            <p className="text-xs text-muted-foreground">
              Gap required between two bookings in the same room. 0 allows back-to-back bookings.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
