const crypto = require('crypto');

// Constant-time string comparison to avoid leaking length/prefix via timing.
function safeEqual(a, b) {
    const ab = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ab.length !== bb.length) {
        // Still run a comparison to keep timing roughly constant.
        crypto.timingSafeEqual(ab, ab);
        return false;
    }
    return crypto.timingSafeEqual(ab, bb);
}

exports.handler = function (event, context, callback) {
    const headers = event.headers || {};
    // API Gateway does not normalise header casing across clients (HTTP/2
    // lower-cases header names), so accept either form.
    const authorizationHeader = headers.Authorization || headers.authorization;

    if (!authorizationHeader) {
        return callback('Unauthorized');
    }

    const parts = authorizationHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Basic') {
        return callback('Unauthorized');
    }

    let plainCreds;
    try {
        plainCreds = Buffer.from(parts[1], 'base64').toString('utf8').split(':');
    } catch (e) {
        return callback('Unauthorized');
    }

    const username = plainCreds[0];
    const password = plainCreds.slice(1).join(':'); // passwords may contain ':'

    const userOk = safeEqual(username, process.env.BASIC_AUTH_USER);
    const passOk = safeEqual(password, process.env.BASIC_AUTH_PASSWORD);
    if (!(userOk && passOk)) {
        return callback('Unauthorized');
    }

    const tmp = event.methodArn.split(':');
    const apiGatewayArnTmp = tmp[5].split('/');
    const awsAccountId = tmp[4];
    const awsRegion = tmp[3];
    const restApiId = apiGatewayArnTmp[0];
    const stage = apiGatewayArnTmp[1];
    const apiArn = 'arn:aws:execute-api:' + awsRegion + ':' + awsAccountId + ':' + restApiId + '/' + stage + '/*/*';

    callback(null, {
        principalId: 'user',
        policyDocument: {
            Version: '2012-10-17',
            Statement: [{
                Action: 'execute-api:Invoke',
                Effect: 'Allow',
                Resource: apiArn
            }]
        }
    });
};
