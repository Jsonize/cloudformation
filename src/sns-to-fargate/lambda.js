const AWS = require('aws-sdk');
const ECS = new AWS.ECS({apiVersion: '2014-11-13'});
const FS = require("fs");
const Util = require("util");

const tasks = JSON.parse(FS.readFileSync("tasks.json"));

function randomExponentialBackoff(f, cb, wait) {
    wait = wait || 1000;
    f(function (err, data) {
        console.log(err, data, wait);
        if (err) {
            setTimeout(function () {
                randomExponentialBackoff(f, cb, Math.round(wait * (1.0 + Math.random())));
            }, wait);
        } else
            cb(err, data);
    })
}

exports.handler = function (event, context, callback) {
    const message = event.Records[0].Sns.Message;
    console.log(message);
    const splt = message.split(":");
    const taskNameBase = splt.shift().split(".");
    const taskName = taskNameBase[0];
    const taskPostfix = taskNameBase.length > 1 ? (":" + taskNameBase[1]) : "";
    const task = tasks[taskName];
    var commandLine = task.commandLine;
    splt.forEach(function (s, i) {
        //commandLine = commandLine.replace("${" + i + "}", s);
        commandLine = commandLine.map(function (t) {
            return t.replace("${" + i + "}", s);
        });
    });
    var params = {
        cluster: process.env["CLUSTER"],
        taskDefinition: task.taskDefinition + taskPostfix,
        overrides: {
            containerOverrides: [{
                command: commandLine,
                name: task.containerName
            }]
        },
        launchType: 'FARGATE',
        platformVersion: 'LATEST',
        networkConfiguration: {
            awsvpcConfiguration: {
                assignPublicIp: "ENABLED",
                securityGroups: [process.env["SECURITYGROUP"]],
                subnets: process.env["SUBNETS"].split(",")
            }
        }
    };
    console.log(Util.inspect(params, false, null, true /* enable colors */));
    randomExponentialBackoff(function (cb) {
        ECS.runTask(params, cb);
    }, callback);
};
