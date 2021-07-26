module.exports = function () {
  return async function (event, env) {
    const { model, factor } = event

    event.rankings = env.bootedServices.rankings.rankings[model].factors[factor]
    event.registry = env.bootedServices.registry.registry[model].value[factor]

    return event
  }
}
