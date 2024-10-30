import { test, expect, type Page } from '@playwright/test';
import { Accounting, accountingInfo, Bankstmt, Payment, receiptInfo, receiptMethod, getWriteOffAccount } from '../src/util';
import { add, format } from 'date-fns';
import { addBusinessDays } from '../src/holiday';
import { LoginPage } from './login-page';
import { ReceiptPage } from './receipt-page';

test.describe('ERP Receipt', () => {

  test.beforeEach(async ({ page }) => {
    const lp = new LoginPage(page);
    await lp.login();
    await lp.moveToManageReceipts();
  });

  const pids = process.env.PIDS || ''
  const paymentIds = pids.split(',');

  paymentIds.forEach((paymentId) => {
    test(`Receipt for ${paymentId}`, async ({ page }) => {
    
      console.log('paymentId:', paymentId);
      const inputs = await receiptInfo(paymentId);  // inputs composed of different paid date

      var aInvs = inputs[0].erp_invs;
      var aInvAmt = aInvs.reduce((acc, cur) => acc + cur.amount, 0);

      for (let input of inputs) {
        
        const paidDate = input.payments[0].gateway === 'BSP' ? addBusinessDays('KR', '', input.payments[0].date, 1) : input.payments[0].date;
        console.log('\n====', input.payments[0].paymentid, 'paid on', format(paidDate, 'yyyy-MM-dd'), '==============================\n');

        const bankstmts = input.bankstmts;
        const erp_invs = aInvs.filter((inv) => inv.amount !== 0);
        const accounting = input.accounting;
        const feeEtcs = accounting.filter((info) => info.account !== 'assets:checking');
        console.log('bankstmts:', bankstmts);
        console.log('erp_invs:', erp_invs);
        console.log('accounting:', accounting);

        var aReceipt = accounting.reduce((acc, cur) => acc + cur.amount, 0);
        var aFeeEtc = feeEtcs.reduce((acc, cur) => acc + cur.amount, 0);

        var sq = 1;
        var rp: ReceiptPage;
        for (let bankstmt of bankstmts) {
          console.log(`\n-------------- bankstmt-${sq} ---------------`);
          var aBankstmt = bankstmt.dramt;
          console.log('aBankstmt:', aBankstmt, 'aReceipt:', aReceipt, `aErpInv${input.payments[0].gateway === 'JINAIR' ? '(ON+OFF)' : ''}:`, aInvAmt, '\n');

          // ---------------------------------------------------------
          rp = new ReceiptPage(page, bankstmt, input.payments[0]);
          await rp.selectPayment();
          await rp.setCustomer(erp_invs[0].customer);
          // ------------------------------------------------

          var i = 1;
          for (let inv of erp_invs) {

            if (aReceipt === 0 || aInvAmt <= 0 || aBankstmt === 0) {
              break;
            }

            if (aFeeEtc > 0) {
              for (let feeEtc of feeEtcs) {       
                // ------------------------------------------------
                await rp.writeOff(feeEtc)
                // ------------------------------------------------
                
                console.log('receipt-0:', inv.reference, `(${feeEtc.account})`, feeEtc.amount);

                // update state
                aFeeEtc -= feeEtc.amount;
                aInvAmt -= feeEtc.amount;
                aReceipt -= feeEtc.amount;
              }
              console.log('aBankstmt:', aBankstmt, 'aReceipt:', aReceipt, 'aErpInv:', aInvAmt, '\n');
              expect(aFeeEtc).toEqual(0);
            }

            var receiptAmt = 0;
            if (inv.salerfnd === 'refund') {
              receiptAmt = inv.amount;
            } else if (inv.salerfnd === 'sale') {
              receiptAmt = Math.min(inv.amount, aBankstmt, aReceipt);
            }

            // ------------------------------------------------
            // rp.addOpenReceivables(inv, receiptAmt);
            await page.getByRole('button', { name: 'Add Open Receivables', exact: true }).click();
            expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible();

            // check search form is opened
            const searchButton = page.getByRole('button', { name: 'Search', exact: true });
            const searchFormOpened = await searchButton.isVisible();
            if (!searchFormOpened) {
                await page.getByTitle('Expand Search: Transactions').click();
                await expect(searchButton).toBeVisible();
            }

            await page.locator("xpath=//label[.='From Transaction Due Date']/following::input[@placeholder='yyyy-mm-dd'][1]").fill(inv.acctdate);
            await page.locator("xpath=//label[.='To Transaction Due Date']/following::input[@placeholder='yyyy-mm-dd'][1]").fill(inv.acctdate);
            await page.getByText('Include Credit Memos').click();
            await searchButton.click();
            await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeVisible();

            // select invoice
            await page.getByText(inv.amount.toLocaleString()).click();
            await page.getByRole('button', { name: 'Add', exact: true }).click();
            await page.getByRole('button', { name: 'Done', exact: true }).click();

            // edit applied amount
            // const appliedInput = await page.getByRole('cell', { name: `${inv.amount.toLocaleString()} Applied Amount` })
            // await appliedInput.click();
            // await page.keyboard.press('Shift+End')
            // await page.keyboard.type(receiptAmt.toLocaleString());
            // await page.keyboard.press('Tab');

            await page.getByRole('cell', { name: `${inv.amount.toLocaleString()} Applied Amount` }).fill(receiptAmt.toLocaleString());
            await page.keyboard.press('Tab');
            // ------------------------------------------------
            inv.amount -= receiptAmt;

            console.log(`recepit-${i}:`, inv.reference, `${inv.salerfnd === 'sale' ? '(AR)' : '(CM)'}`, receiptAmt);

            // update aInvs --> this is because available invoices should be lived during whole process
            aInvs = aInvs.map((el) => el.reference === inv.reference && el.salerfnd === inv.salerfnd ? inv : el);
            // adjust available state
            aBankstmt -= receiptAmt;
            aInvAmt -= receiptAmt;
            aReceipt -= receiptAmt;
            
            console.log('aBankstmt:', aBankstmt, 'aReceipt:', aReceipt, 'aErpInv:', aInvAmt, '\n');
            i++;
          }

          sq++;
          if (aReceipt === 0 || aInvAmt <= 0) {
            break;
          }
          if (aBankstmt === 0) {
            continue;
          }

          expect(aBankstmt).toBeGreaterThanOrEqual(0);
          // ------------------------------------------------
          rp.saveAndClose();
        }
        
        expect(aReceipt).toEqual(0);
        expect(aInvAmt).toBeGreaterThanOrEqual(0);  
      }
    }); 
  });
});;

