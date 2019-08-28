#!/bin/sh
cd src/ecs-task-concurrency-limit ; cat main.yaml | ufpp > ../../dist/ecs-task-concurrency-limit.yaml ; cd ../..