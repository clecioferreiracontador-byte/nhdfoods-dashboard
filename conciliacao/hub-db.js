/* Base local do Hub Contábil (IndexedDB do navegador, nada é publicado).
   Guarda os lançamentos do razão importados no Book de conciliação; o dashboard usa a mesma base
   para abrir os lançamentos das linhas da DRE.
   lanc: {conta, mes:'aaaa-mm', data:'aaaa-mm-dd', hist, doc, cp, fil, deb, cred}
   meta: 'razao' -> {agg:{mes:{conta:{d,c,n}}}, saldoAnt:{mes:{conta:valor}}, desc:{conta:descr}, arquivos:[...]}
         'balancete:aaaa-mm' -> {contas:{conta:{desc,sa,d,c,sf}}, book:{conta:{obs,status,dif,ref}}, origem} */
(function(){
  const NOME = 'audicon-hub', VER = 1;
  let dbp = null;
  function db(){
    if (dbp) return dbp;
    dbp = new Promise((ok, err) => {
      const rq = indexedDB.open(NOME, VER);
      rq.onupgradeneeded = () => {
        const d = rq.result;
        if (!d.objectStoreNames.contains('lanc')){
          const s = d.createObjectStore('lanc', { keyPath: 'id', autoIncrement: true });
          s.createIndex('mes', 'mes'); s.createIndex('conta', 'conta');
        }
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
      };
      rq.onsuccess = () => ok(rq.result);
      rq.onerror = () => err(rq.error);
    });
    return dbp;
  }
  const req = r => new Promise((ok, err) => { r.onsuccess = () => ok(r.result); r.onerror = () => err(r.error); });
  const fim = t => new Promise((ok, err) => { t.oncomplete = () => ok(); t.onerror = () => err(t.error); t.onabort = () => err(t.error); });
  async function getMeta(k){ const d = await db(); return req(d.transaction('meta').objectStore('meta').get(k)); }
  async function setMeta(k, v){ const d = await db(); const t = d.transaction('meta', 'readwrite'); t.objectStore('meta').put(v, k); return fim(t); }
  async function delMeta(k){ const d = await db(); const t = d.transaction('meta', 'readwrite'); t.objectStore('meta').delete(k); return fim(t); }
  async function metaKeys(){ const d = await db(); return req(d.transaction('meta').objectStore('meta').getAllKeys()); }
  // substitui os lançamentos dos meses/contas presentes no arquivo e grava os novos
  async function gravarRazao(linhas, saldoAnt, desc, arquivo){
    const d = await db();
    const meses = [...new Set(linhas.map(l => l.mes))], contas = new Set(linhas.map(l => l.conta));
    let t = d.transaction('lanc', 'readwrite'); const st = t.objectStore('lanc'), ix = st.index('mes');
    meses.forEach(m => { ix.openCursor(IDBKeyRange.only(m)).onsuccess = e => { const c = e.target.result; if (!c) return; if (contas.has(c.value.conta)) c.delete(); c.continue(); }; });
    await fim(t);
    t = d.transaction('lanc', 'readwrite'); const st2 = t.objectStore('lanc'); linhas.forEach(l => st2.add(l)); await fim(t);
    const info = (await getMeta('razao')) || { agg: {}, saldoAnt: {}, desc: {}, arquivos: [] };
    meses.forEach(m => { info.agg[m] = info.agg[m] || {}; contas.forEach(c => { delete info.agg[m][c]; }); });
    linhas.forEach(l => { const a = (info.agg[l.mes][l.conta] = info.agg[l.mes][l.conta] || { d: 0, c: 0, n: 0 }); a.d += l.deb; a.c += l.cred; a.n++; });
    Object.keys(saldoAnt || {}).forEach(m => { info.saldoAnt[m] = Object.assign(info.saldoAnt[m] || {}, saldoAnt[m]); });
    Object.assign(info.desc, desc || {});
    info.arquivos = info.arquivos.filter(a => a.nome !== arquivo).concat([{ nome: arquivo, meses, contas: contas.size, linhas: linhas.length, em: new Date().toISOString() }]);
    await setMeta('razao', info);
    return { meses, contas: contas.size, linhas: linhas.length };
  }
  async function lancamentos(meses, filtro){
    const d = await db(); const ix = d.transaction('lanc').objectStore('lanc').index('mes'); const out = [];
    for (const m of meses){ const arr = await req(ix.getAll(IDBKeyRange.only(m))); arr.forEach(l => { if (!filtro || filtro(l)) out.push(l); }); }
    return out.sort((a, b) => a.data.localeCompare(b.data) || a.conta.localeCompare(b.conta) || (a.id - b.id));
  }
  // lançamentos de uma conta (usa o índice por conta: bem mais rápido que ler o mês inteiro)
  async function lancamentosConta(conta, meses){
    const d = await db(); const arr = await req(d.transaction('lanc').objectStore('lanc').index('conta').getAll(IDBKeyRange.only(conta)));
    return arr.filter(l => !meses || meses.includes(l.mes)).sort((a, b) => a.data.localeCompare(b.data) || (a.id - b.id));
  }
  async function limparRazao(){ const d = await db(); const t = d.transaction('lanc', 'readwrite'); t.objectStore('lanc').clear(); await fim(t); await delMeta('razao'); }
  window.HubDB = { getMeta, setMeta, delMeta, metaKeys, gravarRazao, lancamentos, lancamentosConta, limparRazao };
})();
