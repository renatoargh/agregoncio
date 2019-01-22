const AWS = require('aws-sdk')
const dynamodb = new AWS.DynamoDB()
const assert = require('assert')
const ddt = require('dynamodb-data-types').AttributeValue
const { AGGREGATORS_TABLE, SUBSCRIPTIONS_TABLE, RESULTS_TABLE } = process.env

function removeAggregatorFromSubscriptions (topicArn, aggregator) {
  return new Promise((resolve, reject) => {
    dynamodb.updateItem({
      'ExpressionAttributeValues': {
        ':aggregator': ddt.wrap(aggregator)
      },
      'Key': ddt.wrap({ topicArn }),
      'TableName': SUBSCRIPTIONS_TABLE,
      'UpdateExpression': 'REMOVE aggregators :aggregator'
    }, function(err, data) {
      if (err) {
        return reject(err)
      }

      resolve()
    })
  })
}

module.exports = {
  async createAggregator (aggregator, lambdaArn) {
    assert(aggregator.topicArn, 'aggregator should contain an `topicArn` property')
    assert(aggregator.groupBy, 'aggregator should contain an `groupBy` property')
    assert(aggregator.events, 'aggregator should contain an `events` property')
    assert(aggregator.events.length, 'aggregator events must include at least one event')
    assert(lambdaArn, 'lambdaArn must be provided')

    await dynamodb.putItem({
      'Item': ddt.wrap({
        topic: aggregator.topicArn,
        events: aggregator.events,
        groupBy: aggregator.groupBy
      }),
      'TableName': AGGREGATORS_TABLE
    }).promise()
  },

  removeSubscription (topicArn, aggregator) {
    return new Promise((resolve, reject) => {
      dynamodb.deleteItem({
        'Key': ddt.wrap({ topicArn }),
        'ExpressionAttributeValues': ddt.wrap({
         ':one': 1,
         ':aggregator': aggregator
        }),
        'ConditionExpression': `
          size(aggregators) = :one AND
          contains(aggregators, :aggregator)
        `,
        'TableName': SUBSCRIPTIONS_TABLE,
        'ReturnValues': 'ALL_OLD'
      }, async (err, data) => {
        if (err) {
          if (err.code === 'ConditionalCheckFailedException') {
            await removeAggregatorFromSubscriptions(topicArn, aggregator)
            return resolve()
          }

          return reject(err)
        }

        const { subscriptionArn } = ddt.unwrap(data.Attributes)

        resolve(subscriptionArn)
      })
    })
  },

  updateSubscription (topicArn, subscriptionArn, aggregator) {
    return new Promise((resolve, reject) => {
      dynamodb.updateItem({
        ExpressionAttributeValues: ddt.wrap({
         ':subscriptionArn': subscriptionArn,
         ':aggregator': [aggregator]
        }),
        'Key': ddt.wrap({ topicArn }),
        'UpdateExpression': `
          SET subscriptionArn = :subscriptionArn
          ADD aggregators :aggregator
        `,
        'TableName': SUBSCRIPTIONS_TABLE
      }, (err, data) => {
        if (err) {
          return reject(err)
        }

        resolve()
      })
    })
  },

  removeAggregation (aggregationId) {
    return new Promise((resolve, reject) => {
      dynamodb.deleteItem({
        'Key': ddt.wrap({ id: aggregationId }),
        'TableName': RESULTS_TABLE
      }, (err, data) => {
        if (err) {
          return reject(err)
        }

        resolve()
      })
    })
  },

  async initiateAggregation (aggregationId) {
    assert(aggregationId)

    return dynamodb.updateItem({
      'ExpressionAttributeValues': {
        ':events': { M: {} }
      },
      'Key': ddt.wrap({ id: aggregationId }),
      'TableName': RESULTS_TABLE,
      'UpdateExpression': 'SET events = if_not_exists(events, :events)'
    }).promise()
  },

  async executeUpdateTransaction(updates) {
    return dynamodb.transactWriteItems({
      TransactItems: updates,
      // ClientRequestToken: 'calcular o hash da carga de dados'
    }).promise()
  },

  getUpdateExpression(aggregationId, topic, message) {
    return {
      Update: {
        'ExpressionAttributeNames': {
          '#topic': topic.split(':').pop()
        },
        'ExpressionAttributeValues': {
          ':message': {
             M: ddt.wrap(message)
           }
        },
        'Key': ddt.wrap({ id: aggregationId }),
        'TableName': RESULTS_TABLE,
        'UpdateExpression': 'SET events.#topic = :message'
      }
    }
  },

  getAggregatorById(aggregatorId) {
    return new Promise((resolve, reject) => {
      dynamodb.getItem({
        'Key': ddt.wrap({ topic: aggregatorId }),
        'TableName': AGGREGATORS_TABLE
      }, (err, aggregator) => {
        if (err) {
          return reject(err)
        }

        aggregator = aggregator['Item']
        resolve(ddt.unwrap(aggregator))
      })
    })
  },

  async listSubscriptions () {
    const data = await dynamodb.scan({
      'TableName': SUBSCRIPTIONS_TABLE
    }).promise()

    const items = data['Items'] || []
    return items.map(ddt.unwrap)
  },

  async listAggregators () {
    const data = await dynamodb.scan({
      'TableName': AGGREGATORS_TABLE
    }).promise()

    const items = data['Items'] || []
    return items.map(ddt.unwrap)
  },

  getAggregatorsFor(topic) {
    return new Promise((resolve, reject) => {
      dynamodb.scan({
        'FilterExpression': 'contains(events, :t)',
        'ExpressionAttributeValues': ddt.wrap({ ':t': topic }),
        'TableName': AGGREGATORS_TABLE
       }, (err, data) => {
          if (err) {
            return reject(err)
          }

          const items = data['Items'] || []
          resolve(items.map(ddt.unwrap))
       })
    })
  }
}