test('data check', async () => {
  const paymentId = 'NK_SP_20240804';
  const inputs = await receiptInfo(paymentId);
  inputs.forEach((input, i) => {
    console.log('\n-------------- case: ', i, ' ---------------');
    // console.log(input);
  
    const payments = input.payments;
    const bankstmts = input.bankstmts;
    const erp_invs = input.erp_invs;
    const accounting = input.accounting;
    const checkingInAccounting = accounting.filter((info) => info.account === 'assets:checking');
    const etcInAccounting = accounting.filter((info) => info.account !== 'assets:checking');

    const paymentIds = payments.map((info) => info.paymentid).join(', ');
    const sumPayments = payments.reduce((acc, cur) => acc + cur.amount, 0);
    const sumBankstmts = bankstmts.reduce((acc, cur) => acc + cur.dramt, 0);
    const sumErpInvs = erp_invs.reduce((acc, cur) => acc + cur.amount, 0);
    const sumAccounting = accounting.reduce((acc, cur) => acc + cur.amount, 0);
    const sumCheckingInAccounting = checkingInAccounting.reduce((acc, cur) => acc + cur.amount, 0);
    const sumEtcInAccounting = etcInAccounting.reduce((acc, cur) => acc + cur.amount, 0);

    console.log('paymentId        :', paymentId);
    console.log('paymentIds paid together with', paymentId, ':', paymentIds);
    console.log('sum of payments  :', sumPayments.toLocaleString());
    console.log('sum of bankstmts :', sumBankstmts.toLocaleString());
    console.log('sum of checking  :', sumCheckingInAccounting.toLocaleString());
    console.log('sum of fee & etc :  ', sumEtcInAccounting.toLocaleString());
    console.log('sum of erp_invs  :', sumErpInvs.toLocaleString());
    expect(sumPayments).toEqual(sumBankstmts);
    expect(sumPayments).toEqual(sumCheckingInAccounting);
    console.log('sum of accounting:', sumAccounting.toLocaleString());
    expect(sumErpInvs).toBeGreaterThanOrEqual(sumAccounting);
    console.log('payments === bankstmts === checkingInAccounting: OK');
    console.log('sum of erp_invs >= sum of accounting: OK');
    console.log('input data integrity check: Done!');
  })
});

