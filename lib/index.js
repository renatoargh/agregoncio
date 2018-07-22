const dynamodb = require('./dynamodb')
const sns = require('./sns')
const ddt = require('dynamodb-data-types').AttributeValue
const Promise = require('bluebird')
const { AGGREGATORS_TABLE } = process.env
const fromAggregatorsTable = new RegExp(`^arn:aws:dynamodb:(.*):table/${AGGREGATORS_TABLE}/stream`)

module.exports = async (events, context) => {
  let event = events['Records'][0]
  console.log(JSON.stringify(event, null, 4))

  const lambdaArn = context.invokedFunctionArn
  const eventSource = event['EventSource'] || event['eventSource']
  const eventName = event['EventName'] || event['eventName']
  const eventSourceARN = event['EventSourceARN'] || event['eventSourceARN']

  if (eventSource === 'aws:sns') {
    event = event['Sns']

    const topic = event['TopicArn']
    const message = JSON.parse(event['Message'])
    const aggregators = await dynamodb.getAggregatorsFor(topic)

    await Promise
      .resolve(aggregators)
      .mapSeries(async aggregator => {
        const aggregationKey = message[aggregator.groupBy]
        const aggregationId = `${aggregator.topic}:${aggregationKey}`
        await dynamodb.updateAggregation(aggregationId, topic, message)
      })

    return
  }

  if (eventSource === 'aws:dynamodb' && fromAggregatorsTable.test(eventSourceARN)) {
    event = event['dynamodb']

    const aggregator = ddt.unwrap(event['Keys']).topic
    const newSubs = ddt.unwrap(event['NewImage']).subscriptions || []
    const oldSubs = ddt.unwrap(event['OldImage']).subscriptions || []

    const newTopics = newSubs.filter(s => !oldSubs.includes(s))
    await sns.subcribeTo(newTopics, lambdaArn, aggregator)

    const unusedTopics = oldSubs.filter(s => !newSubs.includes(s))
    await sns.unsubscribeFrom(unusedTopics, aggregator)

    return
  }

  if (eventSource === 'aws:dynamodb' && eventName === 'MODIFY') {
    event = event['dynamodb']

    const aggregation = ddt.unwrap(event['NewImage'])
    const topic = aggregation.id.split(':').slice(0, -1).join(':')
    const aggregator = await dynamodb.getAggregatorById(topic)
    const expectedEvents = aggregator.subscriptions.map(s => s.split(':').pop())
    const collectedEvents = Object.keys(aggregation.events)
    const hasAllEvents = expectedEvents.every(e => collectedEvents.includes(e))

    if (hasAllEvents) {
      await sns.publishAggregation(topic, aggregation.events)
      await dynamodb.removeAggregation(aggregation.id)
    }

    return
  }
}

// module.exports(require('../tests/data/dynamo-event.json'), {
//   'invokedFunctionArn': 'arn:aws:lambda:eu-central-1:423715701352:function:events-aggregator'
// })
