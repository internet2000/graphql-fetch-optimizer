# graphql-fetch-optimizer

`graphql-fetch-optimizer` is a drop-in replacement for nodejs `fetch` that optimizes GraphQL requests before they are executed

It lets you write queries without worrying about complex optims and it transparently improves how they're executed.  

Features include automatic pagination, make all queries sequential (useful with [Eleventy SSG](https://11ty.dev)), debug mode and more to come if you get involved too

## Installation

```bash
npm install --save graphql-fetch-optimizer
````

## Basic usage

In your build entry point (e.g. `.eleventy.mjs` or any JS file):

```js
import { createPatchedFetch } from 'graphql-fetch-optimizer'
const patchedFetch = createPatchedFetch(fetch)
```

Then use the `patchedFetch()` function normally in your code.

## Example

```js
import { createPatchedFetch } from 'graphql-fetch-optimizer'
const patchedFetch = createPatchedFetch(fetch)
const res = await patchedFetch('https://cms.example.com/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: `{
      menus(first: "auto") {
        nodes { id label }
        pageInfo { hasNextPage endCursor }
      }
    }`
  })
})

const json = await res.json()
console.log(json.data.menus.nodes)
```

If the `menus` field contains more than one page of results, the optimizer will fetch all of them and return a merged result.

## Mock mode

You can mock all calls to fetch in your code base:

```js
import { createPatchedFetch } from 'graphql-fetch-optimizer'
globalThis.fetch = createPatchedFetch(globalThis.fetch)
```

## API

Options for `createPatchedFetch`

| Option         | Type      | Default     | Description                                                                 |
|----------------|-----------|-------------|-----------------------------------------------------------------------------|
| `sequential`   | `boolean` | `false`     | If `true`, paginated root fields are fetched one after another instead of in parallel. Useful for underpowered CMS backends. |
| `autoKeyword`  | `string`  | `auto`    | The value used in `first: ...` arguments to trigger pagination.            |

The returned function is a fully-compatible `fetch` replacement. You can assign it to `global.fetch` or use it directly.

## Limitations

* Only root-level fields with `first: "auto"` are paginated
* Your schema must return `nodes[]` and `pageInfo { hasNextPage, endCursor }`
* Nested pagination is not supported

## Advanced usage

Use the core pagination logic manually:

```js
import { fetchRootPaginatedFields } from 'graphql-fetch-optimizer/paginate.js'

const result = await fetchRootPaginatedFields(query, cursorVars, (query, variables) =>
  fetch('https://cms.example.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  }).then(res => res.json())
)
```

## Future ideas

This package is built to evolve as a general-purpose query optimizer. Possible additions:

* Remove unused fragments
* Warn on large or slow responses
* Print query stats or execution plan
* Add a minimum delay between calls

## Project origin

Originally created for [Silex no-code static site builder](https://www.silex.me) that generates GraphQL queries automatically from a no-code interface

It can also be used in any static generator that fetches GraphQL content at build time
