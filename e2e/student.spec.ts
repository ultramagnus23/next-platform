import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type TestInfo } from '@playwright/test'

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function axe(page: Page, label: string) {
  // Wait for a settled page: a refresh in flight can leave the head briefly empty.
  await expect(page).toHaveTitle(/\S/)
  // Our fades last 160ms. Measure contrast once they settle, not halfway through.
  await page.waitForTimeout(300)
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const summary = result.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
  expect(summary, `axe violations on ${label}`).toEqual([])
}

async function shot(page: Page, info: TestInfo, name: string) {
  await page.screenshot({ path: `e2e-output/screens/${info.project.name}-${name}.png`, fullPage: true })
}

/** Waits for the free rooms and picks the first one. */
async function pickFirstRoom(page: Page) {
  const pick = page.getByRole('button', { name: 'Pick room' }).first()
  await expect(pick).toBeVisible()
  await pick.click()
  await expect(page.getByRole('button', { name: /Picked/ })).toBeVisible()
}

async function createRequest(page: Page, name = 'Pitch demo event') {
  await page.goto('/student/new')
  await page.waitForLoadState('networkidle')
  await pickFirstRoom(page)
  await page.getByLabel('Event name').fill(name)
  await page.getByRole('button', { name: 'Send request' }).click()
  await page.waitForURL(/\/student\/requests\/sr-\d+/)
}

