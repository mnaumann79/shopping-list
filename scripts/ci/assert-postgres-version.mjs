#!/usr/bin/env node
// Asserts that the database the integration job just started is the PostgreSQL
// version the project pinned.
//
// The RLS policies are verified against this database, so a stack that drifted
// to another major version verifies the policies against something the
// instance does not run. The pin lives in supabase/config.toml; this script
// compares the running server against it and fails when they differ.
//
// It shells out to psql rather than using the pg driver, so it needs nothing
// installed: the check can run before the dependencies are in place, which is
// where a gate like this belongs — before anything has been applied.
//
// Usage: DATABASE_URL=postgresql://... node scripts/ci/assert-postgres-version.mjs

import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const configPath = new URL('../../supabase/config.toml', import.meta.url)
const config = readFileSync(configPath, 'utf8')
const pinned = Number(config.match(/^major_version\s*=\s*(\d+)/m)?.[1])

if (!pinned) {
  console.error('Could not find major_version in supabase/config.toml')
  process.exit(1)
}

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

const versionNum = execFileSync(
  'psql',
  [connectionString, '-tAc', 'SHOW server_version_num'],
  { encoding: 'utf8' },
).trim()

const actual = Math.floor(Number(versionNum) / 10000)

console.log(`pinned PostgreSQL major version: ${pinned}`)
console.log(`running PostgreSQL major version: ${actual}`)

if (actual !== pinned) {
  console.error(
    `The database is running PostgreSQL ${actual}, but supabase/config.toml pins ${pinned}. ` +
      `The instance runs ${pinned}, so this job would verify the policies against a ` +
      `different database than the one that will run them.`,
  )
  process.exit(1)
}
