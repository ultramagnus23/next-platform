/**
 * Promise-chain mutex keyed by string. A mutation takes every key it touches
 * (sorted, so two mutations can never deadlock) and releases them together.
 *
 * In-memory only. The Strapi version must use a database transaction inside a
 * custom Strapi controller, because Strapi's REST API cannot do this.
 */
export class KeyedMutex {
  private tails = new Map<string, Promise<void>>()

  async acquire(keys: string[]): Promise<() => void> {
    const sorted = [...new Set(keys)].sort()
    const releases: Array<() => void> = []
    for (const key of sorted) {
      const previous = this.tails.get(key) ?? Promise.resolve()
      let release: () => void = () => undefined
      const current = new Promise<void>((resolve) => {
        release = resolve
      })
      this.tails.set(
        key,
        previous.then(() => current),
      )
      await previous
      releases.push(release)
    }
    let released = false
    return () => {
      if (released) return
      released = true
      for (const release of releases) release()
    }
  }

  async run<T>(keys: string[], task: () => Promise<T>): Promise<T> {
    const release = await this.acquire(keys)
    try {
      return await task()
    } finally {
      release()
    }
  }
}

export function lockKey(roomId: string, date: string): string {
  return `${roomId}:${date}`
}
