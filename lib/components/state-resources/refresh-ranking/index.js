const generateView = require('./../../services/rankings/generate-view-statement.js')
const generateStats = require('./../../services/rankings/generate-stats.js')
const { snakeCase } = require('lodash')

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
      return context.sendTaskFailure({ error: 'noSchemaOrCategory', cause: 'No schema or category on input.' })
    }

    console.log('Refreshing', schema, category)

    const key = schema + '_' + category
    const registry = this.registry.get(key)

    if (!registry) {
      return context.sendTaskFailure({ error: 'noRegistryFound', cause: `No registry found for: ${key}` })
    }

    const refreshModel = this.storage.models['wmfs_rankingRefreshStatus']
    const refreshDoc = await refreshModel.upsert({ key, status: 'STARTED' }, {})

    const factors =
      Object.keys(this.rankings[key].factors)
        .filter(factor => Object.keys(registry).includes(factor))
        .reduce((obj, k) => {
          obj[k] = this.rankings[key].factors[k]
          return obj
        }, {})

    const statement = generateView({
      category: snakeCase(category),
      schema: snakeCase(schema),
      source: this.rankings[key].source,
      ranking: factors,
      registry: { value: registry }
    })

    await this.client.query(statement)

    const rankingModel = this.storage.models[`${schema}_${this.rankings[key].rankingModel}`]
    const statsViewKey = `${snakeCase(schema)}.${snakeCase(this.rankings[key].rankingModel)}_stats`

    await generateStats({
      client: this.client,
      category: category,
      schema: schema,
      pk: this.rankings[key].source.property,
      name: schema,
      rankingModel: rankingModel,
      statsViewKey,
      registry: this.registry.registry[key],
      timestamp: this.timestamp
    })

    await refreshModel.upsert({ key, status: 'ENDED', id: refreshDoc.idProperties.id }, {})

    context.sendTaskSuccess()
  }
}

module.exports = RefreshRanking
