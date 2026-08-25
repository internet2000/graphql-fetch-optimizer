import { describe, expect, it } from 'vitest'

import createPatchedFetchDefault, { createPatchedFetch } from '../lib/mock.js'
import fetchRootPaginatedFieldsDefault, { fetchRootPaginatedFields } from '../lib/paginate.js'
import transformPaginationArgsDefault, { transformPaginationArgs } from '../lib/transform.js'

describe('public exports', () => {
  it('exposes every entry point both as default and as a named export', () => {
    expect(createPatchedFetch).toBe(createPatchedFetchDefault)
    expect(fetchRootPaginatedFields).toBe(fetchRootPaginatedFieldsDefault)
    expect(transformPaginationArgs).toBe(transformPaginationArgsDefault)
  })

  it('the named exports are functions, not undefined', () => {
    for (const fn of [createPatchedFetch, fetchRootPaginatedFields, transformPaginationArgs]) {
      expect(typeof fn).toBe('function')
    }
  })
})
