import {
    TStaffID, CommComponents, TCommMap,
    TStaffHurdles,
    TTalenoxInfoStaffMap
} from "./types.js";
import { eqSet, isUndefined } from "./utility_functions.js";
import { commissionLogger, infoLogger } from "./logging_functions.js";

export function doPooling(commMap: TCommMap, staffHurdle: TStaffHurdles, talenoxStaff: TTalenoxInfoStaffMap): void {
    let poolCounter = 0;
    const pools = new Map<number, TStaffID[]>();
    Object.entries(staffHurdle).forEach((element) => {
        const [staffID, hurdle] = element;
        const poolingWith = hurdle.poolsWith;
        if (poolingWith && poolingWith.length > 0) {
            let foundPoolID: number | undefined;
            let foundPoolMembers: TStaffID[] | undefined;
            for (const pool of pools) {
                const [poolID, poolingStaff] = pool;
                if (poolingStaff.includes(staffID)) {
                    if (foundPoolID) {
                        if (foundPoolMembers && !eqSet(poolingStaff, foundPoolMembers)) {
                            // Already appear in another pool. Something's broken
                            throw new Error(`${staffID} appears to be a member of two `);
                        }
                    } else {
                        // make sure this pool contains everyone we think we pool with
                        // if not, the staffHurdle.json is incorrect
                        poolingWith.push(staffID);
                        if (eqSet(poolingStaff, poolingWith)) {
                            foundPoolID = poolID;
                            foundPoolMembers = poolingStaff;
                        } else {
                            throw new Error(`Pooling config for ${staffID} appears to be incorrect.`);
                        }
                    }
                }
            }
            // Now set the pool if !foundPoolID
            if (foundPoolID === undefined) {
                poolingWith.push(staffID);
                pools.set(poolCounter, poolingWith);
                poolCounter += 1;
            }
        }
    });
    // Now actually allocate revenues across the pools
    for (const pool of pools) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const [poolID, poolMembers] = pool;
        const aggregateComm: CommComponents = {
            totalServiceRevenue: 0,
            totalServiceCommission: 0,
            tips: 0,
            productCommission: 0,
            customRateCommission: 0,
            customRateCommissions: {},
            generalServiceCommission: 0,
        };
        poolMembers.forEach((poolMember) => Object.entries(aggregateComm).forEach((aggregateElement) => { // TODO replace with simple for loop - don't need to loop through aggregateComm if there's no comm to pool
            const [aggregatePropName, aggregatePropValue] = aggregateElement;
            const commMapElement = commMap.get(poolMember);
            if (commMapElement) {
                const commMapValue = commMapElement[aggregatePropName];
                if (typeof aggregatePropValue === "number" && typeof commMapValue === "number") {
                    aggregateComm[aggregatePropName] = aggregatePropValue + commMapValue;
                }
            } else {
                infoLogger.info(`doPooling1: No commMap entry (no commission) for ${poolMember} but configured for pooling.`);
                // throw new Error(`No commMap entry for ${poolMember}. This should never happen.`);
            }
        })
        );
        // divide the aggregate values across the pool members by updating their commComponents entries
        // Question: do we want to add pool_* variants of the comm components so we can see the before/after?
        commissionLogger.info("=======================================");
        commissionLogger.info("Pooling Calculations");
        commissionLogger.info("=======================================");

        poolMembers.forEach((poolMember) => {
            const staffName = `${talenoxStaff.get(poolMember)?.last_name ?? "<Last Name>"}, ${talenoxStaff.get(poolMember)?.first_name ?? "<First Name>"}`;
            commissionLogger.info(`Pooling for ${poolMember} ${staffName}`);
            let memberList = "";
            let comma = "";
            poolMembers.forEach((member) => {
                memberList += `${comma}${member} ${talenoxStaff.get(member)?.last_name ?? "<Last Name>"} ${talenoxStaff.get(member)?.first_name ?? "<First Name>"}`;
                comma = ", ";
            });
            commissionLogger.info(`Pool contains ${poolMembers.length} members: ${memberList}`);
            const comm = commMap.get(poolMember);
            if (isUndefined(comm)) {
                infoLogger.info(`doPooling2: No commMap entry (no commission) for ${poolMember} but configured for pooling.`);
                // throw new Error(`No commMap entry for ${poolMember} ${staffName}. This should never happen.`); <-- not necessary? could be legit there's no comm?
            }
            else {
                for (const [aggregatePropName, aggregatePropValue] of Object.entries(aggregateComm)) {
                    //const [aggregatePropName, aggregatePropValue] = aggregate;

                    if (typeof aggregatePropValue === "number") {
                        if (isUndefined(comm)) { continue }
                        comm[aggregatePropName] = Math.round((aggregatePropValue * 100) / poolMembers.length) / 100;
                        const aggregateCommString = (typeof comm[aggregatePropName] === "number") ? comm[aggregatePropName].toString() : JSON.stringify(comm[aggregatePropName]);
                        commissionLogger.info(
                            `${aggregatePropName}: Aggregate value is ${aggregatePropValue}. 1/${poolMembers.length} share = ${aggregateCommString}`
                        );
                    }

                }
            }
            commissionLogger.info("--------------");
        });
    }
    commissionLogger.info('');
    commissionLogger.info("=======================================");
    commissionLogger.info('');
    return;
}
