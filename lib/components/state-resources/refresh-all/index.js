'use strict'

const generateStats = require('./../../services/rankings/generate-stats.js')
const _ = require('lodash')

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
    const rankingKeysWithValuesAndRegistry = Object.keys(this.rankings).filter(key => {
      const value = this.rankings[key]
      if (value.source && value.factors && this.registry.registry[key]) {
        return key
      }
    })

    for (let key of rankingKeysWithValuesAndRegistry) {
      const value = this.rankings[key]
      const rankingModel = this.models[`${_.camelCase(value.namespace)}_${value.rankingModel}`]
      const statsViewKey = `${_.snakeCase(value.namespace)}.${_.snakeCase(value.rankingModel)}_stats`

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

    context.sendTaskSuccess()
  }
}

module.exports = RefreshAll
