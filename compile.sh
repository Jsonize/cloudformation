#!/bin/sh
for identifier in ecs-task-concurrency-limit ecs-task-timeout ecs-fargate-task ecs-fargate-schedule apigateway-websocket-callback apigateway-websocket-proxy apigateway-websocket-proxy-mock-connect apigateway-lambda-proxy apigateway-lambda-proxy-basic-auth dynamo-daemon-monitoring scheduled-lambda cloudwatch-alarms-to-teams apigateway-lambda-proxy-alarms sns-to-lambda cloudfront-s3-viewer-lambda-edge sns-to-fargate; do
  cd src/$identifier ; cat main.yaml | ufpp > ../../dist/$identifier.yaml ; cd ../..
done