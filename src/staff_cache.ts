import { ITalenoxStaffInfo } from "./ITalenoxStaffInfo"
import { TTalenoxInfoStaffMap } from "./types"
import { consoleLogger } from "./logging_functions.js"

export var defaultStaffCache: TTalenoxInfoStaffMap

type TStaffCacheOperation = 'INIT' | 'PUT' | 'GET' | 'UPDATE' | 'SET_DEFAULT' | 'UNKNOWN'
type TStaffCacheOperationStatus = 'OK' | 'FAIL' | 'UNKNOWN'
type TStaffCacheOperationMessage = string | 'NO_MESSAGE'
type TStaffCacheResponse = { data: Partial<ITalenoxStaffInfo> | TTalenoxInfoStaffMap, status: TStaffCacheOperationStatus, operation: TStaffCacheOperation, message: TStaffCacheOperationMessage }


export function initStaffCache(staffInfo?: Partial<ITalenoxStaffInfo>, cache?: TTalenoxInfoStaffMap): TStaffCacheResponse {
    if (!cache) { cache = new Map() } else { cache.clear() }
    if (staffInfo?.id) {
        cache.set(staffInfo.id, staffInfo)
    }
    // If we don't have a default cache, then we need to set it to the new cache
    if (defaultStaffCache === undefined) { defaultStaffCache = cache }
    return { data: defaultStaffCache, status: 'OK', operation: 'INIT', message: 'NO_MESSAGE' }
}

export function setDefaultStaffCache(cache: TTalenoxInfoStaffMap): TStaffCacheResponse {
    // need a guard here to ensure cache is an instance of TTalenoxInfoStaffMap, but how?
    defaultStaffCache = cache
    return {
        data: defaultStaffCache,
        status: 'OK',
        operation: 'SET_DEFAULT',
        message: 'NO_MESSAGE'
    }
}

export function putStaffToCache(staffInfo: Partial<ITalenoxStaffInfo>, cache?: TTalenoxInfoStaffMap): TStaffCacheResponse {
    let data = null
    let status: TStaffCacheOperationStatus = 'UNKNOWN'
    let operation: TStaffCacheOperation = 'PUT'
    let message: TStaffCacheOperationMessage = 'NO_MESSAGE'
    if (cache === undefined || cache === null) {
        if (defaultStaffCache === undefined || defaultStaffCache === null) {
            initStaffCache()
        }
        cache = defaultStaffCache
    }
    let staffID = staffInfo.id
    if (staffID) {
        if (cache.get(staffID)) {
            message = `StaffID: ${staffID} cannot be inserted into the selected staff cache as it already exists.`
            status = 'FAIL'
            operation = 'PUT'
            return {
                data: {},
                status,
                operation,
                message
            }
        }
        cache.set(staffID, staffInfo)
        return {
            data: {},
            status: 'OK',
            operation: 'PUT',
            message: 'NO_MESSAGE'
        }
    }
    message = `Staff info cannot be inserted into the selected staff cache as it does not include an ID.`
    return {
        data: staffInfo,
        status: 'FAIL',
        operation: 'PUT',
        message
    }
}

export function getStaffFromCache(staffId: string, cache?: TTalenoxInfoStaffMap): TStaffCacheResponse {
    if (!cache) {
        if (!defaultStaffCache) {
            initStaffCache()
        }
        cache = defaultStaffCache
    }
    let staffInfo = cache.get(staffId)
    if (!staffInfo) {
        let message = `StaffID ${staffId} does not exist in the selected staff cache.`
        return {
            data: {},
            status: 'FAIL',
            operation: 'GET',
            message
        }
    }
    return {
        data: staffInfo,
        status: 'OK',
        operation: 'GET',
        message: 'NO_MESSAGE'
    }
}


export function updateStaffInCache(staff_info: Partial<ITalenoxStaffInfo>, cache?: TTalenoxInfoStaffMap): TStaffCacheResponse {
    if (!cache) {
        if (!defaultStaffCache) {
            initStaffCache()
        }
        cache = defaultStaffCache
    }
    if (staff_info.id) {
        if (!cache.get(staff_info.id)) {
            let message = `StaffID: ${staff_info.id} cannot be updated in the selected staff cache as it does not exist.`
            //consoleLogger.error(message)
            return {
                data: {},
                status: 'FAIL',
                operation: 'UPDATE',
                message: message
            }
        }
        cache.set(staff_info.id, staff_info)
    }
    return {
        data: staff_info,
        status: 'OK',
        operation: 'UPDATE',
        message: 'NO_MESSAGE'
    }
}