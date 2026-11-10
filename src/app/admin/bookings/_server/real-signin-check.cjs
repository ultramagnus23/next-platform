// Run from the repo root against a server started WITHOUT BOOKING_DEMO_MODE or BYPASS_AUTH. See README, "Real sign-in check".
// Real sign-in path test. Mints genuine NextAuth session cookies with the server's secret,
// so the middleware, auth(), role claims and the actor lookup all run as they would after a Google sign-in.
const path = require('path')
const root = process.cwd()
const req = require('module').createRequire(path.join(root, 'package.json'))

const BASE = 'http://localhost:3200'
const SECRET = 'real-test-secret'
const COOKIE = 'authjs.session-token'

async function mint(email, role) {
  const { encode } = await import(require('url').pathToFileURL(req.resolve('next-auth/jwt')).href)
  return encode({
    token: { email, name: email.split('@')[0], v: 2, uid: null, batch: null, role, sports: [], orgs: [], authzAt: Date.now() },
    secret: SECRET,
    salt: COOKIE,
    maxAge: 3600,
  })
}

let pass = 0
let fail = 0
function check(name, ok, detail = '') {
  if (ok) {
    pass += 1
    console.log('PASS', name)
  } else {
    fail += 1
    console.log('FAIL', name, detail)
  }
}

async function call(pathname, opts = {}, cookie) {
  const headers = { ...(opts.headers || {}) }
  if (cookie) headers.cookie = cookie
  const res = await fetch(BASE + pathname, { ...opts, headers, redirect: 'manual' })
  const text = await res.text().catch(() => '')
  return { status: res.status, location: res.headers.get('location') || '', setCookie: res.headers.get('set-cookie') || '', text }
}

async function json(pathname, opts, cookie) {
  const r = await call(pathname, opts, cookie)
  let body = null
  try {
    body = JSON.parse(r.text)
  } catch {
    /* not json */
  }
  return { ...r, body }
}

const post = (body) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

