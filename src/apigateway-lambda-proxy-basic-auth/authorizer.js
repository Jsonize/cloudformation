exports.handler = function (event, context, callback) {
    var authorizationHeader = event.headers.Authorization;

    if (!authorizationHeader)
        return callback('Unauthorized');

    var encodedCreds = authorizationHeader.split(' ')[1];
    var plainCreds = (new Buffer(encodedCreds, 'base64')).toString().split(':');
    var username = plainCreds[0];
    var password = plainCreds[1];

    if (!(username === process.env.BASIC_AUTH_USER && password === process.env.BASIC_AUTH_PASSWORD))
        return callback('Unauthorized');

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
    });
};
