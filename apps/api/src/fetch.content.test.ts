// The fence around fetching a pasted URL.
//
// This is the one place in the app where a stranger's input decides what the
// server connects to, and the upload button is aimed at whatever somebody
// emailed a parent. Every test here is an attack that has to keep failing.

import { describe, expect, it } from 'vitest'
import {
  assertPublicHost,
  googleExportUrl,
  isPrivateAddress,
  looksLikeSignIn,
  MAX_BYTES,
  MAX_REDIRECTS,
  screenUrl,
  TIMEOUT_MS,
} from './content/fetch.js'

describe('addresses the server must never be talked into reaching', () => {
  it('refuses loopback', () => {
    for (const a of ['127.0.0.1', '127.1.2.3', '::1']) {
      expect(isPrivateAddress(a), a).toBe(true)
    }
  })

  it('refuses the cloud metadata endpoint', () => {
    // 169.254.169.254 is how a URL fetcher becomes a credential leak.
    expect(isPrivateAddress('169.254.169.254')).toBe(true)
  })

  it('refuses every private range', () => {
    for (const a of ['10.0.0.1', '172.16.5.4', '172.31.255.255', '192.168.1.1', '100.64.0.1']) {
      expect(isPrivateAddress(a), a).toBe(true)
    }
  })

  it('allows the public addresses either side of a private range', () => {
    for (const a of ['172.15.0.1', '172.32.0.1', '192.167.1.1', '8.8.8.8', '1.1.1.1']) {
      expect(isPrivateAddress(a), a).toBe(false)
    }
  })

  it('sees through an IPv4 address dressed as IPv6', () => {
    // ::ffff:10.0.0.1 is 10.0.0.1, and judging it as "an IPv6 address, not in
    // any IPv6 private range" is exactly how this check gets bypassed.
    expect(isPrivateAddress('::ffff:10.0.0.1')).toBe(true)
    expect(isPrivateAddress('::ffff:8.8.8.8')).toBe(false)
  })

  it('refuses IPv6 unique-local and link-local', () => {
    for (const a of ['fc00::1', 'fd12:3456::1', 'fe80::1']) {
      expect(isPrivateAddress(a), a).toBe(true)
    }
  })

  it('refuses multicast, reserved, and anything malformed', () => {
    for (const a of ['224.0.0.1', '255.255.255.255', 'not-an-address', '1.2.3', '1.2.3.999']) {
      expect(isPrivateAddress(a), a).toBe(true)
    }
  })
})

describe('screening a link before touching it', () => {
  it('allows https', () => {
    expect(screenUrl('https://example.com/a.pdf').ok).toBe(true)
  })

  it('refuses plain http, file, and anything else', () => {
    for (const raw of [
      'http://example.com/a.pdf',
      'file:///etc/passwd',
      'ftp://example.com/a',
      'gopher://example.com',
      'data:text/html,hi',
    ]) {
      expect(screenUrl(raw).ok, raw).toBe(false)
    }
  })

  it('refuses something that is not a URL at all', () => {
    expect(screenUrl('just some words').ok).toBe(false)
  })

  it('says what to do instead rather than just refusing', () => {
    const result = screenUrl('http://example.com')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/paste the file/i)
  })
})

describe('checking where a hostname actually points', () => {
  it('allows a name that resolves to a public address', async () => {
    expect(await assertPublicHost('example.com', async () => ['93.184.216.34'])).toBeNull()
  })

  it('refuses a public name that resolves somewhere private', async () => {
    // A hostname allowlist alone does not survive this: the attacker controls
    // the DNS record, not the name.
    const refusal = await assertPublicHost('evil.example', async () => ['169.254.169.254'])
    expect(refusal?.code).toBe('private-address')
  })

  it('refuses when any one of several addresses is private', async () => {
    // Passing on the first address would connect to whichever the OS picked.
    const refusal = await assertPublicHost('mixed.example', async () => ['8.8.8.8', '10.0.0.1'])
    expect(refusal?.code).toBe('private-address')
  })

  it('refuses a name that resolves to nothing', async () => {
    expect((await assertPublicHost('nowhere.example', async () => []))?.code).toBe('unreachable')
  })

  it('refuses when the lookup itself fails', async () => {
    const refusal = await assertPublicHost('broken.example', async () => {
      throw new Error('ENOTFOUND')
    })
    expect(refusal?.code).toBe('unreachable')
  })
})

describe('Google links', () => {
  it('turns a Doc into a direct PDF export', () => {
    const url = googleExportUrl(new URL('https://docs.google.com/document/d/abc123/edit'))
    expect(url?.toString()).toBe('https://docs.google.com/document/d/abc123/export?format=pdf')
  })

  it('turns Slides into a PDF and Sheets into a CSV', () => {
    expect(
      googleExportUrl(new URL('https://docs.google.com/presentation/d/xyz/edit'))?.toString(),
    ).toContain('/export/pdf')
    expect(
      googleExportUrl(new URL('https://docs.google.com/spreadsheets/d/xyz/edit'))?.toString(),
    ).toContain('format=csv')
  })

  it('leaves anything else alone', () => {
    expect(googleExportUrl(new URL('https://example.com/document/d/abc/edit'))).toBeNull()
    expect(googleExportUrl(new URL('https://docs.google.com/'))).toBeNull()
  })

  it('spots the sign-in page a private document redirects to', () => {
    // Otherwise a login form quietly becomes forty cards about signing in.
    expect(looksLikeSignIn(new URL('https://accounts.google.com/signin'), 'text/html')).toBe(true)
    expect(looksLikeSignIn(new URL('https://docs.google.com/document/d/x'), 'text/html')).toBe(true)
  })

  it('does not mistake a real export for a sign-in page', () => {
    expect(looksLikeSignIn(new URL('https://docs.google.com/document/d/x'), 'application/pdf')).toBe(
      false,
    )
  })
})

describe('the caps', () => {
  it('bounds size, time and redirects', () => {
    expect(MAX_BYTES).toBeLessThanOrEqual(25 * 1024 * 1024)
    expect(TIMEOUT_MS).toBeLessThanOrEqual(30_000)
    expect(MAX_REDIRECTS).toBeLessThanOrEqual(3)
  })
})
