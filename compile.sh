#!/bin/sh
for identifier in ecs-task-concurrency-limit ecs-fargate-task ecs-fargate-schedule apigateway-websocket-callback apigateway-websocket-proxy apigateway-websocket-proxy-mock-connect apigateway-lambda-proxy apigateway-lambda-proxy-basic-auth; do
  cd src/$identifier ; cat main.yaml | ufpp > ../../dist/$identifier.yaml ; cd ../..
done