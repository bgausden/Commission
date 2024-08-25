import { Either as E, Option as O } from 'effect'
import { config } from 'node-config-ts'
import { ITalenoxPayment } from './ITalenoxPayment.js'
import { TalenoxCreatePayrollPaymentResult } from './ITalenoxPayrollPaymentResult.js'
import { ITalenoxStaffInfo } from './ITalenoxStaffInfo.js'
import { TalenoxUploadAdHocPaymentsResult } from './IUploadAdHocPaymentsResult.js'
import { debugLogger, errorLogger } from './logging_functions.js'
import { createPayroll, uploadAdHocPayments } from './talenox_functions.js'
import { TalenoxStaffMap } from './types.js'
import debug from 'debug'

/**
 * @abstract Pushes payroll to Talenox
 * @param talenoxStaff
 * @param payments
 */
export async function pushPayrollToTalenox(
  talenoxStaff: O.Option<Map<string, Partial<ITalenoxStaffInfo>>>,
  payments: ITalenoxPayment[]
): Promise<E.Either<string, Error>> {
  const pushPayrollToTalenoxDebug = debug('pushPayrollToTalenox')
  if (!config.updateTalenox) {
    return E.right('Talenox update is disabled in config.')
  }

  pushPayrollToTalenoxDebug(`Requesting new payroll payment creation from Talenox`)
  let createPayrollResult: E.Either<TalenoxCreatePayrollPaymentResult, Error> = E.left(
    new Error('Exception thrown by createPayroll.')
  )
  let staffMap: TalenoxStaffMap = new Map<string, Partial<ITalenoxStaffInfo>>()

  O.match(talenoxStaff, {
    onNone: () => {
      const errorText = 'No staff from Talenox. Cannot push payroll to Talenox'
      debugLogger.debug(errorText)
      errorLogger.error(errorText)
      return E.right(new Error(errorText))
    },
    onSome: async (staff) => {
      debugLogger.debug(`Have staff from Talenox so can push payroll to Talenox`)
      staffMap = staff
    },
  })

  if (staffMap.size === 0) {
    const errorText = `Fatal: Failed to create new payroll in Talenox. No staff from Talenox.`
    errorLogger.error(errorText)
    return E.left(new Error(errorText))
  }

  createPayrollResult = await createPayroll(staffMap)

  E.match(createPayrollResult, {
    onLeft: (error) => {
      const errorText = `Fatal: Failed to create new payroll in Talenox. Error message: ${error.message}`
      errorLogger.error(errorText)
      throw new Error(errorText)
    },
    onRight: (result) => debugLogger.debug(`Talenox payroll payment created: ${result.message}`),
  })

  debugLogger.debug(`Pushing ad-hoc payments into new payroll`)

  /*     let uploadAdHocResult = await uploadAdHocPayments(
      O.getOrThrowWith(staffMap, () => new Error('No staffMap from Talenox. Should never happen.')),
      payments
    ) */
  let uploadAdHocResult = await uploadAdHocPayments(staffMap, payments)

  E.match(uploadAdHocResult, {
    onLeft: (error) => {
      const errorText = `Failed to push ad-hoc payments into new payroll. Error message: ${error.message}`
      errorLogger.error(errorText)
      return E.left(new Error(errorText))
    },
    onRight: (result) => {
      debugLogger.debug(`Pushing ad-hoc payments into new payroll is complete. Result: ${result.message}`)
    },
  })
  return E.right('Payroll pushed to Talenox successfully.')
}
