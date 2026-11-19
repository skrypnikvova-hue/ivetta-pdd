'use strict';
window.IvettaPayments = (function () {
  const MODE = 'mock';
  const PRICE = 399, CURRENCY = 'RUB';
  const TRIAL_DAYS = 3;
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const digits = s => String(s).replace(/\D/g, '');
  function luhn(num) {
    let sum = 0, alt = false;
    for (let i = num.length - 1; i >= 0; i--) {
      let d = +num[i];
      if (alt) { d *= 2; if (d > 9) d -= 9; }
      sum += d; alt = !alt;
    }
    return num.length >= 13 && sum % 10 === 0;
  }
  function validateCard(c) {
    const errors = {};
    const n = digits(c.number);
    if (!luhn(n)) errors.number = 'Проверь номер карты';
    const m = digits(c.exp);
    const mm = +m.slice(0, 2), yy = +m.slice(2, 4);
    const now = new Date(), cy = now.getFullYear() % 100, cm = now.getMonth() + 1;
    if (m.length !== 4 || mm < 1 || mm > 12 || yy < cy || (yy === cy && mm < cm)) errors.exp = 'Срок недействителен';
    if (digits(c.cvc).length < 3) errors.cvc = '3 цифры';
    return { ok: !Object.keys(errors).length, errors };
  }
  async function pay(card) {
    if (MODE === 'yookassa') return createPayment(card);
    await delay(1500);
    const n = digits(card.number);
    if (n === '4000000000000002') { const e = new Error('declined'); e.code = 'declined'; throw e; }
    if (!luhn(n)) { const e = new Error('invalid'); e.code = 'invalid_card'; throw e; }
    const rnd = () => Math.random().toString(36).slice(2, 6).toUpperCase();
    return { id: 'pay_' + Date.now().toString(36), key: 'IVETTA-' + rnd() + '-' + rnd(), issuedAt: Date.now(), amount: PRICE, currency: CURRENCY, last4: n.slice(-4), provider: 'mock' };
  }
  async function createPayment() { const e = new Error('backend_required'); e.code = 'backend_required'; throw e; }
  return { MODE, PRICE, CURRENCY, TRIAL_DAYS, luhn, validateCard, pay, digits };
})();