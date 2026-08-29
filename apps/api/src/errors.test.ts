// Turning database refusals into honest HTTP.
//
// The policies and triggers are the enforcement layer, so what they raise is
// an answer rather than a failure. Getting a status wrong here turns "you may
// not do that" into "something broke", which is the difference between a
// client that can react and one that just retries.

import { describe, expect, it } from 'vitest'
import { badRequest, forbidden, fromDatabaseError, HttpError, notFound, unauthorized } from './errors.js'

describe('HttpError constructors', () => {
  it('carries a status and a machine-readable code', () => {
    expect(badRequest('nope')).toMatchObject({ status: 400, code: 'bad_request', message: 'nope' })
    expect(unauthorized()).toMatchObject({ status: 401, code: 'unauthorized' })
    expect(forbidden()).toMatchObject({ status: 403, code: 'forbidden' })
    expect(notFound()).toMatchObject({ status: 404, code: 'not_found' })
  })

  it('is a real Error, so it survives a throw and a stack trace', () => {
    const err = badRequest('nope')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(HttpError)
    expect(err.name).toBe('HttpError')
  })

  it('lets a caller override the code while keeping the status', () => {
    expect(badRequest('nope', 'rejected')).toMatchObject({ status: 400, code: 'rejected' })
  })
})

describe('fromDatabaseError', () => {
  const pg = (code: string, message = 'db said no') => ({ code, message })

  it('maps a policy refusal to 403, not 500', () => {
    // RLS declining a write is an answer. Reporting it as a server error would
    // make a permissions problem look like an outage.
    expect(fromDatabaseError(pg('42501'))).toMatchObject({ status: 403, code: 'forbidden' })
  })

  it('maps a check violation to 400 and keeps the database’s wording', () => {
    // The age gate and the expiry guards raise these, and their message is
    // written to be read by a person.
    const mapped = fromDatabaseError(pg('23514', 'Learner must be 13 or older'))
    expect(mapped).toMatchObject({ status: 400, code: 'rejected' })
    expect(mapped!.message).toBe('Learner must be 13 or older')
  })

  it('maps a unique violation to 409', () => {
    expect(fromDatabaseError(pg('23505'))).toMatchObject({ status: 409, code: 'conflict' })
  })

  it('maps a dangling foreign key to 400 without echoing the constraint', () => {
    const mapped = fromDatabaseError(pg('23503', 'insert violates fk learners_owner_fkey'))
    expect(mapped).toMatchObject({ status: 400, code: 'bad_reference' })
    // Internal schema names are not the caller's business.
    expect(mapped!.message).not.toContain('learners_owner_fkey')
  })

  it('maps a malformed uuid to 400 rather than leaking the parse error', () => {
    const mapped = fromDatabaseError(pg('22P02', 'invalid input syntax for type uuid: "abc"'))
    expect(mapped).toMatchObject({ status: 400, code: 'bad_request' })
    expect(mapped!.message).not.toContain('abc')
  })

  it('declines to guess at an unrecognised database error', () => {
    // Returning null lets it become a 500, which is the honest answer for
    // something genuinely unexpected.
    expect(fromDatabaseError(pg('08006'))).toBeNull()
  })

  it('declines on anything that is not a database error at all', () => {
    for (const notPg of [new Error('boom'), null, undefined, 'string', 42, {}]) {
      expect(fromDatabaseError(notPg)).toBeNull()
    }
  })

  it('has a message even when the database supplied none', () => {
    expect(fromDatabaseError({ code: '42501' })!.message).toBeTruthy()
  })
})
