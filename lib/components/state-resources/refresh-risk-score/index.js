const _ = require('lodash')
const calculateNewRiskScore = require('./../../services/rankings/calculate-new-risk-score.js')

class RefreshRiskScore {
  init (resourceConfig, env) {
    this.rankings = env.blueprintComponents.rankings
    this.storage = env.bootedServices.storage
    this.client = env.bootedServices.storage.client
  }

  async run (event, context) {
    const uprn = event.uprn
    const schema = event.schema
    const category = event.category
    const key = schema + '_' + category

    const rankingModel = this.storage.models[`${schema}_${this.rankings[key].rankingModel}`]
    const statsViewKey = `${_.snakeCase(schema)}.${_.snakeCase(this.rankings[key].rankingModel)}_stats`

    const rankingDoc = await rankingModel.findById(uprn)
    const statsDoc = await this.client.query(`select * from ${statsViewKey} where category = '${_.kebabCase(category)}'`)
    const riskScore = await this.client.query(getRiskScoreSQL({
      schema: schema,
      category: category,
      uprn: uprn
    }))

    // TODO: update params since function has been reworked
    const updatedRiskScore = calculateNewRiskScore(
      rankingDoc.range,
      riskScore.rows[0].original_risk_score,
      rankingDoc.growthCurve,
      statsDoc.rows[0].mean,
      statsDoc.rows[0].stdev
    )
    context.sendTaskSuccess({ updatedRiskScore })
  }
}

function getRiskScoreSQL (options) {
  return `SELECT original_risk_score FROM ${_.snakeCase(options.schema)}.${_.snakeCase(options.category)}_scores WHERE uprn = ${options.uprn}`
}

module.exports = RefreshRiskScore
