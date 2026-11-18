export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading your requests" className="grid gap-4">
      <div className="s-skeleton h-8 w-48" />
      <div className="s-skeleton h-4 w-72" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="s-skeleton h-16 w-full" />
      ))}
    </div>
  )
}
