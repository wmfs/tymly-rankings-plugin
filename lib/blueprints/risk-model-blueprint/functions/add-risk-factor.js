module.exports = function () {
  return async function addRiskFactor (event, env) {
    const {
      riskModelKey,
      key: factorKey,
      type,
      factorLabel: label,
      constant,
      defaultValue
    } = event

    const factor = { type, label }

    if (type === 'constant') {
      factor.score = constant
    }

    if (type === 'options') {
      factor.default = defaultValue
      factor.options = [] // todo: options
    }

    console.log(factor)
    // todo: add factor to rankings/registry key

    return event
  }
}
