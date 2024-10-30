import { expect, type Locator, type Page} from '@playwright/test';
import { Bankstmt, Payment, receiptMethod } from '../src/util';

export class LoginPage {
    readonly page: Page;
    readonly url: string = 'https://efuw-test.login.ap1.oraclecloud.com/oam/server/obrareq.cgi?encquery%3D6WCyLRXvhwVMe3eiUPKml1r2nqvBvwJLMLvnrjMNnp8I4NTVzjnPcXK88iXu42Uwvxa8qH1g8DIuQhXfxGlColqZ%2FitlNGLYUzzt5B3FsYyTrqCR9lFPEaz20aEjiblP1ZuvdmBXW3H3PKkLGpHtNdfT%2FTmgz5mNEYbIaHWj7qA%2B0zg8LetIS%2FFv2zGaq3VtvjCc19YoJAmnrRhEN4U%2BFuBRfgz2VVDSsPV1COqO4r877Skp4soTihOHZvfbgozKIrYr9j2VwhfPTBS2s8HigQ5QaB4vA7%2FEy7aGY0vmiPQUzBVapstXPTfc98i09mTifbxHmikhbIoRQG8yjHtPRCFc1k8CtC2%2BviFDNpH93xrCaJthr9BmNvWM%2F%2B4i9JcD2vkSX%2Bl%2BqdLwpXQeKh2y0q0VCZU55KYgy75ZXEPHLwz7e6XRcbxhQUplqph5X4aamTypa0OlZ6LvyYsX%2BxlVTvua7UItfTOClQjx7VyE7NiS8530ZgdJLhvqdSueb8TQXe4cVPSPTzbLwfmIWxCKTA%3D%3D%20agentid%3DOraFusionApp_11AG%20ver%3D1%20crmethod%3D2%26cksum%3Dda3caecb50e6d996c954c8b4a682693206ca756e&ECID-Context=1.005anIGDpzaC8xVpm0d9iZ0002CM0002O%5E%3BkXhgv0ZCLILIGVAPnJPRLPJBXKQP1LSTcLQRoPROXKTQjUO'
    readonly idInputBox: Locator;
    readonly passwordInputBox: Locator;
    readonly loginButton: Locator;

    constructor(page: Page) {
        this.page = page;
        this.idInputBox = this.page.getByPlaceholder('User ID');
        this.passwordInputBox = this.page.getByPlaceholder('Password');
        this.loginButton = this.page.getByRole('button', { name: 'Sign In' })
    }

    async login() {
        await this.page.goto(this.url);
        await this.idInputBox.fill(process.env.ERP_ID || '');
        await this.passwordInputBox.fill(process.env.ERP_PASSWORD || '');
        await this.loginButton.click();
        await expect(this.page.locator('h1')).toContainText('Cloud');
    }

    async moveToManageReceipts() { 
        await this.page.getByRole('link', { name: 'Receivables' }).click();
        await this.page.getByRole('link', { name: 'Accounts Receivable' }).click();
        await this.page.getByRole('link', { name: 'Tasks' }).click();
        await this.page.getByRole('link', { name: 'Manage Receipts' }).click();
        await expect(this.page.getByRole('heading', { name: 'Manage Receipts' })).toBeVisible();
    }
}