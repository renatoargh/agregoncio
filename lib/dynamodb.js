const AWS = require('aws-sdk')
const dynamodb = new AWS.DynamoDB()
const assert = require('assert')
const ddt = require('dynamodb-data-types').AttributeValue
const { AGGREGATORS_TABLE, RESULTS_TABLE } = process.env

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
  removeAggregation(aggregationId) {
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
