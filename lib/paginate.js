import pino from 'pino'

const logger = pino(
  process.env.NODE_ENV === 'production'
    ? { name: 'fetchRootPaginatedFields', level: 'debug' }
    : { name: 'fetchRootPaginatedFields', level: 'debug', transport: { target: 'pino-pretty', options: { colorize: true, singleLine: true } } }
)

export default async function fetchRootPaginatedFields(query, cursorVars, fetchGraphQL) {
  // Ne garde que les champs racine
  const rootPaths = Object.keys(cursorVars).filter(path => !path.includes('.'))
  const filteredVars = Object.fromEntries(rootPaths.map(p => [p, cursorVars[p]]))

  const cursors = Object.fromEntries(Object.values(filteredVars).map(k => [k, null]))
  const finished = Object.fromEntries(Object.keys(filteredVars).map(k => [k, false]))
  const buffers = Object.fromEntries(Object.keys(filteredVars).map(k => [k, []]))

  let lastFullResult = null

  while (Object.values(finished).some(v => !v)) {
    const currentVariables = {}
    for (const [path, varName] of Object.entries(filteredVars)) {
      if (!finished[path]) currentVariables[varName] = cursors[varName]
    }

    const res = await fetchGraphQL(query, currentVariables)
    logger.debug(`paginate.js response: ${JSON.stringify(res).substring(0, 200)}`)
    if (!lastFullResult) lastFullResult = structuredClone(res.data)

    for (const path in filteredVars) {
      if (finished[path]) continue

      const section = res.data?.[path]
      if (!section?.nodes) continue

      buffers[path].push(...section.nodes)

      if (section.pageInfo?.hasNextPage && section.pageInfo?.endCursor) {
        cursors[filteredVars[path]] = section.pageInfo.endCursor
      } else {
        finished[path] = true
      }
    }
  }

  // Fusionne les nodes et écrase les pageInfo
  for (const path in buffers) {
    lastFullResult[path].nodes = buffers[path]
    lastFullResult[path].pageInfo = { hasNextPage: false }
  }

  return { data: lastFullResult }
}
