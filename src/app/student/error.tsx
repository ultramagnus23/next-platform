'use client'

/** Shown when a page cannot load. Says what happened and offers a retry. */
export default function StudentError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section role="alert" className="grid gap-2">
      <h1>This page did not load</h1>
      <p>Something went wrong on our side. Your requests are safe. Try again, and if it keeps happening, email the Student Life Office.</p>
      <div>
        <button type="button" className="s-btn" onClick={reset}>
          Try again
        </button>
      </div>
    </section>
  )
}
