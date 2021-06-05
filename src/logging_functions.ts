// import debug from 'debug'
import l4js from 'log4js'
const { configure, getLogger } = l4js

configure('./log4js.json')

export const commissionLogger = getLogger("commission")
commissionLogger.level = 'info'

export const contractorLogger = getLogger('contractor')
contractorLogger.level = 'info'

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