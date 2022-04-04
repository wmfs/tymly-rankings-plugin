function calculateGrowthCurve (exp, daysElapsed, riskScore, logger) {
  const exponential = Math.exp(exp * daysElapsed)
  const denominator = 1 + (81 * exponential)
  const curveValue = riskScore / denominator

  if (logger) {
    logger.debug(`Calculating growth curve: ${riskScore} / ( 1 + ( 81 * ( e ^ ( ${daysElapsed} * ${exp} ) ) ) ) = ${curveValue}`)
  }

  return curveValue
} // calculateGrowthCurve

module.exports = calculateGrowthCurve
