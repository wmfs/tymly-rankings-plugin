module.exports = function () {
  return async function shapeRiskFactorPreEdit (event, env) {
    event.factorLabel = event.registry.label
    event.type = event.registry.type

    if (event.type === 'constant') {
      event.constant = event.registry.score
    }

    if (event.type === 'options') {
      event.defaultValue = event.registry.default
      // todo: options
    }

    return event
  }
}
