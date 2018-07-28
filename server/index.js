const PORT = 8080

const express = require('express')
const path = require('path')
const dynamodb = require('../lib/dynamodb')

const app = express()
app.set('view engine', 'pug')
app.set('views', path.join(__dirname, '/views'))

app.get('/aggregators', async (req, res) => {
  const aggregators = await dynamodb.listAggregators()

  res.render('aggregators', {
    aggregators
  })
})

app.listen(PORT, () => {
  console.log('events-aggregator ui listening on port', PORT)
})