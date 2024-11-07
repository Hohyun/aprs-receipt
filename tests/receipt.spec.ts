import { test, expect, type Page, Locator } from '@playwright/test';
import { Accounting, accountingInfo, Bankstmt, Payment, receiptInfo, receiptMethod, getWriteOffAccount, ErpInv, mergeCmInv } from '../src/util';
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
      var aInvAmt: number;

      for (let input of inputs) {
        aInvAmt = aInvs.reduce((acc, cur) => acc + cur.amounts.reduce((acc1, cur) => acc1 + cur, 0), 0);
        
        const paidDate = input.payments[0].gateway === 'BSP' ? addBusinessDays('KR', '', input.payments[0].date, 1) : input.payments[0].date;
        console.log('\n====', input.payments[0].paymentid, 'paid on', format(paidDate, 'yyyy-MM-dd'), '==============================\n');

        const bankstmts = input.bankstmts;
        const erp_invs = aInvs.filter((inv) => inv.amounts.reduce((acc, cur) => acc+cur, 0) !== 0);
        const accounting = input.accounting;
        const feeEtcs = accounting.filter((info) => info.account !== 'assets:checking');
        console.log('bankstmts:', bankstmts);
        console.log('erp_invs:', erp_invs);
        console.log('accounting:', accounting);

        var aReceipt = accounting.reduce((acc, cur) => acc + cur.amount, 0);
        var aFeeEtc = feeEtcs.reduce((acc, cur) => acc + cur.amount, 0);

        var rp: ReceiptPage;
        var paymentSearchFormExpanded = true;
        for (let bankstmt of bankstmts) {
          console.log(`\n-------------- bankstmt ${bankstmt.trxdate} ${bankstmt.dramt.toLocaleString()} ---------------`);
          var aBankstmt = bankstmt.dramt;
          console.log('aBankstmt:', aBankstmt.toLocaleString(), 'aReceipt(accounting):', aReceipt.toLocaleString(), `aErpInv${input.payments[0].gateway === 'JINAIR' ? '(ON+OFF)' : ''}:`, aInvAmt.toLocaleString(), '\n');

        
          rp = new ReceiptPage(page, bankstmt, input.payments[0], paymentSearchFormExpanded);
          await rp.selectPayment();
          await rp.setCustomer(erp_invs[0].customer);
          

          var inv_sq = 0;
          var invoiceSearchFormExpanded = true;
          var searchButton: Locator;
          var appliedInput: Locator;
          for (let inv of erp_invs) {

            if (aReceipt === 0 || aInvAmt <= 0 || aBankstmt === 0) {
              break;
            }

            // rp.addOpenReceivables(inv, receiptAmt);  --> I don't know why this is not working
          
            await page.getByRole('button', { name: 'Add Open Receivables', exact: true }).click();
            expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible();

            // check search form is opened
            searchButton = page.getByRole('button', { name: 'Search', exact: true });
            if (!invoiceSearchFormExpanded) {
              await page.getByTitle('Expand Search: Transactions').click();
              await expect(searchButton).toBeVisible();
            }

            await page.locator("xpath=//label[.='From Transaction Due Date']/following::input[@placeholder='yyyy-mm-dd'][1]").fill(inv.acctdate);
            await page.locator("xpath=//label[.='To Transaction Due Date']/following::input[@placeholder='yyyy-mm-dd'][1]").fill(inv.acctdate);
            await page.getByText('Include Credit Memos').click();
            await searchButton.click();
            await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeVisible();

            var receiptAmts: number[] = [];
            var appliedAmts: number[] = [];

            for (let i = 0 ; i < inv.amounts.length; i++) {
            // inv.amounts.forEach(async (amt, i) => {
              // select invoice
              var receiptAmt = 0;
              var appliedAmt = 0;
              const invAmt = inv.amounts[i];
              if (invAmt < 0) {  // CM case
                appliedAmt = invAmt;
                receiptAmt = invAmt;    
                console.log(inv.reference, '(CM)', receiptAmt.toLocaleString() + ' (applied: ' + appliedAmt.toLocaleString() + ')');        
              } else {        // Invoice Memo case
                appliedAmt = Math.min(invAmt, aBankstmt, aReceipt);
                receiptAmt = Math.min(invAmt, aBankstmt + aFeeEtc, aReceipt);
                console.log(inv.reference, '(AR)', receiptAmt.toLocaleString() + ' (applied: ' + appliedAmt.toLocaleString() + ')');
                inv_sq++;
              }

              await page.getByRole('cell', { name: `${invAmt.toLocaleString()} ${inv.ccy}`, exact: true }).click();
              await page.getByRole('button', { name: 'Add', exact: true }).click();
              
              receiptAmts.push(receiptAmt);
              appliedAmts.push(appliedAmt);

              inv.amounts[i] -= receiptAmt;
              aInvs = aInvs.map((el) => el.reference === inv.reference && el.acctdate === inv.acctdate ? inv : el);

              aBankstmt -= appliedAmt;
              aInvAmt -= receiptAmt;
              aReceipt -= appliedAmt;
              console.log('aBankstmt:', aBankstmt.toLocaleString(), 'aReceipt(accounting):', aReceipt.toLocaleString(), `aErpInv${input.payments[0].gateway === 'JINAIR' ? '(ON+OFF)' : ''}:`, aInvAmt.toLocaleString(), '\n');
            }
            await page.getByRole('button', { name: 'Done', exact: true }).click();
            
            for (let i = 0; i < receiptAmts.length; i++) {
              console.log('edit applied:', 'appliedAmt:', appliedAmts[i].toLocaleString(), ' --> receiptAmt', receiptAmts[i].toLocaleString() );
              
              // edit applied amount
              appliedInput = await page.getByRole('cell', { name: `${appliedAmts[i].toLocaleString()} Applied Amount`, exact: true })
              await appliedInput.click();
              await page.keyboard.press('Home')
              await page.keyboard.press('Shift+End')
              await page.keyboard.type(receiptAmts[i].toLocaleString());
              await page.keyboard.press('Tab');
            }

            if (inv_sq === 1 && aFeeEtc > 0) {
              for (let feeEtc of feeEtcs) {     

                await rp.writeOff(feeEtc)
                
                console.log(inv.reference, `(${feeEtc.account})`, feeEtc.amount.toLocaleString());
                aFeeEtc -= feeEtc.amount;
                aReceipt -= feeEtc.amount;
              }
              console.log('aBankstmt:', aBankstmt.toLocaleString(), 'aReceipt(accounting):', aReceipt.toLocaleString(), `aErpInv${input.payments[0].gateway === 'JINAIR' ? '(ON+OFF)' : ''}:`, aInvAmt.toLocaleString(), '\n');
              expect(aFeeEtc).toEqual(0);
            }
            invoiceSearchFormExpanded = false;
          }

          await page.getByRole('button', { name: 'Save and Close', exact: true }).click();
          await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeVisible();

          paymentSearchFormExpanded = false
          
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


test('invoice test', async () => {
  const paymentId = 'NK_SP_20240731';
  const inputs = await receiptInfo(paymentId);
  var invInfos = inputs[0].erp_invs;
  console.log('invInfos:', invInfos);
});


test('dummy test', async () => {
  console.log('dummy test');

  // const paymentId = 'SW_LJ_OFF_20230825';
  // const paymentId = 'HD_BSP_20240903';
  const paymentId = 'TP_SP_20240731';
  const inputs = await receiptInfo(paymentId);  // 1 input per paid date

  var aInvs = inputs[0].erp_invs;   // erp_invs are same for all inputs
  var aInvAmt: number;
  
  inputs.forEach((input, i) => {
    aInvAmt = aInvs.reduce((acc, cur) => acc + cur.amounts.reduce((acc1, cur) => acc1 + cur, 0), 0);

    const paidDate = input.payments[0].gateway === 'BSP' ? addBusinessDays('KR', '', input.payments[0].date, 1) : input.payments[0].date;
    console.log('\n====', input.payments[0].paymentid, 'paid on', format(paidDate, 'yyyy-MM-dd'), '==============================\n');
    const bankstmts = input.bankstmts;
    const erp_invs = aInvs.filter((inv) => inv.amounts.reduce((acc, cur) => acc+cur, 0) !== 0);
    const accounting = input.accounting;
    const feeEtcs = accounting.filter((info) => info.account !== 'assets:checking');
    // const invSum = erp_invs.reduce((acc, cur) => acc + cur.amount, 0);
    console.log('bankstmts:', bankstmts);
    console.log('erp_invs:', erp_invs);
    console.log('accounting:', accounting);
    // console.log('invoice total:', invSum); 

    var aReceipt = accounting.reduce((acc, cur) => acc + cur.amount, 0);
    var aFeeEtc = feeEtcs.reduce((acc, cur) => acc + cur.amount, 0);

    for (let bankstmt of bankstmts) {
      console.log(`\n-------------- bankstmt ${bankstmt.trxdate} ${bankstmt.dramt.toLocaleString()} ---------------`);
      var aBankstmt = bankstmt.dramt;

      console.log('aBankstmt:', aBankstmt.toLocaleString(), 'aReceipt(accounting):', aReceipt.toLocaleString(), `aErpInv${input.payments[0].gateway === 'JINAIR' ? '(ON+OFF)' : ''}:`, aInvAmt.toLocaleString(), '\n');

      var inv_sq = 0;
      
      for (let inv of erp_invs) {

        if (aReceipt === 0 || aInvAmt <= 0 || aBankstmt === 0) {
          break;
        }

        var receiptAmts: number[] = [];
        var appliedAmts: number[] = [];

        for (let i = 0; i < inv.amounts.length; i++) {
        // inv.amounts.forEach((amt, i) => {
        // for (let amt of inv.amounts) {
          var receiptAmt = 0;
          var appliedAmt = 0;
          const invAmt = inv.amounts[i];
          if (invAmt < 0) {
            appliedAmt = invAmt;
            receiptAmt = invAmt;
            console.log(inv.reference, '(CM)', receiptAmt.toLocaleString() + ' (applied: ' + appliedAmt.toLocaleString() + ')');
          } else {
            appliedAmt = Math.min(invAmt, aBankstmt, aReceipt);
            receiptAmt = Math.min(invAmt, aBankstmt + aFeeEtc, aReceipt);
            console.log(inv.reference, '(AR)', receiptAmt.toLocaleString() + ' (applied: ' + appliedAmt.toLocaleString() + ')');
            inv_sq++;
          }
          receiptAmts.push(receiptAmt);
          appliedAmts.push(appliedAmt);

          inv.amounts[i] -= receiptAmt;
          aInvs = aInvs.map((el) => el.reference === inv.reference && el.acctdate === inv.acctdate ? inv : el);
        
          // adjust current state
          aBankstmt -= appliedAmt;
          aInvAmt -= receiptAmt;
          aReceipt -= appliedAmt;

          console.log('aBankstmt:', aBankstmt.toLocaleString(), 'aReceipt(accounting):', aReceipt.toLocaleString(), `aErpInv${input.payments[0].gateway === 'JINAIR' ? '(ON+OFF)' : ''}:`, aInvAmt.toLocaleString(), '\n');
        }

        for (let i = 0; i < receiptAmts.length; i++) {
          console.log('edit applied:', 'appliedAmt:', appliedAmts[i].toLocaleString(), ' --> receiptAmt', receiptAmts[i].toLocaleString() );
        }

        if (inv_sq === 1 && aFeeEtc > 0) {
          // all fee & etc will be accounted to the first invoice
          for (let feeEtc of feeEtcs) {       
            console.log(inv.reference, `(${feeEtc.account})`, feeEtc.amount.toLocaleString());

            // update state
            aFeeEtc -= feeEtc.amount;
            aReceipt -= feeEtc.amount;
          }
          console.log('aBankstmt:', aBankstmt.toLocaleString(), 'aReceipt(accounting):', aReceipt.toLocaleString(), `aErpInv${input.payments[0].gateway === 'JINAIR' ? '(ON+OFF)' : ''}:`, aInvAmt.toLocaleString(), '\n');
          expect(aFeeEtc).toEqual(0);
        }
      }

      
      if (aFeeEtc === 0 && (aReceipt === 0 || aInvAmt <= 0)) {
        break;
      }
      if (aBankstmt === 0) {
        continue;
      }

      expect(aBankstmt + aFeeEtc).toBeGreaterThanOrEqual(0);
    }
    
    expect(aReceipt).toEqual(0);
    expect(aInvAmt).toBeGreaterThanOrEqual(0);  
  });

  console.log('remaining aInvs:', aInvs);
});
