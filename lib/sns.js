const AWS = require('aws-sdk')
const sns = new AWS.SNS()
const assert = require('assert')

module.exports = {
  publishAggregation (topic, events) {
    return new Promise((resolve, reject) => {
      sns.publish({
        TopicArn: topic,
        Message: JSON.stringify(events)
      }, (err, results) => {
        if (err) {
          return reject(err)
        }

        resolve(results)
      })
    })
  }
}