const {
  snakeCase,
  kebabCase,
  isObject
} = require('lodash')
const dist = require('distributions')
const generateViewStatement = require('./generate-view-statement')
const debug = require('debug')('tymly-rankings-plugin')

class RankingService {
  async boot (options, callback) {
    const client = options.bootedServices.storage.client
    const rankings = options.blueprintComponents.rankings
    this.client = client
    this.rankings = rankings

    if (!isObject(rankings)) {
      options.messages.info('No rankings to find')
      return callback(null)
    }

    const statsViewSQL = {}

    options.messages.info('Finding rankings')

    for (const key of Object.keys(rankings)) {
      const value = rankings[key]

      if (value.source && value.factors && options.bootedServices.registry.registry[key]) {
        const factors = Object.keys(value.factors)
          .filter(factor => Object.keys(options.bootedServices.registry.registry[key].value).includes(factor))
          .reduce((obj, key) => {
            obj[key] = value.factors[key]
            return obj
          }, {})

        const viewSQL = generateViewStatement({
          category: snakeCase(value.name),
          schema: snakeCase(value.namespace),
          source: value.source,
          ranking: factors,
          registry: options.bootedServices.registry.registry[key]
        })

        debug(`${key} - View SQL \n ${viewSQL}`)

        await client.query(viewSQL)

        const statsViewKey = `${snakeCase(value.namespace)}.${snakeCase(value.rankingModel)}_stats`

        if (!statsViewSQL[statsViewKey]) statsViewSQL[statsViewKey] = []

        // todo: median is missing but we don't use that yet
        statsViewSQL[statsViewKey].push(
          'SELECT ' +
          `'${kebabCase(value.name)}' AS category, ` +
          'COUNT(*) AS count, ' +
          'ROUND(AVG(original_risk_score), 2) AS mean, ' +
          'ROUND(VAR_POP(original_risk_score), 2) AS variance, ' +
          'ROUND(STDDEV_POP(original_risk_score), 2) AS stdev, ' +
          'CASE ' +
          'WHEN COUNT(*) > 10000 ' +
          'THEN CAST(\'{"veryLow": {"lowerBound": 0, "upperBound": \'|| ROUND(AVG(original_risk_score) - (2 * STDDEV_POP(original_risk_score)), 2) ||\'}, "low": {"lowerBound": \'|| ROUND(AVG(original_risk_score) - (2 * STDDEV_POP(original_risk_score)) + 0.01, 2) ||\', "upperBound": \'|| ROUND(AVG(original_risk_score) - STDDEV_POP(original_risk_score), 2) ||\'}, "medium": {"lowerBound": \'|| ROUND(AVG(original_risk_score) - STDDEV_POP(original_risk_score) + 0.01, 2) ||\', "upperBound": \'|| ROUND(AVG(original_risk_score) + STDDEV_POP(original_risk_score), 2) ||\'}, "high": {"lowerBound": \'|| ROUND(AVG(original_risk_score) + STDDEV_POP(original_risk_score) + 0.01, 2) ||\', "upperBound": \'|| ROUND(AVG(original_risk_score) + (2 * STDDEV_POP(original_risk_score)), 2) ||\'}, "veryHigh": {"lowerBound": \'|| ROUND(AVG(original_risk_score) + (2 * STDDEV_POP(original_risk_score)) + 0.01, 2) ||\', "upperBound": \'|| ROUND(MAX(original_risk_score), 2) ||\'}}\' AS jsonb) ' +
          'ELSE CAST(\'{"veryLow": {"lowerBound": 0, "upperBound": \'|| ROUND(AVG(original_risk_score) - STDDEV_POP(original_risk_score), 2) ||\'}, "medium": {"lowerBound": \'|| ROUND(AVG(original_risk_score) - STDDEV_POP(original_risk_score) + 0.01, 2) ||\', "upperBound": \'|| ROUND(AVG(original_risk_score) + STDDEV_POP(original_risk_score), 2) ||\'}, "veryHigh": {"lowerBound": \'|| ROUND(AVG(original_risk_score) + STDDEV_POP(original_risk_score) + 0.01, 2) ||\', "upperBound": \'|| ROUND(MAX(original_risk_score), 2) ||\'}}\' AS jsonb) ' +
          'END AS ranges ' +
          `FROM ${snakeCase(value.namespace)}.${snakeCase(value.name)}_scores`
        )
      }
    }

    for (const [viewName, sql] of Object.entries(statsViewSQL)) {
      const statement = `CREATE OR REPLACE VIEW ${viewName} AS ${sql.join(' UNION ')};`
      debug(`${viewName} - Stats SQL \n ${statement}`)
      await client.query(statement)
    }

    callback(null)
  }

  async getStats (statsViewKey, category) {
    // category e.g. 'public-building'
    const statsRes = await this.client.query(`select mean::float, stdev::float, ranges from ${statsViewKey} where category = '${category}';`)
    const { mean, stdev } = statsRes.rows[0]

    const ranges = statsRes.rows[0].ranges || {}
    ranges.find = score => {
      for (const [name, range] of Object.entries(statsRes.rows[0].ranges)) {
        if (score >= range.lowerBound && score <= range.upperBound) {
          return name
        }
      }
    }

    return { mean, stdev, ranges }
  }

  async findRange (statsViewKey, category, score) {
    if (category) {
      const { ranges } = await this.getStats(statsViewKey, category)
      return ranges.find(score)
    }
  }

  async findDistribution (statsViewKey, category, score) {
    if (category) {
      const { mean, stdev } = await this.getStats(statsViewKey, category)

      const normal = dist.Normal(mean, stdev)
      const pdf = normal.pdf(score)
      return Math.round(pdf * 10000) / 10000
    }
  }
}

module.exports = {
  serviceClass: RankingService,
  bootAfter: ['registry', 'storage']
}
