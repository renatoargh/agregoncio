const AWS = require('aws-sdk')
const dynamodb = new AWS.DynamoDB()
const assert = require('assert')
const ddt = require('dynamodb-data-types').AttributeValue
const { AGGREGATORS_TABLE, SUBSCRIPTIONS_TABLE, RESULTS_TABLE } = process.env

async function initiateAggregation (aggregationId) {
  assert(aggregationId)

  return new Promise((resolve, reject) => {
    dynamodb.updateItem({
      'ExpressionAttributeValues': {
        ':events': { M: {} }
      },
      'Key': ddt.wrap({ id: aggregationId }),
      'TableName': RESULTS_TABLE,
      'UpdateExpression': 'SET events = if_not_exists(events, :events)'
    }, function(err, data) {
      if (err) {
        return reject(err)
      }

      resolve()
    })
  })
}

module.exports = {
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
      }, (err, data) => {
        if (err) {
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

  async updateAggregation(aggregationId, topic, message) {
    await initiateAggregation(aggregationId)

    return new Promise((resolve, reject) => {
      dynamodb.updateItem({
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
      }, function(err, data) {
        if (err) {
          return reject(err)
        }

        resolve()
      })
    })
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

  getAggregatorsFor(topic) {
    return new Promise((resolve, reject) => {
      dynamodb.scan({
        'FilterExpression': 'contains(subscriptions, :t)',
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
