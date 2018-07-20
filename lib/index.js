const dynamo = require('./dynamo')
const Promise = require('bluebird')

async function updateAggregation(topic, message, aggregator) {
  const aggregationKey = message[aggregator.key]
  const aggregationId = `${aggregator.aggregator}:${aggregationKey}`

  const results = await dynamo.updateAggregation(aggregationId, topic, message)
  console.log(JSON.stringify(results, null, 4))  
}

exports.handler = async (events) => {
  let event = events['Records'][0]

  if (event['EventSource'] === 'aws:sns') {
    console.time('agregoncio:sns')
    event = event['Sns']
    
    const topic = event['TopicArn'].split(':').pop()
    const message = JSON.parse(event['Message'])
    const aggregators = await dynamo.getAggregatorsFor(topic)

    Promise
      .resolve(aggregators)
      .mapSeries(aggregator => updateAggregation(topic, message, aggregator))
      .then(() => console.timeEnd('agregoncio:sns'))
  }
}

exports.handler(require('../tests/data/sns-event.json'))

// 1. Receives SNS event
// 2. Queries dynamodb for aggregators that include that event (aggregators)
// 3. Updates dynamodb with event received (aggregation-results)
  // 3.1. If new data record in dynamodb conforms to completion expression, then
  //   3.1. Update the record with completed and publish aggregated event
  // 3.1. If new data record in dynamodb does not comply with completion expression, then do nothing
