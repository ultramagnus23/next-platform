import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type TestInfo } from '@playwright/test'

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function axe(page: Page, label: string) {
  // Wait for a settled page: a refresh in flight can leave the head briefly empty.
  await expect(page).toHaveTitle(/\S/)
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const summary = result.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
  expect(summary, `axe violations on ${label}`).toEqual([])
}

async function shot(page: Page, info: TestInfo, name: string) {
  await page.screenshot({ path: `e2e-output/screens/${info.project.name}-${name}.png`, fullPage: true })
}

/** The page's own alerts. Next adds a route announcer that is also role=alert, so filter by text. */
function alertWith(page: Page, text: string) {
  return page.getByRole('alert').filter({ hasText: text })
}

function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
}

async function fillStepOne(page: Page, name: string) {
  await page.getByLabel('Event name').fill(name)
  await page.getByRole('radio', { name: /Dr\. Reddy/ }).check()
  await page.getByLabel('Date').fill(inDays(40))
}

async function createRequest(page: Page, name = 'Pitch demo event') {
  await page.goto('/student/new')
  await fillStepOne(page, name)
  await page.getByRole('button', { name: 'See the approval path' }).click()
  await page.getByRole('button', { name: 'Continue to details' }).click()
  await page.getByLabel('How many people are coming?').fill('100')
  await page.getByRole('button', { name: 'Review your request' }).click()
  await page.getByRole('button', { name: 'Send request' }).click()
  await page.waitForURL(/\/student\/requests\/sr-\d+/)
}

test.describe('student portal', () => {
  test('your requests shows every state and passes axe', async ({ page }, info) => {
    await page.goto('/student')
    await expect(page.getByRole('heading', { name: 'Your requests' })).toBeVisible()
    for (const group of ['Taking longer than usual', 'Pending', 'Approved, upcoming', 'Past and closed']) {
      await expect(page.getByRole('heading', { name: new RegExp(`^${group}`) })).toBeVisible()
    }
    await shot(page, info, 'your-requests')
    await axe(page, 'your requests')
  })

  test('create a request: the path changes with the guest speaker, then the tracker', async ({ page }, info) => {
    await page.goto('/student/new')
    await axe(page, 'new request step 1')
    await shot(page, info, 'new-1-what-and-when')

    // Errors first: nothing filled in.
    await page.getByRole('button', { name: 'See the approval path' }).click()
    await expect(alertWith(page, 'Fix these to go on')).toBeVisible()
    await axe(page, 'new request step 1 with errors')
    await shot(page, info, 'new-1-errors')

    await fillStepOne(page, 'Pitch demo event')
    await page.getByRole('button', { name: 'See the approval path' }).click()
    await expect(page.getByRole('heading', { name: 'Approval path' }).last()).toBeFocused()
    await expect(page.getByRole('list', { name: 'Approval path' }).getByRole('listitem')).toHaveCount(2)
    await axe(page, 'new request step 2')
    await shot(page, info, 'new-2-path')

    await page.getByRole('button', { name: 'Continue to details' }).click()
    await page.getByLabel('How many people are coming?').fill('700')
    await page.getByRole('button', { name: 'Review your request' }).click()
    await expect(alertWith(page, 'seats 500')).toBeVisible()
    await axe(page, 'new request step 3 with a field error')
    await page.getByLabel('How many people are coming?').fill('100')

    const live = page.getByRole('list', { name: 'Approval path' })
    await expect(live.getByRole('listitem')).toHaveCount(2)
    await page.getByLabel(/guest speaker/).check()
    await expect(live.getByRole('listitem')).toHaveCount(3)
    await expect(live).toContainText('Security office')
    await page.getByLabel(/guest speaker/).uncheck()
    await expect(live.getByRole('listitem')).toHaveCount(2)
    await shot(page, info, 'new-3-details')
    await axe(page, 'new request step 3')

    await page.getByRole('button', { name: 'Review your request' }).click()
    await axe(page, 'new request step 4')
    await shot(page, info, 'new-4-review')
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

  test('keyboard only: the first step can be completed without a mouse', async ({ page }) => {
    await page.goto('/student/new')
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Event name').focus()
    await page.keyboard.type('Keyboard event')
    await page.getByLabel('What kind of event is it?').focus()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Space')
    await expect(page.getByRole('radio', { name: /Dr\. Reddy/ })).toBeChecked()
    await page.getByLabel('Date').focus()
    await page.keyboard.type(inDays(40).split('-').reverse().join(''))
    await page.getByRole('button', { name: 'See the approval path' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Approval path' }).last()).toBeFocused()
    // Every interactive thing shows a visible focus ring.
    await page.getByRole('button', { name: /^Back to/ }).focus()
    const outline = await page.getByRole('button', { name: /^Back to/ }).evaluate((el) => getComputedStyle(el).outlineStyle)
    expect(outline).not.toBe('none')
  })

  test('reduced motion: nothing animates or transitions', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/student')
    const durations = await page.evaluate(() =>
      [...document.querySelectorAll('.student-scope *')].map((el) => getComputedStyle(el)).map((s) => `${s.animationName}|${s.transitionDuration}`),
    )
    const moving = durations.filter((d) => !/^none\|(0s|0s, 0s)$/.test(d) && !d.startsWith('none|0s'))
    expect(moving).toEqual([])
  })
})
