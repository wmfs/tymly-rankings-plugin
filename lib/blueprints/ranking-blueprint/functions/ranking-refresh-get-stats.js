const { startCase } = require('lodash')

const sql = {
  avgDurationOverall: 'select avg(age(_modified, _created)) from wmfs.ranking_refresh_status where status = \'ENDED\';',
  avgDurationPerCategory: 'select key, avg(age(_modified, _created)) from wmfs.ranking_refresh_status where status = \'ENDED\' group by key order by key asc;',
  avgDurationPerDay: 'select date_trunc(\'day\', _modified) as date, AVG(AGE(_modified, _created)) from wmfs.ranking_refresh_status group by date_trunc(\'day\', _modified) order by date_trunc(\'day\', _modified) desc limit 15;'
}

module.exports = function rankingRefreshGetStats () {
  return async function (env) {
    const { client } = env.bootedServices.storage

    const { rows: avgDurationOverall } = await client.query(sql.avgDurationOverall)
    const { rows: avgDurationPerCategory } = await client.query(sql.avgDurationPerCategory)
    const { rows: avgDurationPerDay } = await client.query(sql.avgDurationPerDay)

    const transformAvg = avg => {
      const properties = ['years', 'months', 'days', 'hours', 'minutes', 'seconds']

      return Object.entries(avg)
        .filter(([k]) => properties.includes(k))
        .map(([k, v]) => `${v} ${k}`)
        .join(' ')
    }

    const transform = r => {
      r.avg = transformAvg(r.avg)
      if (r.key) r.key = startCase(r.key.split('wmfs_')[1])
      return r
    }

    return {
      avgDurationOverall: transformAvg(avgDurationOverall[0].avg),
      avgDurationPerCategory: avgDurationPerCategory.map(transform),
      avgDurationPerDay: avgDurationPerDay.map(transform)
    }
  }
}
