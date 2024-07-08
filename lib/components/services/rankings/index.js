const {
  snakeCase,
  kebabCase,
  isObject
} = require('lodash')
const dist = require('distributions')
const generateViewStatement = require('./generate-view-statement')

class RankingService {
  async boot (options) {
    const { rankings } = options.blueprintComponents
    const { registry } = options.bootedServices.registry
    const { client } = options.bootedServices.storage

    this.logger = options.bootedServices.logger.child('service:rankings')
    this.client = client
    this.rankings = rankings

    if (!isObject(rankings)) {
      options.messages.info('No rankings to find')
      return
    }

    this.sql = {
      ranking: {
        nonNormalised: {},
        normalised: {},
        default: {}
      },
      stats: {
        preNormalised: {},
        postNormalised: {}
      }
    }

    for (const key of Object.keys(rankings)) {
      await this.generateRanking(
        key,
        rankings[key],
        registry[key],
        options.messages
      )
    }

    await this.executeSql(options.messages)
  }

  async getStats (statsViewKey, category) {
    // category e.g. 'public-building'
    const statsRes = await this.client.query(`select mean::float, stdev::float, ranges from ${statsViewKey} where category = '${category}';`)
    if (statsRes.rows.length > 0) {
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
    } else {
      return { mean: null, stdev: null, ranges: null }
    }
  }

  async findRange (statsViewKey, category, score) {
    if (category) {
      const { ranges } = await this.getStats(statsViewKey, category)
      if (ranges) {
        return ranges.find(score)
      }
    }
  }

  async findDistribution (statsViewKey, category, score) {
    if (category) {
      const { mean, stdev } = await this.getStats(statsViewKey, category)

      if (mean && stdev) {
        const normal = dist.Normal(mean, stdev)
        const pdf = normal.pdf(score)
        return Math.round(pdf * 10000) / 10000
      }
    }
  }

  async generateRanking (key, config, weights, messages) {
    if (!weights || !config.source || !config.factors) {
      return
    }

    const factors = reduceFactors(config.factors, weights)
    const [schema, viewName] = key.split('_').map(snakeCase) // e.g. wmfs, care_home
    const categoryName = kebabCase(viewName) // e.g. care-home
    const statsViewName = `${schema}.${snakeCase(config.rankingModel)}_stats` // e.g. wmfs.ranking_uprns_stats

    const rankingViewOpts = {
      ranking: factors,
      registry: weights,
      schema,
      source: config.source
    }

    if (config.normalise === true) {
      this.sql.ranking.nonNormalised[key] = generateViewStatement({ category: viewName + '_non_normalised', ...rankingViewOpts })
      this.sql.ranking.normalised[key] = generateViewStatement({ category: viewName, normalise: { statsViewName, categoryName }, ...rankingViewOpts })
      appendStats(this.sql.stats.preNormalised, statsViewName, categoryName + '-non-normalised', schema, viewName + '_non_normalised')
      appendStats(this.sql.stats.postNormalised, statsViewName, categoryName + '-non-normalised', schema, viewName + '_non_normalised')
      appendStats(this.sql.stats.postNormalised, statsViewName, categoryName, schema, viewName)
    } else {
      appendStats(this.sql.stats.preNormalised, statsViewName, categoryName, schema, viewName)
      appendStats(this.sql.stats.postNormalised, statsViewName, categoryName, schema, viewName)
      this.sql.ranking.default[key] = generateViewStatement({ category: viewName, ...rankingViewOpts })
    }
  }

