import * as E from '@effect/data/Either'
import * as O from '@effect/data/Option'
import { config } from 'node-config-ts'
import { ITalenoxPayment } from './ITalenoxPayment.js'
import { TalenoxPayrollPaymentResult } from './ITalenoxPayrollPaymentResult.js'
import { ITalenoxStaffInfo } from './ITalenoxStaffInfo.js'
import { TalenoxUploadAdHocPaymentsResult } from './IUploadAdHocPaymentsResult.js'
import { debugLogger, errorLogger } from './logging_functions.js'
import { createPayroll, uploadAdHocPayments } from './talenox_functions.js'
import { TTalenoxInfoStaffMap } from './types.js'

/**
 * @abstract Pushes payroll to Talenox
 * @param talenoxStaff
 * @param payments 
 */
export async function pushPayrollToTalenox(
  talenoxStaff: O.Option<Map<string, Partial<ITalenoxStaffInfo>>>,
  payments: ITalenoxPayment[]
) {
  if (config.updateTalenox) {
    debugLogger.debug(`Requesting new payroll payment creation from Talenox`)

    let createPayrollResult: O.Option<E.Either<Error, TalenoxPayrollPaymentResult>> = O.none()
    let staffMap: O.Option<TTalenoxInfoStaffMap> = O.none()

    void O.match(talenoxStaff, {
      onNone: () => {
        const errorText = 'No staff from Talenox. Cannot push payroll to Talenox'
        debugLogger.debug(errorText)
        errorLogger.error(errorText)
        throw new Error('No staff from Talenox')
      },
      onSome: async (staff) => {
        debugLogger.debug(`Have staff from Talenox so can push payroll to Talenox`)
        staffMap = O.some(staff)
        createPayrollResult = O.some(await createPayroll(staff))
      },
    })

    /*     if (O.isSome(talenoxStaff)) {
          debugLogger.debug(`Have staff from Talenox so can push payroll to Talenox`)
          createPayrollResult = await createPayroll(talenoxStaff.value)
        } else {
          const errorText = 'No staff from Talenox. Cannot push payroll to Talenox'
          debugLogger.debug(errorText)
          errorLogger.error(errorText)
          throw new Error('No staff from Talenox')
        } */
    /*     E.match(
          (error) => {
            const errorText = `Failed to create payroll payment for ${config.PAYROLL_MONTH}. Error message: ${
              (error as Error).message
            }`
            errorLogger.error(errorText)
            throw new Error(errorText)
          },
          (result) =>
            debugLogger.debug(`Talenox payroll payment created: ${(result as TalenoxPayrollPaymentResult).message}`)
        )(createPayrollResult) */
    E.match(
      O.getOrThrowWith(
        createPayrollResult,
        () => new Error('No result from createPayroll. This should have been handled upstream.')
      ),
      {
        onLeft: (error) => {
          const errorText = `Failed to push ad-hoc payments into new payroll. Error message: ${error.message}`
          errorLogger.error(errorText)
          throw new Error(errorText)
        },
        onRight: (result) => debugLogger.debug(`Talenox payroll payment created: ${result.message}`),
      }
    )

    debugLogger.debug(`Pushing ad-hoc payments into new payroll`)

    let uploadAdHocResult: O.Option<E.Either<Error, TalenoxUploadAdHocPaymentsResult>> = O.none()

    uploadAdHocResult = O.some(
      await uploadAdHocPayments(
        O.getOrThrowWith(
          staffMap,
          () => new Error('No staffMap. Should never happen.')),
        payments
      )
    )
    E.match(
      O.getOrThrowWith(
        uploadAdHocResult,
        () => new Error('No result from uploadAdHocPayments. This should never happen.')
      ),
      {
        onLeft: (error) => {
          const errorText = `Failed to push ad-hoc payments into new payroll. Error message: ${error.message}`
          errorLogger.error(errorText)
          throw new Error(errorText)
        },
        onRight: () => debugLogger.debug(`Pushing ad-hoc payments into new payroll is complete`),
      }
    )
  }
}
