const AWS = require('aws-sdk')
const sns = new AWS.SNS()
const dynamodb = require('./dynamodb')
const Promise = require('bluebird')

module.exports = {
  unsubscribeFrom (topics, aggregator) {
    if (!Array.isArray(topics)) {
      topics = [topics]
    }

    return Promise
      .resolve(topics)
      .mapSeries(async topicArn => {
        return new Promise(async (resolve, reject) => {
          try {
            const subscriptionArn = await dynamodb.removeSubscription(topicArn, aggregator)

            sns.unsubscribe({
              'SubscriptionArn': subscriptionArn
            }, err => {
              if (err) {
                return reject(err)
              }

              resolve()
            })
          } catch (err) {
            if (err.code === 'ConditionalCheckFailedException') {
              return resolve()
            }

            reject(err)
          }
        })
      })
  },

  subcribeTo (topics, lambdaArn, aggregator) {
    if (!Array.isArray(topics)) {
      topics = [topics]
    }

    return Promise
      .resolve(topics)
      .mapSeries(topicArn => {
        return new Promise((resolve, reject) => {
          sns.subscribe({
            'Protocol': 'lambda',
            'TopicArn': topicArn,
            'Endpoint': lambdaArn,
            'ReturnSubscriptionArn': true
          }, async (err, data) => {
            if (err) {
              return reject(err)
            }

            const subscriptionArn = data['SubscriptionArn']
            await dynamodb.updateSubscription(topicArn, subscriptionArn, aggregator)

            resolve()
          })
        })
      })
  },

  publishAggregation (topic, events) {
    return new Promise((resolve, reject) => {
      sns.publish({
        'TopicArn': topic,
        'Message': JSON.stringify(events)
      }, (err, results) => {
        if (err) {
          return reject(err)
        }

        resolve(results)
      })
    })
  }
}