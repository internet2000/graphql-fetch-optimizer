import { describe, it, expect } from 'vitest'
import fetchRootPaginatedFields from '../lib/paginate.js'

describe('fetchRootPaginatedFields()', () => {
  it('fusionne les nodes sur plusieurs pages et conserve les autres champs', async () => {
    const cursorVars = {
      posts: 'after_0',
      categories: 'after_1'
    }

    const responses = [
      {
        data: {
          posts: {
            nodes: [{ id: 1 }],
            pageInfo: { hasNextPage: true, endCursor: 'p_cursor_1' },
            extra: 'meta'
          },
          categories: {
            nodes: [{ id: 'catA' }],
            pageInfo: { hasNextPage: false }
          }
        }
      },
      {
        data: {
          posts: {
            nodes: [{ id: 2 }, { id: 3 }],
            pageInfo: { hasNextPage: false },
            extra: 'meta'
          },
          categories: {
            nodes: [], // ignoré car déjà terminé
            pageInfo: { hasNextPage: false }
          }
        }
      }
    ]

    let call = 0
    const fetchGraphQL = async () => responses[call++]

    const result = await fetchRootPaginatedFields('ignored', cursorVars, fetchGraphQL)

    expect(result.data.posts.nodes).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
    expect(result.data.posts.pageInfo).toEqual({ hasNextPage: false })
    expect(result.data.posts.extra).toBe('meta')

    expect(result.data.categories.nodes).toEqual([{ id: 'catA' }])
    expect(result.data.categories.pageInfo).toEqual({ hasNextPage: false })
  })

  it('throws on GraphQL errors instead of looping infinitely', async () => {
    const cursorVars = { posts: 'after_0' }

    const fetchGraphQL = async () => ({
      errors: [{ message: 'Field "translation" argument "language" of type "LanguageCodeEnum!" is required' }],
      data: null
    })

    await expect(
      fetchRootPaginatedFields('ignored', cursorVars, fetchGraphQL)
    ).rejects.toThrow('GraphQL error during pagination')
  })

  it('throws when response has no data', async () => {
    const cursorVars = { posts: 'after_0' }

    const fetchGraphQL = async () => ({ data: null })

    await expect(
      fetchRootPaginatedFields('ignored', cursorVars, fetchGraphQL)
    ).rejects.toThrow('GraphQL response has no data')
  })

  it('marks field as finished when nodes are missing', async () => {
    const cursorVars = { posts: 'after_0' }

    const fetchGraphQL = async () => ({
      data: { posts: { unexpected: 'shape' } }
    })

    const result = await fetchRootPaginatedFields('ignored', cursorVars, fetchGraphQL)
    expect(result.data.posts.nodes).toEqual([])
  })
})
