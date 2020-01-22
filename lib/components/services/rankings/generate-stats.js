const _ = require('lodash')
const dist = require('distributions')
const calculateNewRiskScore = require('./calculate-new-risk-score')
const projectedRecoveryDates = require('./projected-recovery-dates')
const debug = require('debug')('tymly-rankings-plugin')
const toTwoDp = require('./to-two-dp')

module.exports = async function generateStats (options) {
  debug(options.category + ' - Generating statistics')

  const scores = await loadRiskScores(options)

  if (scores.length === 0) {
    debug(options.category + ' - No scores found')
  } // if ...

  const { mean, stdev, ranges } = await getStats(scores, options)

  const fsRanges = options.registry.value.exponent

  const normal = calculateDistribution(mean, stdev, options)
  await moveCalculatedRiskScoresAlongGrowthCurve(scores, mean, stdev, ranges, normal, fsRanges, options)
} // generateStats

async function loadRiskScores (options) {
  const result = await getScores(options)
  return result.rows.map(r => {
    return {
      uprn: r.uprn,
      original: (r.original_risk_score === 0 || r.original_risk_score === 1) ? 2 : r.original_risk_score
    }
  })
} // loadRiskScores

async function getStats (scores, options) {
  const statsRes = await options.client.query(`select mean::float, stdev::float, ranges from ${options.statsViewKey} where category = '${_.kebabCase(options.category)}'`)
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
} // getStats

function calculateDistribution (mean, stdev, options) {
  debug(options.category + ' - Calculating distributions')

  if (stdev === 0 || stdev === null || mean === null || isNaN(stdev) || isNaN(mean)) {
    return null
  }

  return dist.Normal(mean, stdev)
} // calculateDistribution

function getScores (options) {
  return options.client.query(`SELECT ${_.snakeCase(options.pk)}, original_risk_score::float FROM ${_.snakeCase(options.schema)}.${_.snakeCase(options.category)}_scores`)
}

function distPdf (normal, score) {
  if (normal === null) {
    return NaN
  }

  const pdf = normal.pdf(score)
  return Math.round(pdf * 10000) / 10000
}

async function moveCalculatedRiskScoresAlongGrowthCurve (scores, mean, stdev, ranges, normal, fsRanges, options) {
  debug(options.category + ' - Moving calculated risk score along growth curve')
  for (const s of scores) {
    const row = await options.rankingModel.findById(s.uprn)

    if (!(row.lastAuditDate && row.fsManagement)) {
      await setRankingFromOriginalScore(s, ranges, normal, options)
    } else {
      await moveAlongGrowthCurve(s, row, mean, stdev, ranges, normal, fsRanges, options)
    }
  }
} // moveCalculatedRiskScoresAlongGrowthCurve

async function setRankingFromOriginalScore (score, ranges, normal, options) {
  const range = ranges.find(score.original)

  await options.rankingModel.upsert({
    [options.pk]: score[_.snakeCase(options.pk)],
    rankingName: _.kebabCase(options.category),
    range: _.kebabCase(range),
    distribution: distPdf(normal, score.original),
    originalRiskScore: score.original,
    lastRefresh: new Date()
  }, {
    setMissingPropertiesToNull: false
  })
} // setRankingFromOriginalScore

async function moveAlongGrowthCurve (score, row, mean, stdev, ranges, normal, fsRanges, options) {
  const daysSinceAudit = options.timestamp.today().diff(row.lastAuditDate, 'days')
  const exp = fsRanges[row.fsManagement]

  const originalRange = ranges.find(score.original)
  const crs = calculateNewRiskScore(
    score.original,
    originalRange,
    daysSinceAudit,
    mean,
    stdev,
    exp
  ) // updatedRiskScore

  const updatedRiskScore = toTwoDp(crs)
  const newRange = ranges.find(updatedRiskScore)

  const { projectedHighRiskDate, projectedReturnDate } = projectedRecoveryDates(
    score.original,
    originalRange,
    ranges,
    daysSinceAudit,
    mean,
    stdev,
    exp,
    options.timestamp.today()
  )

  await options.rankingModel.upsert({
    [options.pk]: score[_.snakeCase(options.pk)],
    rankingName: _.kebabCase(options.category),
    range: _.kebabCase(newRange),
    distribution: distPdf(normal, updatedRiskScore),
    originalRiskScore: score.original,
    updatedRiskScore: updatedRiskScore,
    projectedHighRiskCrossover: projectedHighRiskDate,
    projectedReturnToOriginal: projectedReturnDate,
    lastRefresh: new Date()
  }, {
    setMissingPropertiesToNull: false
  })
} // moveAlongGrowthCurve
