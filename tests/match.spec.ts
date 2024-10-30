import { test, expect } from '@playwright/test';
import { getPayInfo, matchPaymentsWithBankstatements, payAndBankInfo, paymentsInfo, receiptInfo } from '../src/util';
import { format } from 'date-fns';


test('can handle simple case  NK_SP_20230816: 76326484 [76326484] [76326484]', async () => {
    const result = matchPaymentsWithBankstatements(76326484, [76326484], [76326484]);
    await expect(result).toEqual([[76326484], [76326484]]);
});

test('can handle merged case  NK_SP_20230820: 57093789 [53723969, 68353888, 57093789] [179171646]', async () => {
    const result = matchPaymentsWithBankstatements(57093789, [53723969, 68353888, 57093789], [179171646]);
    await expect(result).toEqual([[53723969, 68353888, 57093789], [179171646]]);
});

test('can handle split case1  NP_SP_20230816: 315632478 [315632478] [129016435, 186616043]', async () => {
    const result = matchPaymentsWithBankstatements(315632478, [315632478], [129016435, 186616043]);
    await expect(result).toEqual([[315632478], [129016435, 186616043]]);
});

test('can handle split case2a SW_LJ_OFF_2023811: 9598554 [9598554, 49366127] [9566395, 32159, 49366127]', async () => {
    const result = matchPaymentsWithBankstatements(9598554, [9598554, 49366127], [9566395, 32159, 49366127]);
    await expect(result).toEqual([[9598554], [9566395, 32159]]);
});

test('can handle split case2b SW_LJ_OFF_2023816: 49366127 [9598554, 49366127] [9566395, 32159, 49366127]', async () => {
    const result = matchPaymentsWithBankstatements(49366127, [9598554, 49366127], [9566395, 32159, 49366127]);
    await expect(result).toEqual([[49366127], [49366127]]);
});


test('SP test', async () => {
    // const results = await receiptInfo('SW_LJ_OFF_20230825');
    // const results = await receiptInfo('NK_SP_20230820');
    // const pid = 'SW_LJ_OFF_20230825';
    const pid = 'HD_BSP_20240903';
    // const pid = 'NK_SP_20240804';

    const checkings = await getPayInfo(pid);
    checkings.forEach((checking, i) => {
        console.log('case: ', i, checking.paymentid, format(checking.date, 'yyyy-MM-dd'), checking.amount);
    });

    const results = await receiptInfo(pid);
    results.forEach((result, i) => {
        console.log('\n-------------- case: ', i, ' ---------------');
        console.log(result);
    });
    // console.log(format(result.bankstmts[0].trxdate, 'yyyy-MM-dd'));
    // await expect(result).toHaveLength(6);
});