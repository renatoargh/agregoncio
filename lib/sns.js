const assert = require('assert')
const AWS = require('aws-sdk')
const sns = new AWS.SNS()
const dynamodb = require('./dynamodb')

module.exports = {
  async publish (topicArn, message) {
    assert(topicArn, 'topicArn is required')
    assert(message, 'message is required')

    const data  = await sns.publish({
      'TopicArn': topicArn,
      'Message': JSON.stringify(message)
    }).promise()

    return data['MessageId']
  },

  async listAllTopics () {
    const allTopics = []
    let nextToken = null

    do {
      const data = await sns.listTopics({
        'NextToken': nextToken
      }).promise()

      allTopics.push(...data['Topics'])
      nextToken = data['NextToken']
    } while(nextToken)

    return allTopics.map(t => t['TopicArn']).sort()
  },

  async createTopic (name) {
    const data = await sns.createTopic({
      'Name': name
    }).promise()

    return data['TopicArn']
  },

  async unsubscribeFrom (topics, aggregator) {
    if (!Array.isArray(topics)) {
      topics = [topics]
    }

    for(const topicArn of topics) {
      await new Promise(async (resolve, reject) => {
        try {
          const subscriptionArn = await dynamodb.removeSubscription(topicArn, aggregator)

          if (!subscriptionArn) {
            return resolve()
          }

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
    }
  },

  async subscribeTo (topics, lambdaArn, aggregator) {
    if (!Array.isArray(topics)) {
      topics = [topics]
    }

    for(const topicArn of topics) {
      await new Promise((resolve, reject) => {
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
    }
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
