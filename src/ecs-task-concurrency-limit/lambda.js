var aws = require('aws-sdk');
var ecs = new aws.ECS({apiVersion: '2014-11-13'});

const substringAfter = function (source, after) {
    return source.substring(source.indexOf(after) + after.length);
};

const lookup = function (arr, key) {
    for (var i = 0; i < arr.length; ++i)
        if (arr[i].key === key)
            return arr[i].value;
    return undefined;
};

exports.handler = (event, context, callback) => {
    var cluster = substringAfter(event.detail.clusterArn, "/");
    var family = substringAfter(event.detail.group, ":");
    var task = substringAfter(event.detail.taskArn, "/");
    var taskDefinition = substringAfter(event.detail.taskDefinitionArn, "/");
    var startedBy = event.detail.startedBy;
    console.log("Cluster", cluster, "Family", family, "Task", task, "TaskDefinition", taskDefinition, "StartedBy", startedBy);
    ecs.listTagsForResource({
        resourceArn: event.detail.taskDefinitionArn
    }, function(err, data) {
        if (err) {
            console.log(err);
            return;
        }
        var taskCountMax = lookup(data.tags, "task-count-max");
        if (!taskCountMax)
            return;
        taskCountMax = parseInt(taskCountMax, 10);
        var taskCountMaxByStartedBy = lookup(data.tags, "task-count-max-by-started-by") === "true";
        var listTasksQuery = {
            cluster: cluster,
            family: family
        };
        if (taskCountMaxByStartedBy)
            listTasksQuery.startedBy = startedBy;
        ecs.listTasks(listTasksQuery, function (err, data) {
            if (err) {
                console.log(err);
                return;
            }
            var runningWithoutCurrent = data.taskArns.filter(function (arn) {
                return arn !== event.detail.taskArn;
            }).length;
            console.log("RunningWithoutCurrent=", runningWithoutCurrent, "TaskCountMax=", taskCountMax);
            if (runningWithoutCurrent >= taskCountMax) {
                console.log("Terminating Task ", event.detail.taskArn);
                ecs.stopTask({
                    task: task,
                    cluster: cluster
                }, function(err, data) {
                    console.log(err, data);
                });
            }
        });
    });
};