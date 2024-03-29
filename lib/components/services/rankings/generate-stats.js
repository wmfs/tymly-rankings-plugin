const _ = require('lodash')
const dist = require('distributions')
const calculateNewRiskScore = require('./calculate-new-risk-score')
const projectedRecoveryDates = require('./projected-recovery-dates')
const toTwoDp = require('./to-two-dp')

module.exports = async function generateStats (options) {
  options.logger.debug(options.category + ' - Generating statistics')

  const scores = await loadRiskScores(options)

  if (scores.length === 0) {
    options.logger.debug(options.category + ' - No scores found')
  } // if ...

  const { mean, stdev, ranges } = await options.getStats(options.statsViewKey, _.kebabCase(options.category))

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

function calculateDistribution (mean, stdev, options) {
  options.logger.debug(options.category + ' - Calculating distributions')

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
  const lastRefresh = new Date()
  options.logger.debug(options.category + ' - Moving calculated risk score along growth curve')
  for (const s of scores) {
    const row = await options.rankingModel.findById(s.uprn)

    if (!(row.lastAuditDate && row.fsManagement)) {
      await setRankingFromOriginalScore(s, ranges, normal, options, lastRefresh)
    } else {
      await moveAlongGrowthCurve(s, row, mean, stdev, ranges, normal, fsRanges, options, lastRefresh)
    }

    await updateRiskScoreTrail(row, options)
  }
} // moveCalculatedRiskScoresAlongGrowthCurve

async function setRankingFromOriginalScore (score, ranges, normal, options, lastRefresh) {
  const range = ranges.find(score.original)

  await options.rankingModel.upsert({
    [options.pk]: score[_.snakeCase(options.pk)],
    rankingName: _.kebabCase(options.category),
    range: _.kebabCase(range),
    distribution: distPdf(normal, score.original),
    originalRiskScore: score.original,
    lastRefresh
  }, {
    setMissingPropertiesToNull: false
  })
} // setRankingFromOriginalScore

async function moveAlongGrowthCurve (score, row, mean, stdev, ranges, normal, fsRanges, options, lastRefresh) {
  const daysSinceAudit = options.timestamp.today().diff(row.lastAuditDate, 'days')
  const exp = fsRanges[row.fsManagement]

  const originalRange = ranges.find(score.original)
  const crs = calculateNewRiskScore(
    score.original,
    originalRange,
    daysSinceAudit,
    mean,
    stdev,
    exp,
    options.logger
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
    updatedRiskScore,
    projectedHighRiskCrossover: projectedHighRiskDate,
    projectedReturnToOriginal: projectedReturnDate,
    lastRefresh
  }, {
    setMissingPropertiesToNull: false
  })
} // moveAlongGrowthCurve

async function updateRiskScoreTrail (ranking, options) {
  const latest = await options.riskScoreTrailModel.findOne({
    where: {
      uprn: {
        equals: ranking.uprn
      }
    },
    orderBy: ['-created'],
    fields: ['eventName']
  })

  if (!latest || latest.eventName === 'REFRESHED') {
    return
  }

  await options.riskScoreTrailModel.upsert(
    {
      ...ranking,
      eventName: 'REFRESHED'
    }, {
      setMissingPropertiesToNull: false
    }
  )
} // updateRiskScoreTrail
