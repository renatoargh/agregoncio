const assert = require('assert')
const ddt = require('dynamodb-data-types').AttributeValue

const AWS = require('aws-sdk')
const dynamodb = new AWS.DynamoDB({
  accessKeyId: 'AKIAJNEPNFTCYXPNJNVA',
  secretAccessKey: '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',
  region: 'eu-central-1'
})

const AGGREGATORS_TABLE = 'events-agregations'
const RESULTS_TABLE = 'events'

async function initiateAggregation (aggregationId) {
  assert(aggregationId)
  
  console.time('dynamodb:initiateAggregation')
  return new Promise((resolve, reject) => {
    dynamodb.updateItem({
      'ExpressionAttributeValues': {
        ':events': { M: {} }
      },
      'Key': ddt.wrap({ aggregationId }), 
      'TableName': RESULTS_TABLE, 
      'UpdateExpression': 'SET events = if_not_exists(events, :events)'
    }, function(err, data) {
      console.timeEnd('dynamodb:initiateAggregation')

      if (err) {
        return reject(err)
      }
     
      resolve()
    })
  })
}

module.exports = {
  async updateAggregation(aggregationId, topic, message) {
    await initiateAggregation(aggregationId)

    console.time('dynamodb:updateAggregation')
    return new Promise((resolve, reject) => {
      dynamodb.updateItem({
        'ExpressionAttributeNames': {
          '#topic': topic
        },
        'ExpressionAttributeValues': {
          ':message': {
             M: ddt.wrap(message)
           }
        }, 
        'Key': ddt.wrap({ aggregationId }), 
        'ReturnValues': 'ALL_NEW', 
        'TableName': RESULTS_TABLE, 
        'UpdateExpression': 'SET events.#topic = :message'
      }, function(err, data) {
        console.timeEnd('dynamodb:updateAggregation')

        if (err) {
          return reject(err)
        }
       
        const aggregation = data['Attributes']
        resolve(ddt.unwrap(aggregation))
      })
    })
  },

  getAggregatorsFor(topic) {
    return new Promise((resolve, reject) => {
      console.time('dynamodb:getAggregatorsFor')

      dynamodb.scan({
        'FilterExpression': 'contains(events, :e)', 
        'ExpressionAttributeValues': ddt.wrap({ ':e': topic }),
        'TableName': AGGREGATORS_TABLE
       }, (err, data) => {
          console.timeEnd('dynamodb:getAggregatorsFor')

          if (err) {
            return reject(err)
          }

          const items = data['Items'] || []
          resolve(items.map(ddt.unwrap))
       })
    })
  }
}
