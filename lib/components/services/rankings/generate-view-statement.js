const _ = require('lodash')
const generateCaseStatement = require('./generate-case-statement')
const generateJoinStatement = require('./generate-join-statement')

module.exports = function generateViewStatement (options) {
  const {
    category,
    ranking,
    registry,
    schema,
    source
  } = options

  let preStatement = `CREATE OR REPLACE VIEW ${schema}.${category}_scores AS `
  let outerSelect = []
  let totalScore = []
  let innerSelect = []
  let joinParts = new Set()
  let postStatement = `WHERE rank.ranking_name = '${_.kebabCase(category)}'::text ) scores`

  outerSelect.push(`DISTINCT scores.${source['property']}`)
  innerSelect.push(`g.${source['property']}`)

  source['otherProperties'].map(i => {
    outerSelect.push(`scores.${i}`)
    innerSelect.push(`g.${i} as ${i}`)
  })

  _.forEach(ranking, function (value, key) {
    if (value.hasOwnProperty('sourceProperty')) {
      joinParts.add(generateJoinStatement({
        factorObj: registry.value[key],
        schema: _.snakeCase(value.namespace),
        table: _.snakeCase(value.model),
        columnToMatch: _.snakeCase(value.sourceProperty)
      }))
    } else {
      joinParts.add(generateJoinStatement({
        factorObj: registry.value[key],
        schema: _.snakeCase(value.namespace),
        table: _.snakeCase(value.model),
        columnToMatch: _.snakeCase(source['property'])
      }))
    }
    innerSelect.push(generateCaseStatement({
      factorName: _.snakeCase(key),
      factorObj: registry.value[key],
      schema: _.snakeCase(value.namespace),
      table: _.snakeCase(value.model),
      column: _.snakeCase(value.property)
    }))
    outerSelect.push(`scores.${_.snakeCase(key)}_score`)
    totalScore.push(`scores.${_.snakeCase(key)}_score`)
  })

  outerSelect.push(`${totalScore.join(' + ')} AS original_risk_score`)
  outerSelect.push(`scores.updated_risk_score AS updated_risk_score`)
  innerSelect.push(`rank.updated_risk_score AS updated_risk_score`)

  joinParts.add(`JOIN ${schema}.ranking_${_.snakeCase(source['property'])}s rank ON ` +
    `rank.${_.snakeCase(source['property'])} = g.${_.snakeCase(source['property'])}`)

  let viewStatement =
    preStatement +
    `SELECT ` +
    outerSelect.join(', ') +
    ` FROM ` +
    `(SELECT ` +
    innerSelect.join(', ') +
    ` FROM ${schema}.${source['model']} g `

  for (const i of joinParts) {
    viewStatement += `${i} `
  }

  viewStatement += postStatement
  return viewStatement
}
