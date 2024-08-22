import * as fs from 'fs'
import * as path from 'path'
import { debugLogger, warnLogger, errorLogger } from './logging_functions.js'
import { access, constants, stat, mkdir } from 'node:fs/promises'

export function directoryCreate() {
  const directories = ['logs', 'payments', 'data'] as const

  directories.forEach(async (dir) => {
    stat(dir).catch((error) => {
      debugLogger.debug(`Missing ${dir} directory. Attempting to create.`)
      mkdir(dir, { recursive: true }).catch((error) => {
        errorLogger.error(`Failed to create ${dir}. Error: ${(error as Error).message}.`)
      })
    })
  })
}
