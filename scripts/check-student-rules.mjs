// Fails when the student portal breaks a rule that must never break: no em dashes anywhere (copy, comments,
// docs), and no font other than Public Sans. Run by hand or from a hook: node scripts/check-student-rules.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = ['src/app/student', 'src/app/api/student', 'e2e']
const EXTENSIONS = new Set(['.ts', '.tsx', '.css', '.md', '.mjs'])
const EM_DASH = String.fromCharCode(0x2014)
const OTHER_FONTS = /\b(Inter|Roboto|Nunito|Arial|Helvetica|Poppins|Open Sans)\b/
const problems = []

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (name !== 'node_modules') walk(path)
    } else if (EXTENSIONS.has(path.slice(path.lastIndexOf('.')))) check(path)
  }
}

function check(path) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/)
  lines.forEach((line, i) => {
    if (line.includes(EM_DASH)) problems.push(`${path}:${i + 1} has an em dash`)
    const fontLine = /font-family|font\/google|next\/font/.test(line)
    if (fontLine && OTHER_FONTS.test(line)) problems.push(`${path}:${i + 1} uses a font other than Public Sans`)
    if (/from 'next\/font\/google'/.test(line) && !/Public_Sans/.test(line)) problems.push(`${path}:${i + 1} imports a Google font other than Public Sans`)
  })
}

for (const root of ROOTS) walk(root)

if (problems.length > 0) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log('Student portal rules: ok')
