module.exports = function () {
  return async function (event, env) {
    const { riskModelKey } = event

    if (!riskModelKey) return event

    event.rankings = env.bootedServices.rankings.rankings[riskModelKey]
    event.registry = env.bootedServices.registry.registry[riskModelKey]
    event.label = getLabel(riskModelKey, event.rankings, event.registry)
    event.factors = Object.keys(event.rankings.factors).map(factor => {
      return {
        factor,
        launches: [
          {
            title: 'View',
            stateMachineName: 'wmfs_viewRiskFactor_1_0',
            input: {
              model: riskModelKey,
              factor
            }
          }
        ]
      }
    })

    return event
  }
}

function getLabel (key, ranking, registry) {
  if (registry && registry.meta && registry.meta.label) return registry.meta.label
  if (ranking && ranking.label) return ranking.label
  return key
}
