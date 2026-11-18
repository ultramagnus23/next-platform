# Student portal: configuration and emails

Every number and every email the student portal uses, in one place. Values marked "to agree" are defaults, not decisions by any office.

## Config values

Defaults live in `src/app/student/data.ts` (`DEFAULT_CONFIG`). The rules read them from the repository, so an admin edit page can change them without a code change. None of them appears as a literal in the logic.

| Key | Default | What it does | Status |
|-----|---------|--------------|--------|
| `followupWaitDays` | 7 | Days after the later of submission, last approver activity and last reminder before a club may send a reminder | To agree |
| `stagnantAfterDays` | 7 | Days of quiet before a pending request is shown as "Taking longer than usual". Separate from the reminder wait so changing one does not move the other | To agree |
| `approverReminderDay` | 2 | Days of quiet before the current office gets a reminder email | To agree |
| `escalationDay` | 5 | Days of quiet before the role backup is emailed | To agree |
| `adminFlagDay` | 14 | Days of quiet before the admin mailbox is told | To agree |
| `urgencyDays` | 7 | An event closer than this allows one early reminder | To agree |
| `orgDailyFollowupCap` | none | Reminders one club may send per day. Off until a number is agreed | Open |

Other constants in `data.ts`: IT and AV hours 8am to 8pm, the critical venue ids, the route table (`ROUTE_RULES`), the role mailbox directory (`ROLE_DIRECTORY`), and the admin mailbox. Notice days are known only for academic society events (10 days). Everything else is `null`, shown as "to confirm with the office". The guest speaker stage is a sample, not policy.

## Environment keys

All are listed in `.env.example`. Never commit values.

| Key | Purpose |
|-----|---------|
| `EMAIL_MODE`, `EMAIL_DOMAIN_VERIFIED` | Real sending happens only when `EMAIL_MODE=live` and `EMAIL_DOMAIN_VERIFIED=true`. Anything else is dry-run. Sandbox and demo mode never send |
| `EMAIL_MESSAGE_ID_DOMAIN` | Domain in generated Message-ID headers. Must be the verified sending domain when live |
| `APPROVAL_TOKEN_SECRET` | Signs approve links. Unset in production means approve links are switched off |
| `CRON_SECRET` | Bearer secret for `POST /api/student/tick`. Unset means the route refuses every call |

## Emails

Each email to an office has a matching copy for the club, with no approve link. The club is never copied on the office email, because the link would let the club approve its own request. Every email about one request has the same subject: `Booking request <id>: <event name>, <date>`. The first one is the thread root. Every later one sets In-Reply-To and References to it. Each is written to the outbox with a unique key on request, template, recipient and sequence, so a retry never doubles it.

| Template | Fires when | To | Copied | Approve link |
|----------|-----------|----|--------|--------------|
| `submitted` | The club sends a request (also a resubmission) | First office on the path | The club | Yes |
| `forwarded` | An office approves and another office is next | The next office | The club | Yes |
| `approved` | The last office approves | The club | The last office | No |
| `not_approved` | Any office does not approve | The club, with the reason in full | That office | No |
| `followup` | The club sends a reminder | The current office | The club | Yes |
| `cancelled` | The club cancels a waiting request | The club | The current office | No |
| `reminder` | The current office has been quiet for `approverReminderDay` days | The current office | The club | Yes |
| `escalation` | Quiet for `escalationDay` days | The role backup | The club | Yes |
| `admin_flag` | Quiet for `adminFlagDay` days | The admin mailbox | None | No |

Recipients are chosen at send time: the delegate while the assignee is on leave, then the role backup if there is no delegate, then the assignee, then the role mailbox. A role with no entry goes to the Student Life Office mailbox. A suppressed address (bounce or complaint) gets nothing, and a suppressed copy address is dropped without stopping the email.

Failed sends retry after 1, 2, 4 and 8 minutes, then the row is marked dead. A cancelled or decided request gets no scheduler emails.

## Approve links

Signed with HMAC SHA-256, single use, valid 24 hours, tied to one request, one stage and one role. Opening the link (GET) shows a summary and changes nothing. Only the POST from the confirmation page acts, and not approving needs a reason. A link for a stage that is no longer current is refused.

## DNS records the sending domain needs

Exact values come from the SMTP provider. Do not send from a domain until all three are published and `EMAIL_DOMAIN_VERIFIED` is set.

- **SPF:** one TXT record on the domain that includes the provider's sending hosts, ending `-all` once you are sure.
- **DKIM:** the key records the provider gives you, published as TXT or CNAME under their selector.
- **DMARC:** a TXT record at `_dmarc.<domain>`, starting at `p=none` with a reporting address, moving to `quarantine` after a clean fortnight.
