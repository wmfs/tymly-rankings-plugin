'use strict'

const _ = require('lodash')
const stats = require('stats-lite')
const dist = require('distributions')
const buildRanges = require('./build-ranges')
const calculateNewRiskScore = require('./calculate-new-risk-score')
const projectedRecoveryDates = require('./projected-recovery-dates')
const debug = require('debug')('tymly-rankings-plugin')
const toTwoDp = require('./to-two-dp')

module.exports = async function generateStats (options, callback) {
  debug(options.category + ' - Generating statistics')

  const scores = await loadRiskScores(options)

  if (scores.length === 0) {
    debug(options.category + ' - No scores found')
  } // if ...

  const { mean, stdev, ranges } = await calculateStats(scores, options)
  const fsRanges = options.registry.value.exponent

  const normal = calculateDistribution(mean, stdev, options)
  await moveCalculatedRiskScoresAlongGrowthCurve(scores, mean, stdev, ranges, normal, fsRanges, options)

  callback(null)
} // generateStats

async function loadRiskScores (options) {
  const result = await getScores(options)
  const scores = result.rows.map(r => {
    const original = (r.original_risk_score === 0 || r.original_risk_score === 1) ? 2 : r.original_risk_score
    return {
      uprn: r.uprn,
      // original: r.original_risk_score
      original
    }
  })

  return scores
} // loadRiskScores

async function calculateStats (scores, options) {
  debug(options.category + ' - Calculating statistics')
  const origScores = scores.map(s => s.original)
  const mean = stats.mean(origScores)
  const stdev = stats.stdev(origScores)
  const ranges = buildRanges(origScores, mean, stdev)

  await saveStats(origScores, mean, stdev, ranges, options)

  return {
    mean,
    stdev,
    ranges
  }
} // calculateStats

async function saveStats (scores, mean, stdev, ranges, options) {
  debug(options.category + ' - Saving stats')
  await options.statsModel.upsert({
    category: _.kebabCase(options.category),
    count: scores.length,
    mean: toTwoDp(mean),
    median: toTwoDp(stats.median(scores)),
    variance: toTwoDp(stats.variance(scores)),
    stdev: toTwoDp(stdev),
    ranges: ranges
  },
  {})
} // saveStats

function calculateDistribution (mean, stdev, options) {
  debug(options.category + ' - Calculating distributions')

  if (stdev === 0 || isNaN(stdev) || isNaN(mean)) {
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
  const rounded = Math.round(pdf * 10000) / 10000
  return rounded
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
    originalRiskScore: score.original
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
    projectedReturnToOriginal: projectedReturnDate
  }, {
    setMissingPropertiesToNull: false
  })
} // moveAlongGrowthCurve
