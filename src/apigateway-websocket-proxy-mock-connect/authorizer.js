const Url = require('url');
const Https = require('https');
const Http = require('http');
const Querystring = require('querystring');
const request = function (method, uri, data, callback) {
    var parsed = Url.parse(uri);
    data = JSON.stringify(data);
    var req = (parsed.protocol.indexOf("https") === 0 ? Https : Http).request({
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.path,
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    }, function (response) {
        var respData = "";
        response.on('data', function (data) {
            respData += data;
        });
        response.on("end", function () {
            callback(response, JSON.parse(respData.trim()));
        });
    });
    req.on("error", function () {
        callback({statusCode: 500}, {});
    });
    req.write(data);
    req.end();
};
exports.handler = function(event, context, callback) {
    request("POST", process.env.AUTHORIZE_URI + "?" + Querystring.stringify(event.queryStringParameters),{
        connectionId: event.requestContext.connectionId
    }, function (response, responseData) {
        if (response.statusCode === 200) {
            callback(null, {
                principalId: 'user',
                policyDocument: {
                    Version: '2012-10-17',
                    Statement: [{
                        Action: 'execute-api:Invoke',
                        Effect: "Allow",
                        Resource: event.methodArn
                    }]
                }
            })
        } else
            callback("Unauthorized");
    });
};