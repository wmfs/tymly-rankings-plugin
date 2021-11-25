const moment = require('moment')

module.exports = function rankingRefreshSearch () {
  return async function (env, event) {
    const model = env.bootedServices.storage.models.wmfs_rankingRefreshStatus

    const where = {}

    if (event.key && event.key.trim()) where.key = { equals: event.key.trim() }

    const {
      page,
      totalPages,
      results,
      totalHits
    } = await model.search({ where, page: event.page, limit: 10, orderBy: ['-modified'] })

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
