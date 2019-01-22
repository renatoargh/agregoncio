const dynamodb = require('./dynamodb')
const sns = require('./sns')
const ddt = require('dynamodb-data-types').AttributeValue
const { AGGREGATORS_TABLE } = process.env
const fromAggregatorsTable = new RegExp(`^arn:aws:dynamodb:(.*):table/${AGGREGATORS_TABLE}/stream`)

module.exports = async (events, context) => {
  let event = events['Records'][0]

  const lambdaArn = context.invokedFunctionArn
  const eventSource = event['EventSource'] || event['eventSource']
  const eventName = event['EventName'] || event['eventName']
  const eventSourceARN = event['EventSourceARN'] || event['eventSourceARN']
  const fromSns = eventSource === 'aws:sns'
  const fromDynamoDb = eventSource === 'aws:dynamodb'

  // 1. Aggregates new event
  if (fromSns) {
    event = event['Sns']

    const topic = event['TopicArn']
    const message = JSON.parse(event['Message'])
    const aggregators = await dynamodb.getAggregatorsFor(topic)

    const updates = []
    for(const aggregator of aggregators) {
      const aggregationKey = message[aggregator.groupBy]
      const aggregationId = `${aggregator.topic}:${aggregationKey}`
      
      await dynamodb.initiateAggregation(aggregationId)

      const updateExpression = dynamodb.getUpdateExpression(aggregationId, topic, message)
      updates.push(updateExpression)
    }

    await dynamodb.executeUpdateTransaction(updates)
    return
  }

  // 2. Verify and re-publish
  if (fromDynamoDb && eventName === 'MODIFY') {
    event = event['dynamodb']

    const aggregation = ddt.unwrap(event['NewImage'])
    const topicArn = aggregation.id.split(':').slice(0, -1).join(':')
    const aggregator = await dynamodb.getAggregatorById(topicArn)
    const expectedEvents = aggregator.events.map(s => s.split(':').pop())
    const collectedEvents = Object.keys(aggregation.events)
    const hasAllEvents = expectedEvents.every(e => collectedEvents.includes(e))

    if (hasAllEvents) {
      await dynamodb.removeAggregation(aggregation.id)
      await sns.publishAggregation(topicArn, aggregation.events)
    }

    return
  }

  // Management
  if (fromDynamoDb && fromAggregatorsTable.test(eventSourceARN)) {
    event = event['dynamodb']

    const aggregator = ddt.unwrap(event['Keys']).topic
    const newSubs = ddt.unwrap(event['NewImage'] || {}).events || []
    const oldSubs = ddt.unwrap(event['OldImage'] || {}).events || []

    const newTopics = newSubs.filter(s => !oldSubs.includes(s))
    await sns.subscribeTo(newTopics, lambdaArn, aggregator)

    const unusedTopics = oldSubs.filter(s => !newSubs.includes(s))
    await sns.unsubscribeFrom(unusedTopics, aggregator)

    return
  }
}