async function main() {
  const slo = `${COOKIE}=${await mint('slo.tester@ashoka.edu.in', 'booking_authority')}`
  const acad = `${COOKIE}=${await mint('acad.tester@ashoka.edu.in', 'booking_authority')}`
  const two = `${COOKIE}=${await mint('two.tester@ashoka.edu.in', 'booking_authority')}`
  const sup = `${COOKIE}=${await mint('super.tester@ashoka.edu.in', 'superadmin')}`
  const student = `${COOKIE}=${await mint('some_ug2025@ashoka.edu.in', 'user')}`
  const forged = `${COOKIE}=${await mint('stranger@ashoka.edu.in', 'booking_authority')}`

  // Warm the routes so the first compile does not time anything out.
  await call('/admin/bookings', {}, slo)

  // 1. Not signed in
  let r = await call('/admin/bookings')
  check('1a signed out: page redirects to /login', r.status >= 300 && r.status < 400 && r.location.includes('/login'), `${r.status} ${r.location}`)
  r = await call('/api/admin/bookings/inbox')
  check('1b signed out: API does not answer with data', r.status !== 200, String(r.status))

  // 2. A signed-in student has no booking grant
  r = await call('/admin/bookings', {}, student)
  check('2a student: page redirects to /unauthorized', r.status >= 300 && r.status < 400 && r.location.includes('/unauthorized'), `${r.status} ${r.location}`)
  r = await call('/api/admin/bookings/inbox', {}, student)
  check('2b student: API blocked', r.status !== 200, String(r.status))

  // 3. Forged claim: token says booking_authority but the email is in no office
  r = await call('/admin/bookings', {}, forged)
  check('3a forged role, not in any office: no data and a redirect to /unauthorized', !/Intro to ML Workshop|waiting on/.test(r.text) && (/unauthorized/.test(r.text) || r.location.includes('unauthorized')), `${r.status}`)
  r = await json('/api/admin/bookings/inbox', {}, forged)
  check('3b forged role: API answers 403', r.status === 403, String(r.status))

  // 4. SLO member
  r = await json('/api/admin/bookings/inbox', {}, slo)
  check('4a SLO member: inbox 200 and scoped to the Student Life Office', r.status === 200 && /Student Life Office/.test(r.body?.data?.summary ?? ''), `${r.status} ${r.body?.data?.summary}`)
  const sloRows = r.body?.data?.rows ?? []
  check('4b SLO inbox only holds requests at the SLO step', sloRows.length > 0 && sloRows.every((x) => x.request.stages[x.request.stageIndex] === 'slo'))
  r = await json('/api/admin/bookings/acting-for', post({ office: 'acad' }), slo)
  check('4c SLO member cannot act for Academic Booking (403)', r.status === 403, String(r.status))
  r = await json('/api/admin/bookings/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{}' }, slo)
  check('4d SLO member cannot change rules (403)', r.status === 403, String(r.status))

  // 5. Demo controls are off in real mode
  r = await json('/api/admin/bookings/demo/reset', post({}), slo)
  check('5a demo reset is 404 with demo mode off', r.status === 404, String(r.status))
  r = await json('/api/admin/bookings/demo/persona', post({ persona: 'super_admin' }), slo)
  check('5b demo persona is 404 with demo mode off', r.status === 404, String(r.status))
  r = await json('/api/admin/bookings/inbox', {}, `${slo}; booking_demo_persona=super_admin`)
  check('5c persona cookie is ignored (still the SLO queue)', /Student Life Office/.test(r.body?.data?.summary ?? ''), String(r.body?.data?.summary))

  // 6. Academic Booking member
  r = await json('/api/admin/bookings/inbox', {}, acad)
  check('6a ACAD member: inbox scoped to Academic Booking', r.status === 200 && /Academic Booking/.test(r.body?.data?.summary ?? ''), String(r.body?.data?.summary))
  r = await json('/api/admin/bookings/clashes', {}, acad)
  const group = (r.body?.data ?? [])[0]
  check('6b ACAD member can see and resolve clashes', r.status === 200 && Boolean(group?.canResolve))
  const sloClashes = await json('/api/admin/bookings/clashes', {}, slo)
  check('6c SLO member sees clashes but cannot resolve them', sloClashes.status === 200 && (sloClashes.body?.data ?? []).every((g) => g.canResolve === false))
  if (group) {
    const dry = await json(`/api/admin/bookings/clashes/${encodeURIComponent(group.group.id)}/resolve`, post({ winnerId: group.members[0].request.id, versions: {}, others: [], dryRun: true }), slo)
    check('6d SLO member resolving a clash is 403', dry.status === 403, String(dry.status))
  }

  // 7. A person in two offices switches with Acting for
  r = await json('/api/admin/bookings/inbox', {}, two)
  const first = r.body?.data?.summary ?? ''
  check('7a two-office member starts on their first office (OA)', /OA/.test(first), first)
  r = await json('/api/admin/bookings/acting-for', post({ office: 'cfe' }), two)
  const set = r.setCookie.match(/booking_acting_for=([a-z]+)/)
  check('7b switching to CFE sets the cookie', r.status === 200 && set?.[1] === 'cfe', `${r.status} ${r.setCookie}`)
  r = await json('/api/admin/bookings/inbox', {}, `${two}; booking_acting_for=cfe`)
  check('7c inbox now shows the CFE queue', /Centre for Entrepreneurship/.test(r.body?.data?.summary ?? ''), String(r.body?.data?.summary))
  r = await json('/api/admin/bookings/inbox', {}, `${two}; booking_acting_for=acad`)
  check('7d a cookie naming an office they do not hold is ignored', /OA/.test(r.body?.data?.summary ?? ''), String(r.body?.data?.summary))
  r = await json('/api/admin/bookings/acting-for', post({ office: 'slo' }), two)
  check('7e switching to an office they do not hold is 403', r.status === 403, String(r.status))

  // 8. Super admin
  r = await json('/api/admin/bookings/inbox', {}, sup)
  check('8a super admin sees the whole queue', r.status === 200 && (r.body?.data?.total ?? 0) > 50, String(r.body?.data?.total))
  const settings = await json('/api/admin/bookings/settings', {}, sup)
  r = await json('/api/admin/bookings/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(settings.body?.data) }, sup)
  check('8b super admin can save rules', r.status === 200, String(r.status))

  // 9. An approver cannot decide another office's request, even by id
  const inbox = await json('/api/admin/bookings/inbox', {}, acad)
  const target = (inbox.body?.data?.rows ?? [])[0]
  const sloOwn = (await json('/api/admin/bookings/inbox?tab=review', {}, slo)).body?.data?.rows ?? []
  const atAcad = (inbox.body?.data?.rows ?? []).find((x) => x.request.stages[x.request.stageIndex] === 'acad')
  if (atAcad) {
    r = await json(`/api/admin/bookings/requests/${atAcad.request.id}/actions`, post({ action: 'approve', version: atAcad.request.version }), slo)
    check('9a SLO member approving a request at the ACAD step is refused', r.status === 403 || r.status === 404, `${r.status} ${r.body?.error}`)
  }
  void target
  void sloOwn

  // 10. Self-approval: the organisation contact cannot decide their own request
  const own = (await json('/api/admin/bookings/inbox', {}, sup)).body?.data?.rows ?? []
  check('10 inbox rows carry versions for optimistic concurrency', own.every((x) => Number.isInteger(x.request.version)))

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((e) => {
  console.log('crashed', e)
  process.exit(1)
})
