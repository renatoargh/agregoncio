# agregoncio
Super simple server-less didactic events aggregator using AWS Sns, Lambda and DynamoDb

### How it Works
1. Lambda is deployed in a way that it is configured as update trigger for `events` table.
2. User subscribes Lambda function manually to SNS topic (via UI).
3. Message is published to SNS topic, which triggers the lambda function.
4. Lambda function loads all aggregators that require a an event published to that specific topic.
5. Lambda function updates all related aggregations (on `events` table). All updates are executed within a transaction, this makes sure that if one update fail all of them will fail, and the lambda function returns non-zero, forcing a retry. **NOTICE: There is a limit of 10 aggregators.** This limit is imposed by AWS, related to the maximum limit of writes that a transaction can support.
6. Updates on the previous step triggers lambda function again.
7. Lambda function loads aggregator definition (`aggregators` table).
8. By comparing the definition against all the events that are present, the lambda function determines if this aggregation is done (has all required events).
9. If the aggregation is not done yet, the lambda function returns without performing any further action.
10. If the aggregation is done then the lambda function tries to delete the record from the events table.
12. If previous step fails, the lambda function will return non-zero and because it is configured as a trigger for the `events` table it will be eventually retried. If this execution is a retry and the record no longer exist, then it won't fail with 404 (we ignore this errors).
13. The lambda function will try to publish a message with the full aggregation received from the update trigger.
14. If the publish fails, the lambda function will return non-zero and will be evetually retried.
15. If the execution is a retry the step 12 won't fail (as already explained), and step 13 will be executed again, until it eventually succeeds.