import l4js from 'log4js'
const {configure, getLogger, shutdown, levels} = l4js // l4js doesn't export these functions, so we have to destructure them from the default export
import { basename, extname } from 'path'
import log4jsConfig from './log4js.json' assert { type: "json" }
import { validateLog4jsConfig } from './log4jsConfigSchema.js'

// the log4js config in the root of the project needs to be copied to /src
// the npm script "build" does this for us (see /scripts)


// TODO: allow location of log4js config file to be specified in environment variable or allow config file to be loaded from an environment variable

// const log4jsConfigFile = process.env.log4jsConfigFile ?? './log4js.json' 
//let log4jsConfig = await (import(log4jsConfigFile, { assert: { type: "json" } })) as Configuration // dynamic loading of json module
//log4jsConfig = log4jsConfigSchema.passthrough().parse(log4jsConfig) // validating with zod

const logsDir = process.env.logsDir ?? 'logs/'

// const log4jsConfig: Configuration = JSON.parse(await readFile(new URL(`./${log4jsConfigFile}`, import.meta.url), { encoding: 'utf-8' })) // original attempt at reading config from file

// const log4jsConfig = l4js.configure(`./${log4jsConfigFile}`) // just load a config from file (if no need to customize)

// const commissionLogFileName = log4jsConfig.appenders.commission.filename ?? './commission.log'

validateLog4jsConfig(log4jsConfig)

const commissionLogFileName = log4jsConfig.appenders.commission.filename ?? './commission.log'
const commissionLogFileExt = extname(commissionLogFileName)
const commissionLogFileBaseName = basename(commissionLogFileName, commissionLogFileExt)
let date = (new Date()).toISOString().replace(new RegExp(':', 'g'), '')
log4jsConfig.appenders.commission.filename = `${logsDir}/${date} ${commissionLogFileBaseName}${commissionLogFileExt}`

const contractorLogFileName = log4jsConfig.appenders?.contractor?.filename ?? './contractor.log'
const contractorLogFileExt = extname(contractorLogFileName)
const contractorLogFileBaseName = basename(contractorLogFileName, contractorLogFileExt)
date = (new Date()).toISOString().replace(new RegExp(':', 'g'), '')
log4jsConfig.appenders.contractor.filename = `${logsDir}/${date} ${contractorLogFileBaseName}${contractorLogFileExt}`

configure(log4jsConfig)

export const commissionLogger = getLogger("commission")
commissionLogger.level = levels.INFO

export const contractorLogger = getLogger('contractor')
contractorLogger.level = levels.INFO


export const debugLogger = getLogger('debug')
debugLogger.level = levels.DEBUG

export const infoLogger = getLogger('info')
infoLogger.level = levels.INFO

export const warnLogger = getLogger('warn')
warnLogger.level = levels.WARN

export const errorLogger = getLogger('error')
errorLogger.level = levels.ERROR

export function shutdownLogging(): void {
    shutdown()
}
