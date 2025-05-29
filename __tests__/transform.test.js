import { describe, it, expect } from 'vitest'
import transformPaginationArgs from '../lib/transform.js'

const query = `
  query {
    languages {
      slug
    }
    posts(first: auto) {
      nodes {
        title
      }
    }
    categories(first: auto) {
      nodes {
        name
      }
    }
  }
`

describe('transformPaginationArgs()', () => {
  it('remplace first:auto par first:100 et ajoute after:$var', () => {
    const { newQuery, cursorVars } = transformPaginationArgs(query)

    expect(cursorVars).toEqual({
      posts: 'after_0',
      categories: 'after_1'
    })

    expect(newQuery).toContain('posts(first: 100, after: $after_0)')
    expect(newQuery).toContain('categories(first: 100, after: $after_1)')
    expect(newQuery).not.toContain('first: auto')
  })
})
