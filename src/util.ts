import { addBusinessDays, format } from 'date-fns';
import { pool } from './db'
import combinations from 'combinations'

export interface Payment {
    gateway: string, 
    settleco: string, 
    paymentid: string, 
    date: Date, 
    amount:number
}

export interface Bankstmt {
    accountno: string, 
    settleco: string, 
    trxdate: string,
    ccy: string, 
    dramt: number
}
  
export interface PayAndBank {
    payment: Payment,
    payments: Payment[],
    bankstmts: Bankstmt[]
}

export interface MatchedPayAndBank {
    payments: Payment[],
    bankstmts: Bankstmt[]
}

export interface ErpInv {
    acctdate: string,
    customer: string,
    ccy: string,
    salerfnd: string,
    reference: string,
    amount: number,
    krwamt: number
}
  
export interface Accounting {
    paymentid: string,
    date: string,
    account: string,
    ccy: string,
    amount: number,
}
  
export interface ReceiptInfo {
    payments: Payment[],
    bankstmts: Bankstmt[],
    erp_invs: ErpInv[],
    accounting: Accounting[]
}
  
function allPaymentCombinations (checking: number, checkings: number[]): number[][] {
    var c = combinations(checkings, 1);
    return c.filter((el) => el.includes(checking));
}

// extract concerned bankstatements with checking amt of a PaymentID in ledger table
export function matchPaymentsWithBankstatements (checking: number, checkings: number[], statements: number[]): number[][] {
    // find payment combinations including the checking amount
    const ps = allPaymentCombinations(checking, checkings);
    // find bankstatement combinations with 1 or 2 bankstatements
    const bs = combinations(statements, 1, 2);

    const result = ps.map((el) => {
        const paySum = el.reduce((acc, curr) => acc + curr, 0);
        // filter bankstatements with sum equal to payment sum
        const bs1 = bs.filter((el) => el.reduce((acc, curr) => acc + curr, 0) === paySum);
        if (bs1.length > 0) {
            return [el, bs1[0]];
        } else {
            return null;
        }
    }).filter((el) => el !== null);

    return result[0];
}

// info for a paymentID
export async function getPayInfo(paymentId: string): Promise<Payment[]>{
    const query = {
        text: `
        select gateway, settleco, paymentid, date, amount::float8
        from ledger l 
        where paymentid = $1 and account = 'assets:checking'`,
        values: [paymentId]
    }
    
    try {
        const result = await pool.query(query);
        return result.rows;
    } catch (e) {
      console.error(e.stack);
    } 
    return [] as Payment[];
}

// payments paid on a same day with a payment
export async function paymentsInfo(p: Payment): Promise<Payment[]>{
    // const date = format(p.date, 'yyyy-MM-dd')
    const query = {
        text: `
        select gateway, settleco, paymentid, date, amount::float8
        from ledger l 
        where gateway = $1 and settleco = $2 and date = $3 and account = 'assets:checking'`,
        values: [p.gateway, p.settleco, p.date]
    }
    
    try {
        const result = await pool.query(query);
        var infos = result.rows;
        infos.forEach((info) => {info.date = format(info.date, 'yyyy-MM-dd')})
        return infos;
    } catch (e) {
      console.error(e.stack);
    } 
    return []
}

export async function bankstmtsInfo(p: Payment): Promise<Bankstmt[]>{
    var query
    // no settleco info when gateway is BSP
    if (p.gateway === 'BSP') {
        const nextBusinessDate = addBusinessDays(p.date, 1)
        query = {
        text: `select accountno, '' settleco, trxdate, ccy, dramt::float8
            from bankstmt
            where accountno = $1 and trxdate = $2 and dramt > 0`,
        values: ['630-006859-038', nextBusinessDate]
        }
    } else {
        query = {
        text: `
            select accountno, settleco, trxdate, ccy, dramt::float8
            from bankstmt
            where settleco = $1 and trxdate = $2`,
        values: [p.settleco, p.date]
        }
    }
    
    try {
        const result = await pool.query(query);
        var infos = result.rows;
        infos.forEach((info) => {info.trxdate = format(info.trxdate, 'yyyy-MM-dd')})
        return infos;
    } catch (e) {
      console.error(e.stack);
    } 
    return []
}

export async function payAndBankInfo(p: Payment): Promise<PayAndBank>{
    const ps = await paymentsInfo(p)
    const bs = await bankstmtsInfo(p)
    return {
      payment: p,
      payments: ps,
      bankstmts: bs
    }
}

