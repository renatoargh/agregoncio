const dynamodb = require('./dynamodb')

async function main() {
  await dynamodb.createAggregator({
    name: 'ComplexOrderRequirements',
    groupBy: 'orderId',
    events: [
      'arn:aws:sns:eu-central-1:423715701352:CreditReservation',
      'arn:aws:sns:eu-central-1:423715701352:InventoryReservation'
    ]
  }, 'arn:aws:lambda:eu-central-1:423715701352:function:events-aggregator')

  console.log('OK')
}

main()