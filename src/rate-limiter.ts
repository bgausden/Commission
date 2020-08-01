/* eslint-disable @typescript-eslint/triple-slash-reference */
/* Class RequestRateLimiter is the default export from the request-rate-limiter module
but we cannot do 'import * as' because we end up importing the exports object instead
of the desired class implementation. Instead we import the named export. 
*/
/* /// <reference path="src\@types\request-rate-limiter\index.d.ts"> */
import { RequestRateLimiter, RequestRequestHandler } from "request-rate-limiter"
import debug from "debug"
import { requestRateDebug } from "./debug"


const TOO_MANY_REQUESTS = 429

function initLimiter(backoffTime = 10, requestRate = 1000, interval = 60, timeout = 600): RequestRateLimiter {
    requestRateDebug(`Rate limiting to ${requestRate} API calls per ${interval} seconds. %s`)
    return new RequestRateLimiter({
        backoffTime: backoffTime,
        requestRate: requestRate,
        interval: interval,
        timeout: timeout,
    })
}

export const limiter = initLimiter() //global limiter
limiter.setRequestHandler(
    new RequestRequestHandler({
        backoffHTTPCode: TOO_MANY_REQUESTS,
    })
)
