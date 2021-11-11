// import debug from 'debug'
import l4js from 'log4js'
const { configure, getLogger } = l4js

// the template in the root of the project needs to be copied to /src
// the npm script "build" does this for us (see /scripts)
import log4jsBaseConfig from "./log4js.json"

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
function fileNameSPlit(filename: string, sep?: string): string {
    if (sep == "" || sep === undefined) {
        sep = "."
    }
    if (sep.length != 1) {
        const message = `Separator must have length 1. "${sep}" is not a valid separator.`
        errorLogger.fatal(message)
        throw new Error(message)
    }
    // TODO return an array or a tuple containing basename and extension
    // TODO gracefully handle no extension
    return filename.substr(filename.lastIndexOf(sep) + 1)
}

// change the filename we'll log to by appending the datetime to the file name
const date = Date.now()
// find the basename of the file (the bit that's not the extension)


log4jsBaseConfig.appenders.commission.filename = `log4jsBaseConfig.appenders.commission.filename`

// configure('./log4js.json')

export const commissionLogger = getLogger("commission")
commissionLogger.level = 'info'

export const contractorLogger = getLogger('contractor')
contractorLogger.level = 'info'

