'use strict'

const _ = require('lodash')
const generateViewStatement = require('./generate-view-statement')
const debug = require('debug')('tymly-rankings-plugin')

class RankingService {
  async boot (options, callback) {
    this.viewSQL = {}
    const client = options.bootedServices.storage.client
    const rankings = options.blueprintComponents.rankings

    if (!_.isObject(rankings)) {
      options.messages.info('No rankings to find')
      return callback(null)
    }

    const statsViewSQL = {}

    options.messages.info('Finding rankings')

    const rankingKeysWithValuesAndRegistry = Object.keys(rankings).filter(key => {
      const value = rankings[key]
      if (value.source && value.factors && options.bootedServices.registry.registry[key]) {
        return key
      }
    })

    for (let key of rankingKeysWithValuesAndRegistry) {
      const value = rankings[key]
      const factors =
        Object.keys(value.factors)
          .filter(factor => Object.keys(options.bootedServices.registry.registry[key].value).includes(factor))
          .reduce((obj, key) => {
            obj[key] = value.factors[key]
            return obj
          }, {})
      this.viewSQL[key] = generateViewStatement({
        category: _.snakeCase(value.name),
        schema: _.snakeCase(value.namespace),
        source: value.source,
        ranking: factors,
        registry: options.bootedServices.registry.registry[key]
      })

      debug(`${key} SQL: \n${this.viewSQL[key]}`)
      await client.query(this.viewSQL[key])

      const statsViewKey = `${_.snakeCase(value.namespace)}.${_.snakeCase(value.rankingModel)}_stats`

      if (!statsViewSQL[statsViewKey]) {
        statsViewSQL[statsViewKey] = []
      }

      // todo: median is missing but we don't use that yet
      statsViewSQL[statsViewKey].push(
        `SELECT ` +
        `'${_.kebabCase(value.name)}' AS category, ` +
        `COUNT(*) AS count, ` +
        `ROUND(AVG(original_risk_score), 2) AS mean, ` +
        `ROUND(VAR_POP(original_risk_score), 2) AS variance, ` +
        `ROUND(STDDEV_POP(original_risk_score), 2) AS stdev, ` +
        `CASE ` +
        `WHEN COUNT(*) > 10000 ` +
        `THEN CAST('{"veryLow": {"lowerBound": 0, "upperBound": '|| ROUND(AVG(original_risk_score) - (2 * STDDEV_POP(original_risk_score)), 2) ||'}, "low": {"lowerBound": '|| ROUND(AVG(original_risk_score) - (2 * STDDEV_POP(original_risk_score)) + 0.01, 2) ||', "upperBound": '|| ROUND(AVG(original_risk_score) - STDDEV_POP(original_risk_score), 2) ||'}, "medium": {"lowerBound": '|| ROUND(AVG(original_risk_score) - STDDEV_POP(original_risk_score) + 0.01, 2) ||', "upperBound": '|| ROUND(AVG(original_risk_score) + STDDEV_POP(original_risk_score), 2) ||'}, "high": {"lowerBound": '|| ROUND(AVG(original_risk_score) + STDDEV_POP(original_risk_score) + 0.01, 2) ||', "upperBound": '|| ROUND(AVG(original_risk_score) + (2 * STDDEV_POP(original_risk_score)), 2) ||'}, "veryHigh": {"lowerBound": '|| ROUND(AVG(original_risk_score) + (2 * STDDEV_POP(original_risk_score)) + 0.01, 2) ||', "upperBound": '|| ROUND(MAX(original_risk_score), 2) ||'}}' AS jsonb) ` +
        `ELSE CAST('{"veryLow": {"lowerBound": 0, "upperBound": '|| ROUND(AVG(original_risk_score) - STDDEV_POP(original_risk_score), 2) ||'}, "medium": {"lowerBound": '|| ROUND(AVG(original_risk_score) - STDDEV_POP(original_risk_score) + 0.01, 2) ||', "upperBound": '|| ROUND(AVG(original_risk_score) + STDDEV_POP(original_risk_score), 2) ||'}, "veryHigh": {"lowerBound": '|| ROUND(AVG(original_risk_score) + STDDEV_POP(original_risk_score) + 0.01, 2) ||', "upperBound": '|| ROUND(MAX(original_risk_score), 2) ||'}}' AS jsonb) ` +
        `END AS ranges ` +
        `FROM ${_.snakeCase(value.namespace)}.${_.snakeCase(value.name)}_scores`
      )
    }

    for (const [viewName, sql] of Object.entries(statsViewSQL)) {
      await client.query(`CREATE OR REPLACE VIEW ${viewName} AS ${sql.join(' UNION ')};`)
    }

    callback(null)
  }
}

module.exports = {
  serviceClass: RankingService,
  bootAfter: ['registry', 'storage']
}
