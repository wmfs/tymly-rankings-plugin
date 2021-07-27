module.exports = function () {
  return async function getRiskModelFactor (event, env) {
    const { model, factor } = event

    event.rankings = env.bootedServices.rankings.rankings[model].factors[factor]
    const registry = env.bootedServices.registry.registry[model].value[factor]

    if (registry.type === 'options') {
      registry.options = registry.options.map(opt => {
        opt.readableCriteria = getReadableCriteria(opt)
        return opt
      })
    }

    event.registry = registry
    return event
  }
}

function getReadableCriteria (option) {
  let text = ''

  switch (option.type) {
    case 'numeric-constant':
      text = `Equals ${option.numericValue}`
      break
    case 'numeric-range':
      text = `Between ${option.minimum} and ${option.maximum}`
      break
    case 'numeric-boundary':
      if (option.operator === 'greaterThan') text += 'Greater than'
      else if (option.operator === 'lessThan') text += 'Less than'
      text += ` ${option.numericValue}`
      break
    case 'text-constant':
      text = `Equals '${option.textualValue}'`
      break
    case 'boolean-equals':
      text = `Equals ${option.booleanValue}`
      break
  }

  return text
}
