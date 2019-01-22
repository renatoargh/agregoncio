const express = require('express')
const bodyParser = require('body-parser')
const methodOverride = require('method-override')
const path = require('path')
const dynamodb = require('../lib/dynamodb')
const sns = require('../lib/sns')
const { LAMBDA_ARN, PORT } = process.env
const STATIC_PATH = path.join(__dirname, '/static')

const app = express()
app.set('view engine', 'pug')
app.set('views', path.join(__dirname, '/views'))

app.use(express.static(STATIC_PATH))
app.use(methodOverride('_method'))
app.use(bodyParser.json({ extend: true }))

app.use(async (req, res, next) => {
  res.locals.path = req.path
  await next()
})

const safe = (middleware) => (req, res, next) => Promise.resolve(middleware(req, res, next)).catch(next)

async function createAggregator (aggregator) {
  const topicArn = await sns.createTopic(aggregator.name)

  Object.assign(aggregator, { topicArn })
  await dynamodb.createAggregator(aggregator, LAMBDA_ARN)
  await sns.subscribeTo(aggregator.events, LAMBDA_ARN, topicArn)
}

app.post('/events', safe(async (req, res) => {
  const { topicArn, message } = req.body
  await sns.publish(topicArn, message)

  res.status(204).json({})
}))

app.post('/aggregators', safe(async (req, res) => {
  await createAggregator(req.body)
  res.status(204).json({})
}))

app.get('/aggregators', safe(async (req, res) => {
  const aggregators = await dynamodb.listAggregators()
  res.render('aggregators', { aggregators })
}))

app.get('/subscriptions', safe(async (req, res) => {
  const subscriptions = await dynamodb.listSubscriptions()
  res.render('subscriptions', { subscriptions })
}))

app.get('/', safe((req, res) => {
  res.redirect('/aggregators')
}))

app.listen(PORT, () => {
  console.log('events-aggregator ui listening on port', PORT)
})

// async function main() {
//   await createAggregator({
//     name: '...',
//     groupBy: 'orderId',
//     events: [
//       'arn:aws:sns:eu-central-1:423715701352:OrderRequirementsFulfilled'
//     ]
//   }, LAMBDA_ARN)
// }

// main()