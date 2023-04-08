
import assert from 'assert'
import { ITalenoxStaffInfo } from '../src/ITalenoxStaffInfo'
import { initStaffCache, putStaffToCache, updateStaffInCache, defaultStaffCache, getStaffFromCache } from "../src/staff_cache.js"

describe('test commission.staff_cache', function () {
    describe('test cache update', function () {
        it('updates an existing cache entry', function (done) {
            let staffInfo: Partial<ITalenoxStaffInfo> = {
                "id": "1",
                "first_name": "staff 1",
                "ssn": '5'
            }
            putStaffToCache(staffInfo, undefined)
            staffInfo.ssn = '2'
            let result = updateStaffInCache(staffInfo, undefined)
            //console.log(result)
            assert.equal(result.status, 'OK', 'result.status')
            done()
        })

        it('updates a missing cache entry', function (done) {
            //initStaffCache(undefined, defaultStaffCache)
            let result = updateStaffInCache({ id: '1', first_name: 'test2' }, undefined)
            //console.log(result)
            assert.equal(result.status, 'FAIL')
            assert.equal(result.operation, 'UPDATE')
            done()
        })

        afterEach(function () {
            initStaffCache(undefined, defaultStaffCache)
        })
    })

    describe('test cache put', function () {
        it('puts a new cache entry into the default cache', function (done) {
            let staff_info: Partial<ITalenoxStaffInfo> = {
                "id": '1',
                "first_name": "staff 1",
                "ssn": '5'
            }
            let result = putStaffToCache(staff_info, undefined)
            // console.log(result)
            assert.equal(result.status, 'OK', 'result.status')
            assert.equal(result.operation, 'PUT', 'result.operation')
            done()
        })

        it('trys to put an existing cache entry in the default cache', function (done) {
            let staff_info: Partial<ITalenoxStaffInfo> = {
                "id": '1',
                "first_name": "staff 1",
                "ssn": '5'
            }
            putStaffToCache(staff_info, undefined)
            let result = putStaffToCache(staff_info, undefined)
            // console.log(result)
            assert.equal(result.status, 'FAIL', 'result.status')
            assert.equal(result.operation, 'PUT')
            done()
        })
    })

    describe('test cache get', function () {
        it('gets an existing cache entry from default cache', function (done) {
            let staffInfo: Partial<ITalenoxStaffInfo> = {
                "id": '1',
                "first_name": "staff 1",
                "ssn": '10'
            }
            let putResult = putStaffToCache(staffInfo, undefined)
            assert.strictEqual(putResult.status, 'OK', 'putStaffIntoCache.result.status')
            let getResult = getStaffFromCache(staffInfo.id as string, undefined)
            // console.log(result)
            assert.deepStrictEqual(getResult.data, staffInfo, 'getStaffFromCache.result.data')
            assert.strictEqual(getResult.status, 'OK', 'getStaffFromCache.result.status')
            done()
        })

        it('trys to get a missing cache entry from default cache', function (done) {
            let result = getStaffFromCache('1', undefined)
            // console.log(result)
            assert.equal(result?.status, 'FAIL', 'result.status')
            assert.equal(result?.operation, 'GET')
            done()
        })
    })

    afterEach(function () {
        initStaffCache(undefined, defaultStaffCache)
    })
})