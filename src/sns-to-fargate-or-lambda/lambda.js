const AWS = require('aws-sdk');
const ECS = new AWS.ECS({apiVersion: '2014-11-13'});
const Lambda = new AWS.Lambda({apiVersion: '2015-03-31'});
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

function runOnFargate(commandLine, args, taskVersion, taskDefinition, containerName, callback) {
    args.forEach(function (s, i) {
        //commandLine = commandLine.replace("${" + i + "}", s);
        commandLine = commandLine.map(function (t) {
            return t.replace("${" + i + "}", s);
        });
    });
    commandLine = commandLine.map(function (t) {
        return t.replace("${version}", taskVersion);
    });
    const params = {
        cluster: process.env["CLUSTER"],
        taskDefinition: taskDefinition,
        overrides: {
            containerOverrides: [{
                command: commandLine,
                name: containerName
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
}

function runOnLambda(paramMap, args, lambdaFunction, callback) {
    args.forEach(function (s, i) {
        for (let key in paramMap)
            paramMap[key] = paramMap[key].replace("${" + i + "}", s);
    });
    const params = {
        FunctionName: lambdaFunction,
        InvocationType: "Event",
        Payload: JSON.stringify(paramMap)
    };
    console.log(Util.inspect(params, false, null, true /* enable colors */));
    randomExponentialBackoff(function (cb) {
        Lambda.invoke(params, cb)
    }, callback);
}

exports.handler = function (event, context, callback) {
    const message = event.Records[0].Sns.Message;
    console.log(message);
    const splt = message.split(":");
    const taskNameBase = splt.shift().split(".");
    let taskName = taskNameBase[0];
    let estimation = undefined;
    if (taskName.indexOf("(") > 0) {
        const tmp = taskName.split("(")
        taskName = tmp.shift();
        estimation = parseInt((tmp.split(")"))[0], 10);
    }
    const task = tasks[taskName];
    let useFargate = !!task.taskDefinition;
    if (useFargate && task.lambdaFunction && task.fargateThreshold && estimation < task.fargateThreshold)
        useFargate = false;
    if (useFargate) {
        const taskPostfix = taskNameBase.length > 1 ? (":" + taskNameBase[1]) : "";
        runOnFargate(task.commandLine, splt, taskNameBase[1] || "latest", task.taskDefinition + taskPostfix, task.containerName, callback);
    } else {
        runOnLambda(task.paramMap, splt, task.lambdaFunction, callback);
    }
};