  async executeSql (messages) {
    messages.info('Creating default ranking views')
    for (const sql of Object.values(this.sql.ranking.default)) {
      messages.detail(sql.substring(0, 50) + '...')
      await this.client.query(sql)
    }

    messages.info('Creating non-normalised ranking views')
    for (const sql of Object.values(this.sql.ranking.nonNormalised)) {
      messages.detail(sql.substring(0, 50) + '...')
      await this.client.query(sql)
    }

    messages.info('Creating stats views')
    for (const [k, v] of Object.entries(this.sql.stats.preNormalised)) {
      const sql = `CREATE OR REPLACE VIEW ${k} AS ${v.join(' UNION ')};`
      messages.detail(sql.substring(0, 50) + '...')
      await this.client.query(sql)
    }

    messages.info('Creating normalised ranking views')
    for (const sql of Object.values(this.sql.ranking.normalised)) {
      messages.detail(sql.substring(0, 50) + '...')
      await this.client.query(sql)
    }

    messages.info('Re-creating stats view')
    for (const [k, v] of Object.entries(this.sql.stats.postNormalised)) {
      const sql = `CREATE OR REPLACE VIEW ${k} AS ${v.join(' UNION ')};`
      messages.detail(sql.substring(0, 50) + '...')
      await this.client.query(sql)
    }
  }
}

function reduceFactors (factors, weights) {
  return Object.entries(factors)
    .reduce((obj, [k, v]) => {
      if (Object.keys(weights.value).includes(k)) {
        obj[k] = v
      }
      return obj
    }, {})
}

function appendStats (target, statsViewName, categoryName, schema, viewName) {
  const selectStats = generateStatsSql(categoryName, schema, viewName)
  if (!target[statsViewName]) {
    target[statsViewName] = []
  }
  target[statsViewName].push(selectStats)
}

function generateStatsSql (categoryName, schema, viewName) {
  return `SELECT 
    '${categoryName}' AS category,
    COUNT(*) AS count,
    ROUND(AVG(original_risk_score), 2) AS mean,
    ROUND(VAR_POP(original_risk_score), 2) AS variance,
    ROUND(STDDEV_POP(original_risk_score), 2) AS stdev,
    CASE
      WHEN COUNT(*) > 10000
      THEN CAST('{"veryLow": {"lowerBound": 0, "upperBound": '|| ROUND(AVG(original_risk_score) - (2 * STDDEV_POP(original_risk_score)), 2) ||'}, "low": {"lowerBound": '|| ROUND(AVG(original_risk_score) - (2 * STDDEV_POP(original_risk_score)) + 0.01, 2) ||', "upperBound": '|| ROUND(AVG(original_risk_score) - STDDEV_POP(original_risk_score), 2) ||'}, "medium": {"lowerBound": '|| ROUND(AVG(original_risk_score) - STDDEV_POP(original_risk_score) + 0.01, 2) ||', "upperBound": '|| ROUND(AVG(original_risk_score) + STDDEV_POP(original_risk_score), 2) ||'}, "high": {"lowerBound": '|| ROUND(AVG(original_risk_score) + STDDEV_POP(original_risk_score) + 0.01, 2) ||', "upperBound": '|| ROUND(AVG(original_risk_score) + (2 * STDDEV_POP(original_risk_score)), 2) ||'}, "veryHigh": {"lowerBound": '|| ROUND(AVG(original_risk_score) + (2 * STDDEV_POP(original_risk_score)) + 0.01, 2) ||', "upperBound": '|| ROUND(MAX(original_risk_score), 2) ||'}}' AS jsonb)
      ELSE CAST('{"veryLow": {"lowerBound": 0, "upperBound": '|| ROUND(AVG(original_risk_score) - STDDEV_POP(original_risk_score), 2) ||'}, "medium": {"lowerBound": '|| ROUND(AVG(original_risk_score) - STDDEV_POP(original_risk_score) + 0.01, 2) ||', "upperBound": '|| ROUND(AVG(original_risk_score) + STDDEV_POP(original_risk_score), 2) ||'}, "veryHigh": {"lowerBound": '|| ROUND(AVG(original_risk_score) + STDDEV_POP(original_risk_score) + 0.01, 2) ||', "upperBound": '|| ROUND(MAX(original_risk_score), 2) ||'}}' AS jsonb)
    END AS ranges  
  FROM ${schema}.${viewName}_scores`
}

function unifyStatsSql (selects) {
  return Object
    .entries(selects)
    .map(([key, value]) => {
      return `CREATE OR REPLACE VIEW ${key} AS ${value.join(' UNION ')};`
    })
    .join('\n')
}

module.exports = {
  serviceClass: RankingService,
  bootAfter: ['registry', 'storage']
}
