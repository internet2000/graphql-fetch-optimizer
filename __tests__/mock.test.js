import { describe, it, expect, vi, beforeEach } from 'vitest'
import createPatchedFetch from '../lib/mock.js'

// Mock transformPaginationArgs and fetchRootPaginatedFields
vi.mock('../lib/transform.js', () => ({
  default: () => ({
    newQuery: 'transformedQuery',
    cursorVars: { after: null }
  })
}))
vi.mock('../lib/paginate.js', () => ({
  default: async (query, cursorVars, fetcher) => {
    // Call the fetcher to trigger realFetch and update the order array
    const data = await fetcher(query, cursorVars)
    return data
  }
}))

const dummyQuery = `
  query {
    items(first: auto) {
      edges { node { id } }
    }
  }
`

describe('createPatchedFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls realFetch for non-GraphQL requests', async () => {
    const realFetch = vi.fn().mockResolvedValue('ok')
    const patchedFetch = createPatchedFetch(realFetch)
    const res = await patchedFetch('url', { method: 'GET' })
    expect(res).toBe('ok')
    expect(realFetch).toHaveBeenCalled()
  })

  it('calls realFetch for GraphQL requests without first: auto', async () => {
    const realFetch = vi.fn().mockResolvedValue('ok')
    const patchedFetch = createPatchedFetch(realFetch)
    const res = await patchedFetch('url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'query { foo }' })
    })
    expect(res).toBe('ok')
    expect(realFetch).toHaveBeenCalled()
  })

  it('patches fetch for GraphQL requests with first: auto', async () => {
    const realFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ data: { items: { edges: [{ node: { id: 1 } }] } } })
    })
    const patchedFetch = createPatchedFetch(realFetch)
    const res = await patchedFetch('url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: dummyQuery })
    })
    expect(res).toBeInstanceOf(Response)
    const json = await res.json()
    expect(json).toHaveProperty('data.items.edges')
  })

  it('executes fetches sequentially when sequential=true', async () => {
    let order = []
    const realFetch = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => {
        order.push('first')
        resolve({ json: () => Promise.resolve({ data: 1 }) })
      }, 50)))
      .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => {
        order.push('second')
        resolve({ json: () => Promise.resolve({ data: 2 }) })
      }, 10)))
    const patchedFetch = createPatchedFetch(realFetch, { sequential: true })

    const req1 = patchedFetch('url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: dummyQuery })
    })
    const req2 = patchedFetch('url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: dummyQuery })
    })

    await Promise.all([req1, req2])
    expect(order).toEqual(['first', 'second'])
  })

  it('executes fetches in parallel when sequential=false', async () => {
    let order = []
    const realFetch = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => {
        order.push('first')
        resolve({ json: () => Promise.resolve({ data: 1 }) })
      }, 50)))
      .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => {
        order.push('second')
        resolve({ json: () => Promise.resolve({ data: 2 }) })
      }, 10)))
    const patchedFetch = createPatchedFetch(realFetch, { sequential: false })

    const req1 = patchedFetch('url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: dummyQuery })
    })
    const req2 = patchedFetch('url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: dummyQuery })
    })

    await Promise.all([req1, req2])
    expect(order).toEqual(['second', 'first'])
  })

  it('executes fetches sequentially for GraphQL requests without first: auto when sequential=true', async () => {
    let order = []
    const realFetch = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => {
        order.push('first')
        resolve('ok1')
      }, 50)))
      .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => {
        order.push('second')
        resolve('ok2')
      }, 10)))
    const patchedFetch = createPatchedFetch(realFetch, { sequential: true })

    const req1 = patchedFetch('url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'query { foo }' })
    })
    const req2 = patchedFetch('url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'query { foo }' })
    })

    await Promise.all([req1, req2])
    expect(order).toEqual(['first', 'second'])
  })
})
