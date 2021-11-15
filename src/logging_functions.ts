/* eslint-disable @typescript-eslint/ban-ts-ignore */
// import debug from 'debug'
import { promises } from 'fs'
const { readFile } = promises // node 14 doesn't support import {readFile} from 'fs/promises' so this work-around
import l4js from 'log4js'
const { configure, getLogger } = l4js
import { Configuration } from 'log4js'
import { basename, extname } from 'path'

// the template in the root of the project needs to be copied to /src
// the npm script "build" does this for us (see /scripts)
let log4jsConfigFile = './log4js.json'
if (process.env.log4jsConfigFile) {
    log4jsConfigFile = process.env.log4jsConfigFile
}

const log4jsConfig: Configuration = JSON.parse(await readFile(new URL(`./${log4jsConfigFile}`, import.meta.url), { encoding: 'utf-8' }))

export const debugLogger = getLogger('debug')
debugLogger.level = 'debug'

export const infoLogger = getLogger('info')
infoLogger.level = 'info'

export const warnLogger = getLogger('warn')
warnLogger.level = 'warning'

export const errorLogger = getLogger('error')
errorLogger.level = 'error'

export function shutdownLogging(): void {
    l4js.shutdown()
}

// TODO put this into an init() function
// TODO create the contractor and commission log files as part of init()

// change the filenames we'll log to by appending the datetime to the file names
// @ts-ignore ts-2339
const commissionLogFileName = log4jsConfig.appenders?.commission?.filename ?? './commission.log'
const commissionLogFileExt = extname(commissionLogFileName)
const commissionLogFileBaseName = basename(commissionLogFileName, commissionLogFileExt)
let date = (new Date()).toISOString()
// @ts-ignore ts-2339
log4jsConfig.appenders.commission.filename = `log4jsConfig.appenders.commission.${commissionLogFileBaseName}-${date}${commissionLogFileExt}`

// @ts-ignore ts-2339
const contractorLogFileName = log4jsConfig.appenders?.contractor?.filename ?? './contractor.log'
const contractorLogFileExt = extname(contractorLogFileName)
const contractorLogFileBaseName = basename(contractorLogFileName, contractorLogFileExt)
date = (new Date()).toISOString()
// @ts-ignore ts-2339
log4jsConfig.appenders.commission.filename = `log4jsBaseConfig.appenders.contractor.${contractorLogFileBaseName}-${date}${contractorLogFileExt}`

configure(log4jsConfig)

export const commissionLogger = getLogger("commission")
commissionLogger.level = 'info'

export const contractorLogger = getLogger('contractor')
contractorLogger.level = 'info'

