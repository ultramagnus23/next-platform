'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Authority, AuthorityId, CategoryId, EventCategory, WorkflowTemplate } from '../types'

interface WorkflowsTabProps {
  workflows: WorkflowTemplate[]
  authorities: Authority[]
  categories: EventCategory[]
  disabled: boolean
  onChange: (next: WorkflowTemplate[]) => void
}

interface Draft {
  id: string | null
  name: string
  authorityId: AuthorityId | 'any'
  categories: CategoryId[]
  stages: AuthorityId[]
}

const EMPTY: Draft = { id: null, name: '', authorityId: 'any', categories: [], stages: [] }

export function WorkflowsTab({ workflows, authorities, categories, disabled, onChange }: WorkflowsTabProps) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const label = (id: AuthorityId) => authorities.find((a) => a.id === id)?.shortLabel ?? id
  const finals = authorities.filter((a) => a.isFinal).map((a) => a.id)

  const lastStage = draft?.stages[draft.stages.length - 1]
  const endsFinal = lastStage !== undefined && finals.includes(lastStage)
  const valid = draft !== null && draft.name.trim().length > 0 && draft.stages.length > 0 && endsFinal

  function save() {
    if (!draft || !valid) return
    const template: WorkflowTemplate = {
      id: draft.id ?? `wf-${Date.now().toString(36)}`,
      name: draft.name.trim(),
      match: {
        ...(draft.authorityId !== 'any' ? { authorityId: draft.authorityId } : {}),
        ...(draft.categories.length > 0 ? { categories: draft.categories } : {}),
      },
      stages: draft.stages,
    }
    onChange(draft.id ? workflows.map((w) => (w.id === draft.id ? template : w)) : [...workflows, template])
    setDraft(null)
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        With no matching template, a request goes to its organisation&apos;s governing authority, then Academic Booking. The most
        specific template wins: authority and category, then category, then authority. Changes never affect requests
        already submitted.
      </p>
      <ul className="grid gap-2">
        {workflows.map((w) => (
          <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card p-3">
            <div>
              <p className="font-medium">{w.name}</p>
              <p className="text-sm text-muted-foreground">
                {[
                  w.match.authorityId ? `Organisations governed by ${label(w.match.authorityId)}` : 'Any organisation',
                  w.match.categories?.length
                    ? `categories: ${w.match.categories.map((c) => categories.find((x) => x.id === c)?.label ?? c).join(', ')}`
                    : 'any category',
                ].join(', ')}
              </p>
              <p className="text-sm">Chain: {w.stages.map(label).join(' then ')}</p>
            </div>
            {!disabled && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setDraft({
                      id: w.id,
                      name: w.name,
                      authorityId: w.match.authorityId ?? 'any',
                      categories: w.match.categories ?? [],
                      stages: w.stages,
                    })
                  }
                >
                  Edit
                </Button>
                <Button size="sm" variant="outline" onClick={() => onChange(workflows.filter((x) => x.id !== w.id))}>
                  Delete
                </Button>
              </div>
            )}
          </li>
        ))}
        {workflows.length === 0 && <li className="text-sm text-muted-foreground">No templates. The default chain applies to every request.</li>}
      </ul>

      {!disabled && !draft && (
        <div>
          <Button variant="outline" onClick={() => setDraft(EMPTY)}>
            Add template
          </Button>
        </div>
      )}

      {draft && (
        <div className="grid gap-3 rounded-md border border-border p-3">
          <div className="grid gap-1.5">
            <Label htmlFor="wf-name">Name</Label>
            <Input id="wf-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="wf-authority">Applies to organisations governed by</Label>
            <Select value={draft.authorityId} onValueChange={(v) => setDraft({ ...draft, authorityId: v as Draft['authorityId'] })}>
              <SelectTrigger id="wf-authority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any authority</SelectItem>
                {authorities.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.shortLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <fieldset className="grid gap-1.5">
            <legend className="text-sm font-medium">Categories (none means all)</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {categories.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={draft.categories.includes(c.id)}
                    onCheckedChange={(checked) =>
                      setDraft({
                        ...draft,
                        categories: checked === true ? [...draft.categories, c.id] : draft.categories.filter((x) => x !== c.id),
                      })
                    }
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-1.5">
            <p className="text-sm font-medium">Approval chain, in order</p>
            <div className="flex flex-wrap items-center gap-2">
              {draft.stages.map((s, i) => (
                <Button key={`${s}-${i}`} size="sm" variant="secondary" onClick={() => setDraft({ ...draft, stages: draft.stages.filter((_, j) => j !== i) })} aria-label={`Remove ${label(s)}`}>
                  {i + 1}. {label(s)} ×
                </Button>
              ))}
              <Select value="" onValueChange={(v) => setDraft({ ...draft, stages: [...draft.stages, v as AuthorityId] })}>
                <SelectTrigger className="h-8 w-44" aria-label="Add a stage">
                  <SelectValue placeholder="Add a stage" />
                </SelectTrigger>
                <SelectContent>
                  {authorities.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.shortLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {draft.stages.length > 0 && !endsFinal && (
              <p className="text-xs text-red-700" role="alert">
                Every approval chain must end with a final authority.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button onClick={save} disabled={!valid}>
              Keep template
            </Button>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
