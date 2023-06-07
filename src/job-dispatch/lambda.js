const AWS = require('aws-sdk');
const ECS = new AWS.ECS({apiVersion: '2014-11-13'});
const Lambda = new AWS.Lambda({apiVersion: '2015-03-31'});
const FS = require("fs");
const Util = require("util");

const jobTypes = {};

function extJobTypes(e) {
    for (let k in e)
        jobTypes[k] = e[k];
}

try {
    extJobTypes(JSON.parse(process.env.JOB_TYPES));
} catch (e) {}

try {
    extJobTypes(JSON.parse(FS.readFileSync("job-types.json")));
} catch (e) {}

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

function runOnFargate(taskDefinition, containerName, commandLine, data, cb, wait) {
    for (let key in data) {
        commandLine = commandLine.map(function (t) {
            return t.replace("${" + key + "}", data[key]).replace("#[" + key + "]", data[key]);
        });
    }
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
    }, cb, wait);
}

function runOnLambda(lambdaFunction, data, cb, wait) {
    const params = {
        FunctionName: lambdaFunction,
        InvocationType: "Event",
        Payload: JSON.stringify(data)
    };
    console.log(Util.inspect(params, false, null, true /* enable colors */));
    randomExponentialBackoff(function (cb) {
        Lambda.invoke(params, cb)
    }, cb, wait);
}

exports.handler = function (event, context, callback) {
    const message = event.Records[0].Sns.Message;
    const record = JSON.parse(message);
    console.log("Request", record);
    /*
        type: string (mandatory)
        id: string (optional)
        data: object (optional)
        estimations: object (optional)
        handler: string (optional)
     */
    const jobType = jobTypes[record.type];
    if (!jobType) {
        console.log("Job Type", record.type, "not found");
        return;
    }
    
    let handlers = [];
    /*if (record.handler && jobType.handlers[record.handler]) {
        handlers = [jobType.handlers[record.handler]];
    } else {*/
        for (let key in jobType.handlers)
            handlers.push(jobType.handlers[key]);
    //}
    if (record.estimations) {
        handlers = handlers.filter(handler => {
            let keep = true;
            if (record.handler && record.handler != handler.type)
                keep = false;
            else if (handler.estimations) {
                for (let e in handler.estimations)
                    if (e in record.estimations)
                        if (record.estimations[e] > handler.estimations[e])
                            keep = false;
            }
            return keep;
        });
    }
    handlers.sort((x, y) => (y.priority || 0) - (x.priority || 0));
    console.log("Handlers", handlers);
    if (handlers.length === 0) {
        return;
    }
    let handler = handlers[0];
    /*
        type: string (mandatory)
        target: string (mandatory)
        priority: int (optional)
        estimations: object (optional)
     */
    switch (handler.type) {
        case "lambda":
            runOnLambda(handler.target, record, callback);
            return;
        case "fargate":
            runOnFargate(handler.target.taskDefinition, handler.target.containerName, handler.target.commandLine, record, callback);
            return;
        default:
            console.log("Unknown type", handler.type);
            return;
    }
};
