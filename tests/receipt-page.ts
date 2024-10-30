import { expect, type Locator, type Page} from '@playwright/test';
import { Accounting, Bankstmt, ErpInv, getWriteOffAccount, Payment, receiptMethod } from '../src/util';
import { ok } from 'assert';

export class ReceiptPage {
    readonly page: Page;
    readonly bs: Bankstmt;
    readonly p: Payment;
    
    constructor(page: Page, bs: Bankstmt, p: Payment) {
        this.page = page;
        this.bs = bs;
        this.p = p;
    }

    async selectPayment() {
        const searchButton = this.page.getByRole('button', { name: 'Search', exact: true });
        const dateInput = this.page.getByPlaceholder('yyyy-mm-dd');
        const methodInput = this.page.getByLabel('Receipt Method');

        const searchFormOpened = await searchButton.isVisible();
        if (!searchFormOpened) {
            await this.page.getByTitle('Expand Search').click();
            await expect(searchButton).toBeVisible();
        }

        const amtPattern = this.bs.dramt.toLocaleString() + this.bs.ccy;
        const method = receiptMethod(this.p);

        await dateInput.fill(this.bs.trxdate);
        await methodInput.fill(method);
        await searchButton.click();
        
        await this.page.getByRole('row')
            .filter({ hasText: amtPattern })
            .getByRole('link', { name: 'LJ_RCPT' })
            .press('Enter');  // click() does not work here!!!

        await expect(this.page.getByRole('heading', { name: 'Receipt Information' })).toBeVisible();
    }

    async setCustomer(customer: string) {
        await this.page.getByLabel('Customer Account Number').click();
        await this.page.getByLabel('Customer Account Number').fill(customer);
        await this.page.getByLabel('Customer Account Number').press('Tab');
        await expect(this.page.getByRole('button', { name: 'Add Open Receivables' })).toBeVisible();
    }

    async writeOff(feeEtc: Accounting) {
        const wrAcct = getWriteOffAccount(feeEtc);
        if (wrAcct === '') {
            return;
        }
        await this.page.getByRole('link', { name: 'Actions' }).nth(1).click();
        await this.page.getByText('More', { exact: true }).click();
        await this.page.getByText('Create Write-Off').click();
        await expect(this.page.getByRole('button', { name: 'OK' })).toBeVisible();
        
        // todo: check this line of code
        await this.page.keyboard.press('Shift+End')
        await this.page.keyboard.type(feeEtc.amount.toLocaleString());
        await this.page.keyboard.press('Tab');

        // await this.page.locator("xpath=//label[.='Write-Off Amount']/following::input")[0].fill(feeEtc.amount.toLocaleString());

        await this.page.getByTitle('Search: Receivables Activity').click();
        await this.page.getByRole('link', { name: 'Search...' }).click();
        await this.page.getByLabel('Name', { exact: true }).fill(wrAcct);
        await this.page.getByRole('button', { name: 'Search', exact: true }).click();

        await this.page.getByRole('cell', { name: wrAcct }).nth(1).click();
        await this.page.getByRole('button', { name: 'OK' }).nth(1).click();

        // await okButton.click();
        // await this.page.keyboard.press('Alt+KeyK');
        await this.page.getByRole('button', { name: 'OK' }).first().click();
        await expect(this.page.getByLabel('Applied Amount').first()).toHaveValue(feeEtc.amount.toLocaleString());
    }

    async addOpenReceivables(inv: ErpInv, receiptAmt: number) {
        // Add open receivables ----------------------------------- 
        await this.page.getByRole('button', { name: 'Add Open Receivables', exact: true }).click();
        expect(this.page.getByRole('button', { name: 'Add', exact: true })).toBeVisible();

        // check search form is opened
        const searchButton = this.page.getByRole('button', { name: 'Search', exact: true });
        const searchFormOpened = await searchButton.isVisible();
        if (!searchFormOpened) {
            await this.page.getByTitle('Expand Search: Transactions').click();
            await expect(searchButton).toBeVisible();
        }

        const dateInputs = this.page.getByPlaceholder('yyyy-mm-dd');
        await dateInputs[4].fill(inv.acctdate);  // From Transaction Due Date
        await dateInputs[5].fill(inv.acctdate);  // To Transaction Due Date
        // await this.page.locator("xpath=//label[.='From Transaction Due Date']/following::input[@placeholder='yyyy-mm-dd'][1]").fill(inv.acctdate);
        // await this.page.locator("xpath=//label[.='To Transaction Due Date']/following::input[@placeholder='yyyy-mm-dd'][1]").fill(inv.acctdate);
        await this.page.getByText('Include Credit Memos').click();
        await searchButton.click();
        await expect(this.page.getByRole('button', { name: 'Add', exact: true })).toBeVisible();

        // select invoice
        await this.page.getByText(inv.amount.toLocaleString()).click();
        await this.page.getByRole('button', { name: 'Add', exact: true }).click();
        await this.page.getByRole('button', { name: 'Done' }).click();

        // edit applied amount
        await this.page.getByRole('cell', { name: `${inv.amount.toLocaleString()} Applied Amount` }).fill(receiptAmt.toLocaleString());
        await this.page.keyboard.press('Tab');
    }

    async saveAndClose() {
        this.page.getByRole('button', { name: 'Save', exact: true }).click();
        // this.page.getByRole('button', { name: 'Done', exact: true }).click();
    }
}