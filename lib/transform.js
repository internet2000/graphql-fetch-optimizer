import { parse, visit, print, Kind } from 'graphql'
import pino from 'pino'

const logger = pino(
  process.env.NODE_ENV === 'production'
    ? { name: 'transformPaginationArgs', level: 'debug' }
    : { name: 'transformPaginationArgs', level: 'debug', transport: { target: 'pino-pretty', options: { colorize: true, singleLine: true } } }
)

export default function transformPaginationArgs(query, autoKeyword = 'auto') {
  logger.debug(`input query: ${query.substring(0, 200)}`)
  const ast = parse(query)
  const cursorVars = {}
  let autoIndex = 0
  let afterVars = []

  let hasOperationDefinition = false

  const transformed = visit(ast, {
    Field(node) {
      const firstArgIndex = node.arguments?.findIndex(arg =>
        arg.name.value === 'first' &&
        arg.value.kind === 'EnumValue' &&
        arg.value.value === autoKeyword
      )

      if (firstArgIndex !== -1) {
        const path = node.name.value
        const afterVar = `after_${autoIndex++}`
        cursorVars[path] = afterVar
        afterVars.push(afterVar)

        const newArgs = [...node.arguments]
        newArgs[firstArgIndex] = {
          kind: Kind.ARGUMENT,
          name: { kind: Kind.NAME, value: 'first' },
          value: { kind: Kind.INT, value: '100' }
        }
        newArgs.push({
          kind: Kind.ARGUMENT,
          name: { kind: Kind.NAME, value: 'after' },
          value: { kind: Kind.VARIABLE, name: { kind: Kind.NAME, value: afterVar } }
        })

        logger.debug(`transformed field: ${path} afterVar: ${afterVar}`)
        return { ...node, arguments: newArgs }
      }
    },
    OperationDefinition: {
      enter(node) {
        hasOperationDefinition = true
        // Add variable definitions for all afterVars
        let varDefs = node.variableDefinitions ? [...node.variableDefinitions] : []
        for (const v of afterVars) {
          if (!varDefs.some(def => def.variable.name.value === v)) {
            varDefs.push({
              kind: Kind.VARIABLE_DEFINITION,
              variable: { kind: Kind.VARIABLE, name: { kind: Kind.NAME, value: v } },
              type: { kind: Kind.NAMED_TYPE, name: { kind: Kind.NAME, value: 'String' } },
              defaultValue: { kind: Kind.NULL }
            })
          }
        }
        logger.debug(`operation variableDefinitions: ${varDefs.map(d => d.variable.name.value).join(', ')}`)
        return { ...node, variableDefinitions: varDefs }
      }
    }
  })

  // Always ensure variableDefinitions are present on the first OperationDefinition
  let finalAst = transformed
  if (afterVars.length > 0) {
    finalAst = {
      ...transformed,
      definitions: transformed.definitions.map(def => {
        if (def.kind === 'OperationDefinition') {
          // Add variableDefinitions if missing or incomplete
          let varDefs = def.variableDefinitions ? [...def.variableDefinitions] : []
          for (const v of afterVars) {
            if (!varDefs.some(d => d.variable.name.value === v)) {
              varDefs.push({
                kind: Kind.VARIABLE_DEFINITION,
                variable: { kind: Kind.VARIABLE, name: { kind: Kind.NAME, value: v } },
                type: { kind: Kind.NAMED_TYPE, name: { kind: Kind.NAME, value: 'String' } },
                defaultValue: { kind: Kind.NULL }
              })
            }
          }
          // Always ensure name property exists
          return {
            ...def,
            name: def.name || { kind: Kind.NAME, value: '' },
            variableDefinitions: varDefs
          }
        }
        // If not an OperationDefinition, wrap as before
        return {
          kind: Kind.OPERATION_DEFINITION,
          operation: 'query',
          name: { kind: Kind.NAME, value: '' },
          variableDefinitions: afterVars.map(v => ({
            kind: Kind.VARIABLE_DEFINITION,
            variable: { kind: Kind.VARIABLE, name: { kind: Kind.NAME, value: v } },
            type: { kind: Kind.NAMED_TYPE, name: { kind: Kind.NAME, value: 'String' } },
            defaultValue: { kind: Kind.NULL }
          })),
          selectionSet: def.selectionSet
        }
      })
    }
  }

  const printed = print(finalAst)
  logger.debug(`output query: ${printed.substring(0, 200)}`)
  logger.debug(`cursorVars: ${JSON.stringify(cursorVars)}`)
  if (Object.keys(cursorVars).length === 0) {
    logger.warn('No pagination fields found, returning original query')
    return { newQuery: query, cursorVars: {} }
  }
  return {
    newQuery: printed,
    cursorVars
  }
}