export async function matchedPayAndBankInfo(p: Payment): Promise<MatchedPayAndBank>{
    const info = await payAndBankInfo(p);
    
    if (info.payment.gateway === 'BSP') {
        return {
            payments: [info.payment],
            bankstmts: info.bankstmts
        }
    }

    const checking = info.payment.amount;
    const checkings = info.payments.map((el) => el.amount);
    const statements = info.bankstmts.map((el) => el.dramt);
    console.log(checking, checkings, statements);
    const result = matchPaymentsWithBankstatements(checking, checkings, statements);

    const rs = result ? result[0] : [];
    const bs = result ? result[1] : [];
    const rs1 = rs.map((el) => info.payments.filter((el1) => el1.amount === el)[0]);
    const bs1 = bs.map((el) => info.bankstmts.filter((el1) => el1.dramt === el)[0]);
    return {
        payments: rs1,
        bankstmts: bs1
    }
}

export async function invInfo(payments: Payment[]): Promise<ErpInv[]>{
    
    var query = {}
    const p = payments[0]  
    if (p.gateway === 'BSP') {
        query = {
            text: `
            select acctdate, customer, ccy, salerfnd, reference, amount, krwamt
            from erp_inv
            where reference in (
                select distinct substr(reference, 1, 12) as reference
                from ledger
                where paymentid = $1 and description like '%${p.paymentid}%' and account = 'assets:ar:ccar'
            )`,
            values: [p.paymentid]
        }
    } else if (p.gateway === 'SP') {
        const pids = payments.map((payment) => payment['paymentid'])
        const datesClause = pids.map((pid) => "'" + pid.substring(6) + "' :: date").join(', ')
        query = {
          text: `
          select acctdate, customer, ccy, salerfnd, reference, amount, krwamt
          from erp_inv
          where acctdate in (${datesClause}) 
            and substr(reference, 1, 2) = $1`,
          values: [p.settleco]
        }
    } else if (p.gateway === 'JINAIR') {
        // on, off invoices are megred in case of LJ
        query = {
          text: `
          select acctdate, customer, ccy, salerfnd, reference, amount, krwamt
          from erp_inv
          where reference in (
            select distinct substr(reference, 1, 11) as reference
            from ledger
            where paymentid = $1 and account = 'assets:ar:ccar'
          )`,
          values: [p.paymentid]
        }
    } 
    
    try {
        const result = await pool.query(query);
        var infos = result.rows;
        infos.forEach((info) => {
            info.acctdate = format(info.acctdate, 'yyyy-MM-dd')
            info.amount = parseFloat(info.amount)
            info.krwamt = parseFloat(info.krwamt)
        })
        return infos;
    } catch (e) {
      console.error(e.stack);
    } 
    return []
}
  
export async function accountingInfo(payments: Payment[]): Promise<Accounting[]>{
    
    const p = payments[0]  
    const pids = payments.map((payment) => payment['paymentid'])
    const param = pids.map((pid) => `'${pid}'`).join(', ')
    const query = {
        text: `
            select paymentid, date, account, ccy, amount::float8
            from ledger l 
            where account not in ('clearing:ccar', 'assets:ar:ccar', 'assets:ar:cccm') 
                and date = $1
                and paymentid in (${param})`,
        values: [p.date]
    }

    try {
        const result = await pool.query(query);
        var infos = result.rows;
        infos.forEach((info) => {info.date = format(info.date, 'yyyy-MM-dd')})
        return infos;
    } catch (e) {
        console.error(e.stack);
    } 
    return []
}

// return data length: BSP 1, SP 1, JINAIR 1 or 2 
export async function receiptInfo(paymentId: string): Promise<ReceiptInfo[]>{
    const chekings: Payment[] = await getPayInfo(paymentId)
    const receipts: ReceiptInfo[] = []

    for (let checking of chekings) {
        const info = await matchedPayAndBankInfo(checking)
        const erp_inv = await invInfo(info.payments)
        const acct_info = await accountingInfo(info.payments)

        receipts.push({
            payments: info.payments,
            bankstmts: info.bankstmts,
            erp_invs: erp_inv,
            accounting: acct_info
        })
    }
    return receipts;
}

export function receiptMethod(p: Payment): string {
    var method = ''
    if (p.gateway === 'JINAIR') {
        method = 'KEB HANA BANK_KRW_R_5031'
    } else if (p.gateway === 'SP') {
        method = 'KEB HANA BANK_KRW_R_5009'
    } else if (p.gateway === 'BSP') {
        method = 'KEB HANA BANK_KRW_R_9038'
    } 
    return method
}

export function getWriteOffAccount(info: Accounting): string {
    var writeOff = ''
    if (info.account == 'expenses:ccfee') {
        const gateway = info.paymentid.split('_')[1]
        if (gateway === 'SP') {
            writeOff = '간편결제수수료' 
        } else {
            writeOff = 'Credit Card Fee'
        }
    } else if (info.account == 'expenses:salesdisc') {
        writeOff = '매출할인'
    } else if (info.account == 'clearing:ar_payment') {
        writeOff = 'AR Payment_Clearing'
    } 
    return writeOff
}