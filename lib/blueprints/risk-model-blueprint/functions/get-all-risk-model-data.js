module.exports = function () {
  return async function (env) {
    const { rankings } = env.bootedServices.rankings
    const { registry } = env.bootedServices.registry

    const riskModels = []

    for (const [key, value] of Object.entries(rankings)) {
      if (value.source && value.factors && registry[key]) {
        const label = getLabel(key, value, registry[key])

        riskModels.push({
          label,
          key,
          rankings: value,
          registry: registry[key],
          launches: [
            {
              title: 'View',
              stateMachineName: 'riskModel_viewRiskModel_1_0',
              input: {
                riskModelKey: key
              }
            }
          ]
        })
      }
    }

    return riskModels
  }
}

function getLabel (key, ranking, registry) {
  if (registry && registry.meta && registry.meta.label) return registry.meta.label
  if (ranking && ranking.label) return ranking.label
  return key
}