test('dummy test', async () => {
  console.log('dummy test');

  // const paymentId = 'SW_LJ_OFF_20230825';
  // const paymentId = 'HD_BSP_20240903';
  const paymentId = 'NK_SP_20240730';
  const inputs = await receiptInfo(paymentId);
  var aInvs = inputs[0].erp_invs;
  var aInvAmt = aInvs.reduce((acc, cur) => acc + cur.amount, 0);

  inputs.forEach((input, i) => {
    const paidDate = input.payments[0].gateway === 'BSP' ? addBusinessDays('KR', '', input.payments[0].date, 1) : input.payments[0].date;
    console.log('\n====', input.payments[0].paymentid, 'paid on', format(paidDate, 'yyyy-MM-dd'), '==============================\n');
    const bankstmts = input.bankstmts;
    const erp_invs = aInvs.filter((inv) => inv.amount !== 0);
    const accounting = input.accounting;
    const feeEtcs = accounting.filter((info) => info.account !== 'assets:checking');
    // const invSum = erp_invs.reduce((acc, cur) => acc + cur.amount, 0);
    console.log('bankstmts:', bankstmts);
    console.log('erp_invs:', erp_invs);
    console.log('accounting:', accounting);
    // console.log('invoice total:', invSum); 

    var aReceipt = accounting.reduce((acc, cur) => acc + cur.amount, 0);
    var aFeeEtc = feeEtcs.reduce((acc, cur) => acc + cur.amount, 0);

    var sq = 1;
    for (let bankstmt of bankstmts) {
      console.log(`\n-------------- bankstmt-${sq} ---------------`);
      var aBankstmt = bankstmt.dramt;
      console.log('aBankstmt:', aBankstmt, 'aReceipt:', aReceipt, `aErpInv${input.payments[0].gateway === 'JINAIR' ? '(ON+OFF)' : ''}:`, aInvAmt, '\n');

      var i = 1;
      for (let inv of erp_invs) {

        if (aReceipt === 0 || aInvAmt <= 0 || aBankstmt === 0) {
          break;
        }

        if (aFeeEtc > 0) {
          // all fee & etc should be processed upfront
          for (let feeEtc of feeEtcs) {       
            console.log('receipt-0:', inv.reference, `(${feeEtc.account})`, feeEtc.amount);

            // update state
            aFeeEtc -= feeEtc.amount;
            aInvAmt -= feeEtc.amount;
            aReceipt -= feeEtc.amount;
          }
          console.log('aBankstmt:', aBankstmt, 'aReceipt:', aReceipt, 'aErpInv:', aInvAmt, '\n');
          expect(aFeeEtc).toEqual(0);
        }

        var receiptAmt = 0;
        if (inv.salerfnd === 'refund') {
          receiptAmt = inv.amount;
        } else if (inv.salerfnd === 'sale') {
          receiptAmt = Math.min(inv.amount, aBankstmt, aReceipt);
        }
        console.log(`recepit-${i}:`, inv.reference, `${inv.salerfnd === 'sale' ? '(AR)' : '(CM)'}`, receiptAmt);
        inv.amount -= receiptAmt;
        // update aInvs --> this is because available invoices should be lived during whole process
        aInvs = aInvs.map((el) => el.reference === inv.reference && el.salerfnd === inv.salerfnd ? inv : el);
        i++;
        // adjust current state
        aBankstmt -= receiptAmt;
        aInvAmt -= receiptAmt;
        aReceipt -= receiptAmt;

        console.log('aBankstmt:', aBankstmt, 'aReceipt:', aReceipt, 'aErpInv:', aInvAmt, '\n');
      }

      sq++;
      if (aReceipt === 0 || aInvAmt <= 0) {
        break;
      }
      if (aBankstmt === 0) {
        continue;
      }

      expect(aBankstmt).toBeGreaterThanOrEqual(0);
    }
    
    expect(aReceipt).toEqual(0);
    expect(aInvAmt).toBeGreaterThanOrEqual(0);  
  });
});