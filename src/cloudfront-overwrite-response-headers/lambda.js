exports.handler = (event, context, callback) => {
    const request = event.Records[0].cf.request;
    const response = event.Records[0].cf.response;
    const headers = response.headers;

    const rbh = JSON.parse('${RouteBasedHeaders}');

    // Example: [{"match":{"uri":".*mp4$"},"headers":{"Content-Type":"video/mp4"}},{"match":{"uri":".*aac$"},"headers":{"Content-Type":"audio/aac"}},{"match":{"uri":".*jpg$"},"headers":{"Content-Type":"image/jpeg"}},{"match":{"querystring":".*download=true.*","uri":".*mp4$"},"headers":{"Content-Disposition":"attachment;filename=\\"video.mp4\\""}},{"match":{"querystring":".*download=true.*","uri":".*aac$"},"headers":{"Content-Disposition":"attachment;filename=\\"audio.aac\\""}},{"match":{"querystring":".*download=true.*","uri":".*jpg$"},"headers":{"Content-Disposition":"attachment;filename=\\"poster.jpg\\""}}]
    rbh.forEach(item => {
        let isMatch = true;
        for (let headerKey in item.match) {
            const headerValue = item.match[headerKey];
            const regExp = new RegExp(headerValue);
            const testValue = request[headerKey];
            isMatch = isMatch && regExp.test(testValue);
        }
        if (isMatch) {
            for (let headerKey in item.headers) {
                const headerValue = item.headers[headerKey];
                headers[headerKey.toLowerCase()] = [{key: headerKey, value: headerValue}];
            }
        }
    });

    callback(null, response);
};