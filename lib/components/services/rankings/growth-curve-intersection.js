function growthCurveIntersection (riskScore, tempScore, exp) {
  const scoreRatio = tempScore === 0 ? 0 : riskScore / tempScore

  const adjustedRatio = (scoreRatio - 1) / 81

  const logRatio = Math.log(adjustedRatio)

  const days = logRatio / exp

  return Math.floor(days) // bring down to whole days
} // growthCurveIntersection

module.exports = growthCurveIntersection
