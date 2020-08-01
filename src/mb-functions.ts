import { limiter } from "./rate-limiter.js"
import debug from "debug"
import { USER_NAME, USER_PASSWORD, MB_BASE_URL, MB_DEFAULT_HEADERS } from "./mb-constants.js"
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { requestOptions } from "request-rate-limiter"
import { Response } from "request"
import extend from "extend"
import { userTokenDebug, getServicesDebug } from "./debug.js"

//import {RequestConfig} from "request-rate-limiter"

export class AuthToken {
    private static token = ""

    public static async getAuthToken(): Promise<string> {
        if (AuthToken.token === "") {
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            AuthToken.token = await updateUserToken()
        }
        return AuthToken.token
    }
}

export async function updateUserToken(): Promise<string> {
    let token = ""
    userTokenDebug("Retrieving MB user token")

    /*  
    Only when using fetch
    const myHeaders = new Headers()
    myHeaders.append("Content-Type", "application/json")
    myHeaders.append("Api-Key", API_KEY)
    myHeaders.append("SiteId", SITE_ID) */

    const headers = MB_DEFAULT_HEADERS

    /* const body = JSON.stringify({
        UserName: USER_NAME,
        Password: USER_PASSWORD
    }) */

    const body = {
        UserName: USER_NAME,
        Password: USER_PASSWORD,
    }

    /* If setting Content-Type to x-www-form-urlencoded
    which also seems to be supported by the MB API  */
    /* const urlEncodedBody = new URLSearchParams()
    urlEncodedBody.append("Username", USER_NAME)
    urlEncodedBody.append("Password", USER_PASSWORD) */

    const requestOptions: requestOptions = {
        uri: `${MB_BASE_URL}/usertoken/issue`,
        method: "POST",
        headers: headers,
        body: body,
        json: true,
    }

    try {
        const response: Response = await limiter.request(requestOptions)
        if (response.statusCode !== 200) {
            throw new Error(JSON.stringify(response.body.Error))
        }
        token = response.body.AccessToken
        userTokenDebug("Have MB user token.")
    } catch (error) {
        userTokenDebug("Failed to retrieve MB user token %o", error)
        throw new Error(error)
    }
    return token
}

export async function getServices(): Promise<{}[]> {
    let services: {}[] = []
    let responseServices: {}[] = []
    const servicesMaxRequestSize = 100 // appears to be enforced by MB API
    let requestOffset = 0
    let servicesCount = 0
    getServicesDebug("Retrieving MB Services")

    const headers = extend(MB_DEFAULT_HEADERS, { Authorization: await AuthToken.getAuthToken() })

    do {
        const queryString = { offset: requestOffset.toString() }
        const requestOptions = {
            uri: `${MB_BASE_URL}/sale/services`,
            qs: queryString,
            headers: headers,
            json: true,
            useQueryString: true,
        }
        try {
            const response: Response = await limiter.request(requestOptions)
            if (response.statusCode !== 200) {
                throw new Error(JSON.stringify(response.body.Error))
            }
            responseServices = response.body.Services
            servicesCount = responseServices.length
            requestOffset += servicesCount
            services = services.concat(responseServices)
            getServicesDebug(`Retrieved ${servicesCount} MB services.`)
        } catch (error) {
            getServicesDebug("Failed to retrieve MB services %o", error)
            throw new Error(error)
        }
    } while (servicesCount % servicesMaxRequestSize === 0 && servicesCount !== 0)
    getServicesDebug(`Retrieved a total of ${services.length} MB services.`)
    return services
}

export async function getSales(startDate?: Date, endDate?: Date): Promise<{}[]> {
    /* Get all sales for requested date range. If no startDate is provided
    all sales from the previous calendar month will be returned */
    let sales: {}[] = []
    let responseSales: {}[] = []
    const salesMaxRequestSize = 200 // appears to be enforced by MB API
    let requestOffset = 0
    let salesCount = 0
    const getSalesDebug = debug("getSales")
    getSalesDebug("Retrieving MB Sales")

    if (!startDate) {
        const today = new Date()
        if (today.getMonth() === 1) {
            startDate = new Date(today.getFullYear() - 1, today.getMonth() - 1, 1)
        } else {
            startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1)
        }
        endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0)
    }

    const headers = extend(MB_DEFAULT_HEADERS, { Authorization: await AuthToken.getAuthToken() })

    do {
        /* const queryString = new URLSearchParams()
        queryString.append("offset", requestOffset.toString()) */
        const queryString = {
            limit: salesMaxRequestSize,
            offset: requestOffset.toString(),
            StartSaleDateTime: startDate?.toJSON(),
            EndSaleDateTime: endDate?.toJSON(),
        }
        const requestOptions = {
            uri: `${MB_BASE_URL}/sale/sales`,
            qs: queryString,
            headers: headers,
            json: true,
            useQueryString: true,
        }
        try {
            const response: Response = await limiter.request(requestOptions)
            if (response.statusCode !== 200) {
                throw new Error(JSON.stringify(response.body.Error))
            }
            responseSales = response.body.Sales
            salesCount = responseSales.length
            requestOffset += salesCount
            sales = sales.concat(responseSales)
            getSalesDebug(`Retrieved ${salesCount} MB sales.`)
        } catch (error) {
            getSalesDebug("Failed to retrieve MB sales %o.", error)
            throw new Error(error)
        }
    } while (salesCount % salesMaxRequestSize === 0 && salesCount !== 0)
    getSalesDebug(`Retrieved a total of ${sales.length} MB services.`)
    return sales
}
