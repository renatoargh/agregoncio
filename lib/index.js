const assert = require('assert')
const dynamodb = require('./dynamodb')
const sns = require('./sns')
const ddt = require('dynamodb-data-types').AttributeValue
const Promise = require('bluebird')

module.exports = async (events) => {
  let event = events['Records'][0]
  const eventSource = event['EventSource'] || event['eventSource']
  const eventName = event['EventName'] || event['eventName']

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
  }
}
