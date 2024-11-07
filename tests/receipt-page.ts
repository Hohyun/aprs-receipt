import { expect, type Locator, type Page} from '@playwright/test';
import { Accounting, Bankstmt, ErpInv, getWriteOffAccount, Payment, receiptMethod } from '../src/util';

export class ReceiptPage {
    readonly page: Page;
    readonly bs: Bankstmt;
    readonly p: Payment;
    readonly searchFormExpanded: boolean;
    
    constructor(page: Page, bs: Bankstmt, p: Payment, searchFormExpanded: boolean) {
        this.page = page;
        this.bs = bs;
        this.p = p;
        this.searchFormExpanded = searchFormExpanded;
    }

    async selectPayment() {
        const searchButton = this.page.getByRole('button', { name: 'Search', exact: true });
        const dateInput = this.page.getByPlaceholder('yyyy-mm-dd');
        const methodInput = this.page.getByLabel('Receipt Method');
        if (!this.searchFormExpanded) {
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
        await expect(this.page.getByRole('button', { name: 'Add Open Receivables', exact: true })).toBeVisible();
    }

    async writeOff(feeEtc: Accounting) {
        const feeEtcAmt = feeEtc.amount * -1;
        const wrAcct = getWriteOffAccount(feeEtc);
        if (wrAcct === '') {
            return;
        }
        await this.page.getByRole('link', { name: 'Actions' }).nth(1).click();
        await this.page.getByText('More', { exact: true }).click();
        await this.page.getByText('Create Write-Off').click();
        await expect(this.page.getByRole('button', { name: 'OK' })).toBeVisible();
        
        await this.page.keyboard.press('Shift+End')
        await this.page.keyboard.type(feeEtcAmt.toLocaleString());
        await this.page.keyboard.press('Tab');

        await this.page.getByTitle('Search: Receivables Activity').click();
        await this.page.getByRole('link', { name: 'Search...' }).click();
        await this.page.getByLabel('Name', { exact: true }).fill(wrAcct);
        await this.page.getByRole('button', { name: 'Search', exact: true }).click();

        await this.page.getByRole('cell', { name: wrAcct }).nth(1).click();
        await this.page.getByRole('button', { name: 'OK' }).nth(1).click();

        await this.page.getByRole('button', { name: 'OK' }).first().click();
        await expect(this.page.getByLabel('Applied Amount').first()).toHaveValue(feeEtcAmt.toLocaleString());
    }

}