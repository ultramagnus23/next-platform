'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { API_BASE } from '../data'
import type { ActionInput, BookingRequest } from '../types'

interface ApiResult {
  success: boolean
  error?: string
  blocking?: BookingRequest[]
}

export const STALE_MESSAGE = 'This request changed while you were looking at it. Reloaded with the latest version.'

/** Posts JSON to a booking route, shows a toast and refreshes the page. */
export async function postJson(path: string, body: unknown): Promise<ApiResult> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = (await response.json()) as ApiResult
    return { ...json, success: response.ok && json.success }
  } catch {
    return { success: false, error: 'Network error. Try again.' }
  }
}

export function useBookingAction(requestId: string) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  const run = useCallback(
    async (input: ActionInput, successMessage: string): Promise<boolean> => {
      setPending(true)
      const result = await postJson(`/requests/${requestId}/actions`, input)
      setPending(false)
      if (result.success) {
        toast.success(successMessage)
        router.refresh()
        return true
      }
      const stale = result.error?.startsWith('This request changed')
      toast.error(stale ? STALE_MESSAGE : (result.error ?? 'Something went wrong.'))
      if (stale) router.refresh()
      return false
    },
    [requestId, router],
  )

  return { run, pending }
}
