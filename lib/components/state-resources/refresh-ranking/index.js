const generateView = require('./../../services/rankings/generate-view-statement.js')
const generateStats = require('./../../services/rankings/generate-stats.js')
const _ = require('lodash')

class RefreshRanking {
  init (resourceConfig, env, callback) {
    this.rankings = env.blueprintComponents.rankings
    this.client = env.bootedServices.storage.client
    this.registry = env.bootedServices.registry
    this.storage = env.bootedServices.storage
    this.timestamp = env.bootedServices.timestamp
    callback(null)
  }

  async run (event, context) {
    const { schema, category } = event

    if (!schema && !category) {
      console.log('No schema or category on input')
      return context.sendTaskSuccess()
      // todo: send failure, but also if schema/category invalid
    }

    console.log('Refreshing', schema, category)

    const key = schema + '_' + category
    const registry = this.registry.get(key)

    const factors =
      Object.keys(this.rankings[key].factors)
        .filter(factor => Object.keys(registry).includes(factor))
        .reduce((obj, k) => {
          obj[k] = this.rankings[key].factors[k]
          return obj
        }, {})

    const statement = generateView({
      category: _.snakeCase(category),
      schema: _.snakeCase(schema),
      source: this.rankings[key].source,
      ranking: factors,
      registry: { value: registry }
    })

    const rankingModel = this.storage.models[`${schema}_${this.rankings[key].rankingModel}`]
    const statsModel = this.storage.models[`${schema}_${this.rankings[key].statsModel}`]
    const statsViewKey = `${_.snakeCase(schema)}.${_.snakeCase(this.rankings[key].statsModel)}_view`

    generateStats({
      client: this.client,
      category: category,
      schema: schema,
      pk: this.rankings[key].source.property,
      name: schema,
      rankingModel: rankingModel,
      statsModel: statsModel,
      statsViewKey,
      registry: this.registry.registry[key],
      timestamp: this.timestamp
    }, async (err) => {
      if (err) return context.sendTaskFailure({ error: 'generateStatsFail', cause: err })
      await this.client.query(statement)
        .then(() => context.sendTaskSuccess())
        .catch(err => context.sendTaskFailure({ error: 'generateViewFail', cause: err }))
    })
  }
}

module.exports = RefreshRanking
