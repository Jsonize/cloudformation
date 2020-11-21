var aws = require('aws-sdk');
var ecs = new aws.ECS({apiVersion: '2014-11-13'});

const lookup = function (arr, key) {
    for (var i = 0; i < arr.length; ++i)
        if (arr[i].key === key)
            return arr[i].value;
    return undefined;
};

exports.handler = (event, context, callback) => {
    var cluster = process.env.CLUSTER_NAME;
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
                    var taskTimeout = lookup(taskTagData.tags, "task-timeout");
                    if (!taskTimeout)
                        return;
                    taskTimeout = parseInt(taskTimeout, 10)
                    var startTime = (new Date(task.createdAt)).getTime();
                    var currentTime = (new Date()).getTime();
                    var deltaTime = currentTime - startTime;
                    console.log("Task", task.taskArn, "Definition", task.taskDefinitionArn, "Timeout", taskTimeout, "StartTime", startTime, "CurrentTime", currentTime, "DeltaTime", deltaTime);
                    if (deltaTime > taskTimeout) {
                        console.log("Terminating Task ", task.taskArn);
                        ecs.stopTask({
                            task: task.taskArn,
                            cluster: cluster
                        }, function(err, data) {
                            console.log(err, data);
                        });
                    }
                });
            });
        });
    });
};
