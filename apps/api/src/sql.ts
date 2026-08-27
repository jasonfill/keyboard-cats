// A very small amount of SQL plumbing.
//
// Not an ORM and not trying to be: the queries in this service are short and
// readable as SQL. What is genuinely tedious is building a parameterised
// multi-row INSERT by hand, so that is all this does.

import type { Queryable } from './db.js'

/**
 * Insert many rows in one statement.
 *
 * Chunked because Postgres caps a statement at 65535 bound parameters, and a
 * long practice session can produce a lot of attempts.
 */
export async function insertMany(
  db: Queryable,
  table: string,
  columns: string[],
  rows: unknown[][],
  conflict = '',
): Promise<void> {
  if (!rows.length) return

  const perRow = columns.length
  const maxRows = Math.max(1, Math.floor(60000 / perRow))

  for (let offset = 0; offset < rows.length; offset += maxRows) {
    const chunk = rows.slice(offset, offset + maxRows)
    const values: unknown[] = []
    const tuples = chunk.map((row) => {
      const placeholders = row.map((value) => {
        values.push(value)
        return `$${values.length}`
      })
      return `(${placeholders.join(', ')})`
    })

    await db.query(
      `insert into ${table} (${columns.join(', ')}) values ${tuples.join(', ')} ${conflict}`,
      values,
    )
  }
}
