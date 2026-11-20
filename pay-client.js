window.IvettaPay = (function () {
  'use strict';
  function base() { return (localStorage.getItem('ivetta_pay_base') || '').replace(/\/$/, ''); }
  function mode() { return base() ? 'backend' : 'mock'; }
  async function post(path, obj) {
    const r = await fetch(base() + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
    if (!r.ok) throw new Error('server_' + r.status);
    return r.json();
  }
  async function get(path) {
    const r = await fetch(base() + path);
    if (!r.ok) throw new Error('server_' + r.status);
    return r.json();
  }
  function mockPay(card) {
    return new Promise(res => setTimeout(() => {
      const d = String(card.number || '').replace(/\D/g, '');
      if (d === '4111111111111111') res({ ok: true, mode: 'mock', license: { key: 'IVETTA-MOCK-' + d.slice(-4), issuedAt: Date.now(), amount: 399, last4: d.slice(-4) } });
      else if (d === '4000000000000002') res({ ok: false, mode: 'mock', error: 'declined' });
      else res({ ok: false, mode: 'mock', error: 'invalid' });
    }, 900));
  }
  async function pay(card) {
    if (!base()) return mockPay(card);
    const idem = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
    const created = await post('/api/pay/create', { amount: 399, idempotenceKey: idem, description: 'Ivetta PDD — пожизненный доступ' });
    if (created.redirect_url) return { ok: false, redirect: true, url: created.redirect_url, id: created.id, mode: 'backend' };
    const conf = await post('/api/pay/confirm', { paymentId: created.id, card: card });
    if (conf.status !== 'succeeded') return { ok: false, mode: 'backend', error: conf.status };
    return { ok: true, mode: 'backend', license: conf.license };
  }
  function status(id) { return get('/api/pay/' + id); }
  async function resume() {
    const u = new URLSearchParams(location.search);
    const id = u.get('id') || u.get('orderId');
    if (!id || !base()) return null;
    try {
      const s = await status(id);
      return { ok: s.status === 'succeeded', status: s.status, license: s.license, id: id };
    } catch (e) { return { ok: false, status: 'network', id: id }; }
  }
  return { pay: pay, status: status, resume: resume, mode: mode, base: base };
})();