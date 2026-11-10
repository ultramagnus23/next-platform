'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { API_BASE } from '../data'
import type { Blocker } from '../types'

export interface ApiResult<T = unknown> {
  success: boolean
  error?: string
  blockers?: Blocker[]
  data?: T
}

export const STALE_MESSAGE = 'This request changed while you were looking at it. Reloaded.'

export async function postJson<T = unknown>(path: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = (await response.json()) as ApiResult<T>
    return { ...json, success: response.ok && json.success }
  } catch {
    return { success: false, error: 'Network error. Try again.' }
  }
}

/** A toast with Undo that stays for the undo window (10 seconds). */
export function useUndoToast() {
  const router = useRouter()
  return (message: string, batchId: string | null | undefined) => {
    if (!batchId) {
      toast.success(message)
      return
    }
    toast.success(message, {
      duration: 10_000,
      action: {
        label: 'Undo',
        onClick: async () => {
          const result = await postJson('/undo', { batchId })
          if (result.success) {
            toast.success('Undone. Emails that were queued have been cancelled.')
            router.refresh()
          } else {
            toast.error(result.error ?? 'Could not undo.')
          }
        },
      },
    })
  }
}
