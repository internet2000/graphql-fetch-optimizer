import transformPaginationArgs from './transform.js'
import fetchRootPaginatedFields from './paginate.js'
import pino from 'pino'

const logger = pino(
  process.env.NODE_ENV === 'production'
    ? { name: 'patchedFetch', level: 'warn' }
    : { name: 'patchedFetch', level: 'debug', transport: { target: 'pino-pretty', options: { colorize: true, singleLine: true } } }
)

/**
 * @fileoverview This module creates a drop-in replacement for the provided fetch function to optimize GraphQL queries
 */

export default function createPatchedFetch(realFetch, { sequential = false, autoKeyword = 'auto' } = {}) {
  logger.info(`Patched fetch for pagination (sequential=${sequential}, autoKeyword=${autoKeyword})`)
  let lastPromise = Promise.resolve()
  let fetchId = 0
  return async function patchedFetch(url, options = {}) {
    logger.info(`Fetching: ${url}`)
    // Make header lookup case-insensitive
    const headers = options.headers || {}
    const contentType = Object.entries(headers).find(
      ([k]) => k.toLowerCase() === 'content-type'
    )?.[1]
    const isGraphQL = options?.method === 'POST' &&
      typeof contentType === 'string' &&
      contentType.toLowerCase().includes('application/json')
    const body = isGraphQL ? JSON.parse(options.body) : null
    const id = ++fetchId

    const doFetch = async () => {
      logger.info(`[${id}] doFetch: started`)
      if (!isGraphQL) {
        logger.debug(`Not a GraphQL request, proxying realFetch`, { url, method: options?.method, headers: options?.headers })
        return realFetch(url, options)
      }
      if (!body.query?.includes(`first: ${autoKeyword}`)) {
        // Not a paginated query, just proxy the fetch
        logger.debug(`[${id}] doFetch: proxying realFetch`)
        return realFetch(url, options)
      }
      logger.info(`[${id}] doFetch: transforming query for pagination`)
      const { newQuery, cursorVars } = transformPaginationArgs(body.query, autoKeyword)
      const result = await fetchRootPaginatedFields(newQuery, cursorVars, async (query, variables) => {
        const afterVal = variables?.after_0
        logger.debug(
          `[${id}] doFetch: calling realFetch with transformed query`,
          { url, query: query.substring(0, 200), variables: { ...variables, after_0: afterVal } }
        )
        if (!doFetch._callCount) doFetch._callCount = 0
        doFetch._callCount++
        logger.debug(`[${id}] doFetch: fetcher call #${doFetch._callCount}, after_0: ${afterVal}`)
        try {
          const res = await realFetch(url, {
            method: 'POST',
            headers: options.headers,
            body: JSON.stringify({ query, variables })
          })
          if (res && res.status && !res.ok) {
            logger.error(`[${id}] realFetch HTTP error: status=${res.status} statusText=${res.statusText}`)
          }
          return res.json()
        } catch (err) {
          if (err && err.response && err.response.status) {
            logger.error(`[${id}] realFetch error: ${err.message} status: ${err.response.status}`)
          } else {
            logger.error(`[${id}] realFetch error:`, err)
          }
          throw err
        }
      })
      logger.info(`[${id}] doFetch: finished`)
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }

    if (sequential) {
      logger.info(`[${id}] sequential mode: queuing fetch`)
      const chained = lastPromise.then(() => {
        logger.info(`[${id}] sequential mode: running next fetch`)
        return doFetch()
      })
      lastPromise = chained.catch(() => {}) // ensure queue continues on error
      return chained
    } else {
      logger.info(`[${id}] parallel mode: running fetch immediately`)
      return doFetch()
    }
  }
}
