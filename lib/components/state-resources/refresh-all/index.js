const generateStats = require('./../../services/rankings/generate-stats.js')
const { camelCase, snakeCase } = require('lodash')

class RefreshAll {
  init (resourceConfig, env, callback) {
    this.client = env.bootedServices.storage.client
    this.rankings = env.blueprintComponents.rankings
    this.registry = env.bootedServices.registry
    this.models = env.bootedServices.storage.models
    this.timestamp = env.bootedServices.timestamp
    callback(null)
  }

  async run (event, context) {
    for (const key of Object.keys(this.rankings)) {
      const value = this.rankings[key]
      if (value.source && value.factors && this.registry.registry[key]) {
        const rankingModel = this.models[`${camelCase(value.namespace)}_${value.rankingModel}`]
        const statsViewKey = `${snakeCase(value.namespace)}.${snakeCase(value.rankingModel)}_stats`

        await generateStats({
          client: this.client,
          category: value.name,
          schema: value.namespace,
          pk: value.source.property,
          name: value.namespace,
          rankingModel: rankingModel,
          statsViewKey,
          registry: this.registry.registry[key],
          timestamp: this.timestamp
        })
      }
    }

    context.sendTaskSuccess()
  }
}

module.exports = RefreshAll
