#!/bin/sh
cd src/ecs-task-concurrency-limit ; cat main.yaml | ufpp > ../../dist/ecs-task-concurrency-limit.yaml ; cd ../..
cd src/ecs-fargate-task ; cat main.yaml | ufpp > ../../dist/ecs-fargate-task.yaml ; cd ../..
cd src/ecs-fargate-schedule ; cat main.yaml | ufpp > ../../dist/ecs-fargate-schedule.yaml ; cd ../..