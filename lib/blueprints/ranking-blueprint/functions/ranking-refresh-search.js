const moment = require('moment')

module.exports = function rankingRefreshSearch () {
  return async function (env, event) {
    const model = env.bootedServices.storage.models.wmfs_rankingRefreshStatus

    const key = event.key ? event.key.trim() : null

    const limit = 10
    const page = event.page || 1
    const offset = (page - 1) * limit

    const where = {}

    if (key && key !== '$ALL') where.key = { equals: key }

    const results = await model.find({ where, offset, limit, orderBy: ['-modified'] })
    const totalHits = await model.findCount({ where })
    const totalPages = Math.ceil(totalHits / limit)

    const transform = x => {
      if (x.status === 'ENDED') {
        const start = moment(x.created)
        const end = moment(x.modified)
        x.duration = moment.duration(end.diff(start)).humanize()
      }
      return x
    }

    return {
      page,
      totalPages,
      results: results.map(transform),
      totalHits
    }
  }
}
