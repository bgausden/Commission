import debug from 'debug'

/* export const log = debug('app.log')
export const warn = debug('app.warn')
export const error = debug('app.error')
 */
export function initDebug(): void {
    debug.log = console.info.bind(console)
}