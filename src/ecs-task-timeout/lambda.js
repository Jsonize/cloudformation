const aws = require('aws-sdk');
const ecs = new aws.ECS({apiVersion: '2014-11-13'});
const cloudwatchlogs = new aws.CloudWatchLogs({apiVersion: '2014-03-28'});

const lookup = function (arr, key) {
    for (var i = 0; i < arr.length; ++i)
        if (arr[i].key === key)
            return arr[i].value;
    return undefined;
};

exports.handler = (event, context, callback) => {
    const cluster = process.env.CLUSTER_NAME;
    console.log(cluster);
    ecs.listTasks({
        cluster: cluster
    }, function (err, listTasksData) {
        if (err) {
            console.log(err);
            return;
        }
        ecs.describeTasks({
            cluster: cluster,
            tasks: listTasksData.taskArns
        }, function (err, describeTasksData) {
            if (err) {
                console.log(err);
                return;
            }
            describeTasksData.tasks.forEach(function (task) {
                ecs.listTagsForResource({
                    resourceArn: task.taskDefinitionArn
                }, function(err, taskTagData) {
                    if (err)
                        return;
                    const startTime = (new Date(task.createdAt)).getTime();
                    const currentTime = (new Date()).getTime();
                    const deltaTime = currentTime - startTime;
                    var taskTimeout = lookup(taskTagData.tags, "task-timeout");
                    if (taskTimeout) {
                        taskTimeout = parseInt(taskTimeout, 10);
                        if (deltaTime > taskTimeout) {
                            console.log("Terminating Task", task.taskArn, "Definition", task.taskDefinitionArn, "Timeout", taskTimeout, "StartTime", startTime, "CurrentTime", currentTime, "DeltaTime", deltaTime);
                            ecs.stopTask({
                                task: task.taskArn,
                                cluster: cluster
                            }, function(err, data) {
                                if (err)
                                    console.log(err);
                            });
                        }
                    }
                    var taskLogTimeout = lookup(taskTagData.tags, "task-log-timeout");
                    if (taskLogTimeout) {
                        taskLogTimeout = parseInt(taskLogTimeout, 10);
                        if (deltaTime > taskLogTimeout) {
                            ecs.describeTaskDefinition({
                                taskDefinition: task.taskDefinitionArn
                            }, function (err, describeTaskDef) {
                                if (err)
                                    return;
                                const logGroup = describeTaskDef.taskDefinition.containerDefinitions[0].logConfiguration.options['awslogs-group'];
                                const logStreamId = task.taskArn.split("/").pop();
                                cloudwatchlogs.getLogEvents({
                                    logGroupName: logGroup,
                                    logStreamName: logGroup.substring(1) + "/" + logStreamId,
                                    limit: 1
                                }, function(err, data) {
                                    if (err || data.events.length > 0)
                                        return;
                                    console.log("Terminating Task", task.taskArn, "Definition", task.taskDefinitionArn, "LogTimeout", taskLogTimeout, "StartTime", startTime, "CurrentTime", currentTime, "DeltaTime", deltaTime);
                                    ecs.stopTask({
                                        task: task.taskArn,
                                        cluster: cluster
                                    }, function(err, data) {
                                        if (err)
                                            console.log(err);
                                    });
                                });
                            });
                        }
                    }
                });
            });
        });
    });
};