test.describe('student portal', () => {
  test('your requests shows every state and passes axe', async ({ page }, info) => {
    await page.goto('/student')
    await expect(page.getByRole('heading', { name: /^Good (morning|afternoon|evening)/ })).toBeVisible()
    for (const group of ['Needs attention', 'Approved and coming up', 'Closed']) {
      await expect(page.getByRole('heading', { name: new RegExp(`^${group}`) })).toBeVisible()
    }
    await expect(page.getByText('Taking longer than usual').first()).toBeVisible()
    await shot(page, info, 'your-requests')
    await axe(page, 'your requests')
  })

  test('create a request: find a free room, see the path, send, then the tracker', async ({ page }, info) => {
    await page.goto('/student/new')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: /rooms are free/ })).toBeVisible()
    await shot(page, info, 'find-1-results')
    await axe(page, 'find a space with results')

    // Nothing picked and no name yet.
    await page.getByRole('button', { name: 'Send request' }).click()
    await expect(page.getByText('Pick a room from the list.')).toBeVisible()
    await expect(page.getByText('Name the event, at least 3 letters.')).toBeVisible()
    await axe(page, 'find a space with errors')
    await shot(page, info, 'find-2-errors')

    await pickFirstRoom(page)
    await expect(page.getByRole('list', { name: 'Approval path' }).getByRole('listitem')).toHaveCount(2)
    await shot(page, info, 'find-3-picked')
    await axe(page, 'find a space with a room picked')

    // Too many people for any room: an empty state with a way out, not a dead end.
    await page.getByLabel('People').fill('4000')
    await expect(page.getByText('No free room fits.')).toBeVisible()
    await axe(page, 'find a space with no room')
    await shot(page, info, 'find-4-no-room')
    await page.getByLabel('People').fill('40')
    await expect(page.getByRole('button', { name: 'Pick room' }).first()).toBeVisible()
    await pickFirstRoom(page)

    await page.getByLabel('Event name').fill('Pitch demo event')
    await page.getByRole('button', { name: 'Send request' }).click()
    await page.waitForURL(/\/student\/requests\/sr-\d+/)
    await expect(page.getByRole('list', { name: 'Approval path' })).toBeVisible()
    await expect(page.getByRole('status')).toContainText('Pending')
    await shot(page, info, 'detail-pending')
    await axe(page, 'request detail, pending')
  })

  test('a locked follow-up shows the exact date, then unlocks and sends', async ({ page }, info) => {
    await createRequest(page)
    const help = page.locator('#followup-help')
    await expect(help).toContainText(/You can send a reminder on \w{3} \d{1,2} \w{3}\. Offices have 7 days to respond\./)
    await expect(page.getByRole('button', { name: /Send a reminder/ })).toHaveAttribute('aria-disabled', 'true')
    await shot(page, info, 'followup-locked')
    await axe(page, 'follow-up locked')

    await page.getByRole('button', { name: 'Move on 7 days' }).click()
    await expect(page.getByRole('button', { name: /Send a reminder/ })).toHaveAttribute('aria-disabled', 'false')
    await expect(help).toContainText('The office gets a reminder email')
    await shot(page, info, 'followup-unlocked')
    await axe(page, 'follow-up unlocked')

    await page.getByRole('button', { name: /Send a reminder/ }).click()
    await expect(help).toContainText('Reminder sent on')
    await expect(help).toContainText(/You can send another on \w{3} \d{1,2} \w{3}\./)
    await shot(page, info, 'followup-sent')
    await axe(page, 'follow-up sent')
  })

  test('not approved shows the reason in full and offers edit and resubmit', async ({ page }, info) => {
    await createRequest(page, 'Reject me')
    await page.getByRole('button', { name: /Do not approve as/ }).click()
    const outcome = page.locator('#outcome').locator('..')
    await expect(outcome).toContainText('Not approved')
    await expect(outcome).toContainText('Please choose another date.')
    await expect(page.getByRole('link', { name: 'Edit and resubmit' })).toBeVisible()
    await shot(page, info, 'outcome-not-approved')
    await axe(page, 'outcome not approved')

    await page.getByRole('link', { name: 'Edit and resubmit' }).click()
    await expect(page.getByRole('heading', { name: 'Edit and resubmit' })).toBeVisible()
    await page.waitForLoadState('networkidle')
    await pickFirstRoom(page)
    await expect(page.getByLabel('Event name')).toHaveValue('Reject me')
  })

  test('approved and cancelled outcomes pass axe', async ({ page }, info) => {
    await page.goto('/student')
    await page.getByRole('link', { name: /Chess open/ }).click()
    await expect(page.getByRole('heading', { name: 'Approved', exact: true })).toBeVisible()
    await shot(page, info, 'outcome-approved')
    await axe(page, 'outcome approved')

    await createRequest(page, 'Cancel me')
    await page.getByRole('button', { name: 'Cancel this request' }).click()
    await page.getByRole('button', { name: 'Yes, cancel request' }).click()
    await expect(page.getByRole('heading', { name: 'Cancelled', exact: true })).toBeVisible()
    await shot(page, info, 'outcome-cancelled')
    await axe(page, 'outcome cancelled')
  })

  test('an email approve link opens a page that changes nothing until confirmed', async ({ page, request }, info) => {
    await page.goto('/student')
    const list = await (await request.get('/api/student/requests')).json()
    expect(list.success).toBe(true)
    const emails = await (await page.request.get('/api/student/requests/sr-1/emails')).json()
    const reminder = (emails.data as Array<{ template: string; text: string }>).find((m) => m.template === 'reminder')
    const token = reminder?.text.match(/\/student\/approve\/([\w.-]+)/)?.[1]
    expect(token).toBeTruthy()
    await page.goto(`/student/approve/${token}`)
    await expect(page.getByRole('heading', { name: 'Inter-hostel quiz finals' })).toBeVisible()
    await shot(page, info, 'approve-link')
    await axe(page, 'approve link page')
    const before = await (await page.request.get('/api/student/requests/sr-1')).json()
    expect(before.data.request.status).toBe('pending')
    await page.getByRole('button', { name: 'Do not approve' }).click()
    await expect(page.getByLabel('Reason for not approving')).toBeFocused()
    await axe(page, 'approve link page, reason step')
  })

  test('keyboard only: pick a room and send without a mouse', async ({ page }) => {
    await page.goto('/student/new')
    await page.waitForLoadState('networkidle')
    const pick = page.getByRole('button', { name: 'Pick room' }).first()
    await expect(pick).toBeVisible()
    await pick.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: /Picked/ })).toBeVisible()
    await page.getByLabel('Event name').focus()
    await page.keyboard.type('Keyboard event')
    await page.getByRole('button', { name: 'Send request' }).focus()
    // Every control shows a visible focus ring.
    const ring = await page.getByRole('button', { name: 'Send request' }).evaluate((el) => `${getComputedStyle(el).outlineStyle}|${getComputedStyle(el).boxShadow}`)
    expect(ring).not.toBe('none|none')
    await page.keyboard.press('Enter')
    await page.waitForURL(/\/student\/requests\/sr-\d+/)
  })

  test('reduced motion: nothing animates or transitions', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/student')
    await page.waitForLoadState('networkidle')
    const durations = await page.evaluate(() =>
      [...document.querySelectorAll('main *')].map((el) => getComputedStyle(el)).map((s) => `${s.animationName}|${s.transitionDuration}`),
    )
    const moving = durations.filter((d) => !/^none\|(0s|0s, 0s)$/.test(d) && !d.startsWith('none|0s'))
    expect(moving).toEqual([])
  })
})
