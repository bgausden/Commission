import { limiter } from "./rate-limiter.js"
import debug from "debug"
import { API_TOKEN as API_KEY, SITE_ID, USER_NAME, USER_PASSWORD, BASE_URL } from "./mb-constants.js"
import {Headers}  from "node-fetch"
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import {requestOptions} from "request-rate-limiter"

//import {RequestConfig} from "request-rate-limiter"

export async function getUserToken(): Promise<string> {
    let token = ""
    const userTokenDebug = debug("userToken")
    userTokenDebug("Retrieving MB user token")

/*  
    Only when using fetch
    const myHeaders = new Headers()
    myHeaders.append("Content-Type", "application/json")
    myHeaders.append("Api-Key", API_KEY)
    myHeaders.append("SiteId", SITE_ID) */

    const myHeaders = {
        "Content-Type": "application/json",
        "Api-Key": API_KEY,
        "SiteID": SITE_ID
    }

    const body = JSON.stringify({
        UserName: USER_NAME,
        Password: USER_PASSWORD
    })

    // If setting Content-Type to www-url-encoded
    const urlEncodedBody = new URLSearchParams()
    urlEncodedBody.append("Username", USER_NAME)
    urlEncodedBody.append("Password", USER_PASSWORD)

    const requestOptions: requestOptions = {
        uri: `${BASE_URL}/usertoken/issue`,
        method: "POST",
        headers: myHeaders,
        body: body,
    }

    try {
        const response = await limiter.request(requestOptions)
        if (response.statusCode !== 200) { throw new Error(JSON.stringify(JSON.parse(response.body).Error))}
        const json = await response.json()
        token = json.AccessToken
        userTokenDebug("Have MB user token.")
    } catch (error) {
        userTokenDebug("Failed to retrieve MB user token %o", error)
        throw new Error(error)
    }
    return token
}
