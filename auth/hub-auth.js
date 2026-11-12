/* Acesso ao Hub Contábil (NHD Foods) — login por e-mail e senha no Firebase.
   Os dados do painel (base da DRE/balanço/LALUR, agenda e mapa de vendas) ficam no Firestore,
   coleção "dados", e só abrem para quem está na coleção "acessos" (documento = e-mail em minúsculas,
   campos papel: 'admin' | 'cliente' e nome). As regras do Firestore garantem isso no servidor:
   este arquivo só desenha a tela e chama o Firebase.
   Fluxo: entrar → e-mail confirmado? → está em "acessos"? → libera o painel (window.__hubPronto). */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBJPNkF8_kvwlem6-niVzOT6PHM3DjsWcg',
  authDomain: 'hub-contabil-21f89.firebaseapp.com',
  projectId: 'hub-contabil-21f89',
  storageBucket: 'hub-contabil-21f89.firebasestorage.app',
  messagingSenderId: '567470064809',
  appId: '1:567470064809:web:9ccd8e30277014d3e815b8'
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
auth.languageCode = 'pt-BR';
const db = getFirestore(app);

/* chaves deste navegador que guardam dados do painel (apagadas ao sair) */
const LS_DADOS = ['nhdDashBase', 'nhdAgendaDraft', 'nhdMapaDraft', 'nhdLalurParams'];
let USER = null, ACESSO = null, liberado = false;

/* ---------------- dados ---------------- */
const emailDe = u => String((u && u.email) || '').toLowerCase();
async function lerDoc(nome){
  const s = await getDoc(doc(db, 'dados', nome));
  if (!s.exists()) return null;
  const d = s.data();
  try { return JSON.parse(d.json); } catch (e) { throw new Error('o documento "' + nome + '" está corrompido'); }
}
async function gravarDoc(nome, obj){
  if (!ACESSO || ACESSO.papel !== 'admin') throw new Error('só o administrador publica');
  const savedAt = (obj && obj.savedAt) || new Date().toISOString();
  await setDoc(doc(db, 'dados', nome), { json: JSON.stringify(obj), savedAt, por: emailDe(USER), em: serverTimestamp() });
  return savedAt;
}
async function listarAcessos(){
  const q = await getDocs(collection(db, 'acessos'));
  return q.docs.map(d => Object.assign({ email: d.id }, d.data())).sort((a, b) => (a.papel === b.papel ? a.email.localeCompare(b.email) : a.papel === 'admin' ? -1 : 1));
}
async function salvarAcesso(email, papel, nome, book){
  email = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('e-mail inválido');
  if (papel !== 'admin' && papel !== 'cliente') throw new Error('papel inválido');
  await setDoc(doc(db, 'acessos', email), { papel, nome: String(nome || '').trim(), book: !!book, por: emailDe(USER), em: serverTimestamp() });
}

/* ---------------- Book de conciliação (coleção "book", um documento por mês) ----------------
   O pacote do mês vai compactado (gzip + base64) para caber no limite de 1 MB do documento.
   Lê: admin ou quem tem book = true no acesso. Grava: só admin (regras do banco). */
async function gz(txt){
  const cs = new Blob([txt]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = new Uint8Array(await new Response(cs).arrayBuffer());
  let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function gunzip(b64){
  const bin = atob(b64), buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
const podeBook = () => !!ACESSO && (ACESSO.papel === 'admin' || ACESSO.book === true);
async function gravarBook(mes, pac){
  if (!ACESSO || ACESSO.papel !== 'admin') throw new Error('só o administrador salva o Book');
  if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error('mês inválido');
  const z = await gz(JSON.stringify(pac));
  if (z.length > 1000000) throw new Error('o Book de ' + mes + ' ficou grande demais para o Firebase (' + Math.round(z.length / 1024) + ' KB compactado; limite de ~1.000 KB)');
  await setDoc(doc(db, 'book', mes), { gz: z, salvoEm: pac.salvoEm || new Date().toISOString(), por: emailDe(USER), em: serverTimestamp() });
  return Math.round(z.length / 1024);
}
/* todos os meses salvos: {aaaa-mm: pacote} */
async function lerBooks(){
  const q = await getDocs(collection(db, 'book')), out = {};
  for (const d of q.docs){ try { out[d.id] = JSON.parse(await gunzip(d.data().gz)); } catch (e) { console.warn('Book ' + d.id + ' ilegível', e); } }
  return out;
}
async function removerAcesso(email){
  email = String(email || '').toLowerCase();
  if (email === emailDe(USER)) throw new Error('você não pode remover o seu próprio acesso');
  await deleteDoc(doc(db, 'acessos', email));
}
async function sair(){
  LS_DADOS.forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
  try { sessionStorage.removeItem('nhdVerCliente'); } catch (e) {}
  await signOut(auth);
  location.reload();
}
window.HubAuth = { lerDoc, gravarDoc, listarAcessos, salvarAcesso, removerAcesso, sair, gravarBook, lerBooks,
  get podeBook(){ return podeBook(); },
  get email(){ return emailDe(USER); }, get papel(){ return ACESSO && ACESSO.papel; }, get nome(){ return (ACESSO && ACESSO.nome) || ''; } };

/* ---------------- mensagens de erro ---------------- */
function erroMsg(e){
  const c = (e && e.code) || '';
  const M = {
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/invalid-email': 'Confira o e-mail digitado.',
    'auth/email-already-in-use': 'Este e-mail já tem cadastro. Use "Entrar" ou "Esqueci a senha".',
    'auth/weak-password': 'A senha precisa ter pelo menos 8 caracteres.',
    'auth/too-many-requests': 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
    'auth/network-request-failed': 'Sem conexão com o servidor. Confira a internet e tente de novo.',
    'auth/user-disabled': 'Este acesso foi desativado. Fale com a Audicon.',
    'auth/operation-not-allowed': 'O login por e-mail e senha não está ativado no Firebase.',
    'permission-denied': 'Seu acesso não permite esta ação.'
  };
  return M[c] || ('Não foi possível concluir: ' + ((e && e.message) || e));
}

/* ---------------- tela ---------------- */
const PONTOS = [
  ['M3 13V7M7 13V4M11 13V9M15 13V2', 'DRE gerencial', 'Mês a mês, com análise vertical sobre a receita bruta e a líquida.'],
  ['M2 14h14M4 11V6h3v5M9 11V3h3v8', 'Balanço & Índices', 'Saldos finais, liquidez, endividamento e capital de giro.'],
  ['M4 2h7l3 3v11H4zM7 8h5M7 11h5', 'LALUR', 'Apuração acumulada de IRPJ e CSLL no Lucro Real.'],
  ['M3 4h12v11H3zM3 7h12M7 2v3M11 2v3', 'Agenda de fechamento', 'Tarefas do cliente e da contabilidade, com prazos e andamento.'],
  ['M9 2a7 7 0 1 0 0 14A7 7 0 0 0 9 2zM2 9h14M9 2c2 2 3 4.5 3 7s-1 5-3 7c-2-2-3-4.5-3-7s1-5 3-7z', 'Mercado e vendas', 'Comparação com o setor e mapa de vendas por estado e cidade.'],
  ['M4 2h10v14H4zM7 6h4M7 9h4M7 12h2', 'Relatório consolidado', 'DRE, balanço e indicadores em PDF e Excel para a diretoria.']
];
const ic = d => '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="' + d + '" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const css = `
body.hub-locked{overflow:hidden}
body.hub-locked>*:not(#hubLogin):not(#hubTrans){display:none!important}
#hubLogin{position:fixed;inset:0;z-index:100000;display:flex;background:#0B1626;color:#EDEAE4;font-family:Calibri,"Segoe UI",Arial,sans-serif;overflow:auto}
#hubLogin[hidden]{display:none}
.hl-side{flex:1.15;position:relative;padding:48px 56px;display:flex;flex-direction:column;gap:28px;justify-content:center;
  background:radial-gradient(1200px 600px at 0% 0%,rgba(201,168,76,.16),transparent 60%),linear-gradient(160deg,#0F2035 0%,#0B1626 70%);border-right:1px solid rgba(201,168,76,.18);overflow:hidden}
.hl-side:after{content:"";position:absolute;right:-120px;bottom:-120px;width:360px;height:360px;border-radius:50%;border:1px solid rgba(201,168,76,.18);box-shadow:0 0 0 40px rgba(201,168,76,.04),0 0 0 90px rgba(201,168,76,.025)}
.hl-logos{display:flex;align-items:center;gap:18px}.hl-logos img{height:52px;width:auto;object-fit:contain}.hl-logos i{width:1px;height:40px;background:rgba(201,168,76,.35)}
.hl-kick{font-size:12.5px;letter-spacing:.18em;text-transform:uppercase;color:#C9A84C;font-weight:700}
.hl-side h1{margin:6px 0 0;font-size:38px;line-height:1.12;font-weight:600;letter-spacing:-.01em;max-width:560px}
.hl-side h1 b{color:#E8C96A;font-weight:700}
.hl-lead{margin:10px 0 0;color:#A0B0BE;font-size:16px;line-height:1.5;max-width:520px}
.hl-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;max-width:640px;position:relative;z-index:1}
.hl-pt{display:flex;gap:12px;align-items:flex-start;padding:14px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid rgba(201,168,76,.14)}
.hl-pt svg{flex:none;width:34px;height:34px;padding:7px;border-radius:9px;color:#E8C96A;background:rgba(201,168,76,.12)}
.hl-pt b{display:block;font-size:15px;font-weight:700;color:#EDEAE4}.hl-pt span{display:block;font-size:13px;color:#A0B0BE;line-height:1.4;margin-top:2px}
.hl-foot{font-size:12.5px;color:#6E7E8E}
.hl-form{flex:.85;display:flex;align-items:center;justify-content:center;padding:40px 28px}
.hl-card{width:min(400px,100%);display:flex;flex-direction:column;gap:16px}
.hl-card h2{margin:0;font-size:26px;font-weight:600}.hl-sub{margin:-8px 0 4px;color:#A0B0BE;font-size:14.5px;line-height:1.45}
.hl-card label{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:700;color:#A0B0BE;letter-spacing:.02em}
.hl-in{position:relative}
.hl-card input{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:10px;border:1px solid rgba(201,168,76,.28);background:#0F2035;color:#EDEAE4;font:inherit;font-size:15.5px;outline:none;transition:border-color .15s,box-shadow .15s}
.hl-card input:focus{border-color:#C9A84C;box-shadow:0 0 0 3px rgba(201,168,76,.18)}
.hl-eye{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:0;color:#A0B0BE;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;padding:6px}
.hl-eye:hover{color:#E8C96A}
.hl-btn{padding:12px 16px;border-radius:10px;border:1px solid #C9A84C;background:linear-gradient(180deg,#E8C96A,#C9A84C);color:#0B1626;font:inherit;font-size:15.5px;font-weight:800;cursor:pointer;transition:filter .15s}
.hl-btn:hover{filter:brightness(1.06)}.hl-btn[disabled]{opacity:.6;cursor:wait}
.hl-btn.sec{background:transparent;color:#E8C96A}
.hl-links{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:14px}
.hl-lk{background:none;border:0;padding:0;color:#E8C96A;font:inherit;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.hl-lk:hover{color:#fff}
.hl-msg{font-size:14px;line-height:1.45;padding:10px 12px;border-radius:10px;display:none}
.hl-msg.on{display:block}.hl-msg.err{background:rgba(231,76,60,.14);color:#F1948A;border:1px solid rgba(231,76,60,.35)}
.hl-msg.ok{background:rgba(46,204,113,.12);color:#7DDBA3;border:1px solid rgba(46,204,113,.3)}
.hl-msg.info{background:rgba(201,168,76,.1);color:#E8C96A;border:1px solid rgba(201,168,76,.3)}
.hl-sec{font-size:12.5px;color:#6E7E8E;display:flex;gap:8px;align-items:center}.hl-sec svg{width:16px;height:16px;flex:none}
.hl-spin{width:28px;height:28px;border-radius:50%;border:3px solid rgba(201,168,76,.25);border-top-color:#C9A84C;animation:hlr .8s linear infinite;margin:6px auto}
@keyframes hlr{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.hl-spin{animation-duration:2.4s}}
@media (max-width:900px){
  #hubLogin{flex-direction:column}
  .hl-side{order:2;padding:28px 20px 36px;border-right:0;border-top:1px solid rgba(201,168,76,.18);gap:18px}
  .hl-side h1{font-size:26px}.hl-lead{font-size:14.5px}.hl-logos img{height:38px}
  .hl-form{order:1;padding:28px 16px 24px}
  .hl-grid{grid-template-columns:minmax(0,1fr)}
}`;
const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

/* ---------------- tela de transição (entrando / carregando o painel) ----------------
   O "A" da Audicon se desenha (pernas, travessão e o arco dourado), aparecem AUDICON e RESOLVE e a marca
   fica pulsando até o painel terminar de carregar. Fica no ar pelo menos o tempo da animação. */
const cssT = `
#hubTrans{position:fixed;inset:0;z-index:100001;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
  background:radial-gradient(900px 520px at 50% 38%,rgba(201,168,76,.12),transparent 62%),linear-gradient(160deg,#0F2035 0%,#0B1626 70%);
  color:#EDEAE4;font-family:"Red Hat Display",Calibri,"Segoe UI",Arial,sans-serif;opacity:1;transition:opacity .5s ease}
#hubTrans.sai{opacity:0;pointer-events:none}
#hubTrans svg{width:min(250px,62vw);height:auto;overflow:visible}
#hubTrans .ht-marca{transform-origin:100px 70px;animation:htPulse 1.8s 2.1s ease-in-out infinite}
#hubTrans path{fill:none;stroke-linecap:round;stroke-linejoin:round}
#hubTrans .ht-a{stroke:#EDEAE4;stroke-width:7;stroke-dasharray:182;stroke-dashoffset:182;animation:htDraw .9s .1s cubic-bezier(.6,0,.3,1) forwards}
#hubTrans .ht-bar{stroke:#EDEAE4;stroke-width:6;stroke-dasharray:34;stroke-dashoffset:34;animation:htDraw .35s .85s ease-out forwards}
#hubTrans .ht-arc{stroke:#C9A84C;stroke-width:3.2;stroke-dasharray:205;stroke-dashoffset:205;animation:htDraw .9s 1s cubic-bezier(.5,0,.2,1) forwards}
#hubTrans .ht-nome{font-size:30px;font-weight:600;letter-spacing:.34em;padding-left:.34em;opacity:0;transform:translateY(6px);animation:htIn .6s 1.45s forwards}
#hubTrans .ht-res{margin-top:-8px;font-size:12px;font-weight:700;letter-spacing:.62em;padding-left:.62em;color:#C9A84C;opacity:0;animation:htIn .6s 1.65s forwards}
#hubTrans .ht-msg{margin-top:18px;font-size:14px;color:#A0B0BE;opacity:0;animation:htIn .5s 1.9s forwards}
#hubTrans .ht-msg:after{content:"";display:inline-block;width:1.2em;text-align:left;animation:htPts 1.4s steps(4) infinite}
@keyframes htDraw{to{stroke-dashoffset:0}}
@keyframes htIn{to{opacity:1;transform:none}}
@keyframes htPulse{0%,100%{transform:scale(1);filter:drop-shadow(0 0 0 rgba(201,168,76,0))}50%{transform:scale(1.05);filter:drop-shadow(0 0 16px rgba(201,168,76,.5))}}
@keyframes htPts{0%{content:""}25%{content:"."}50%{content:".."}75%{content:"..."}}
@media (prefers-reduced-motion:reduce){
  #hubTrans .ht-a,#hubTrans .ht-bar,#hubTrans .ht-arc{animation:none;stroke-dashoffset:0}
  #hubTrans .ht-nome,#hubTrans .ht-res,#hubTrans .ht-msg{animation:none;opacity:1;transform:none}
  #hubTrans .ht-marca{animation:none}
}`;
const stT = document.createElement('style'); stT.textContent = cssT; document.head.appendChild(stT);
const trans = document.createElement('div');
trans.id = 'hubTrans'; trans.setAttribute('role', 'status'); trans.setAttribute('aria-live', 'polite');
trans.innerHTML = '<svg viewBox="0 0 200 120" aria-hidden="true"><g class="ht-marca">' +
  '<path class="ht-arc" d="M6 98 Q100 54 194 98"/><path class="ht-a" d="M68 106 L100 20 L132 106"/><path class="ht-bar" d="M84 80 L116 80"/></g></svg>' +
  '<div class="ht-nome">AUDICON</div><div class="ht-res">RESOLVE</div><div class="ht-msg">Carregando</div>';
let transDesde = 0, transFim = null, transTrava = null;
function mostrarTrans(texto){
  trans.querySelector('.ht-msg').textContent = texto || 'Carregando';
  clearTimeout(transFim); clearTimeout(transTrava);
  if (!trans.isConnected || trans.classList.contains('sai')){
    trans.classList.remove('sai');
    // recomeça a animação do A a cada vez que a tela aparece
    trans.querySelectorAll('path,.ht-nome,.ht-res,.ht-msg,.ht-marca').forEach(e => { e.style.animation = 'none'; void e.getBoundingClientRect(); e.style.animation = ''; });
    document.body.appendChild(trans); transDesde = Date.now();
  }
  transTrava = setTimeout(esconderTrans, 25000);   // nunca prende a tela se algo falhar
}
function esconderTrans(imediato){
  if (!trans.isConnected) return;
  clearTimeout(transFim); clearTimeout(transTrava);
  const falta = imediato ? 0 : Math.max(0, 2200 - (Date.now() - transDesde));   // deixa o A terminar de se desenhar
  transFim = setTimeout(() => { trans.classList.add('sai'); setTimeout(() => { if (trans.classList.contains('sai')) trans.remove(); }, 520); }, falta);
}
window.HubTransicao = { mostrar: mostrarTrans, esconder: esconderTrans };

const raiz = document.createElement('div');
raiz.id = 'hubLogin'; raiz.setAttribute('role', 'main');
function logos(){
  const a = document.querySelector('.tb-logo'), b = document.querySelector('.tb-aud-logo');
  return (a ? '<img src="' + a.src + '" alt="NHD Foods">' : '') + (a && b ? '<i></i>' : '') + (b ? '<img src="' + b.src + '" alt="Audicon Contadores">' : '');
}
function montar(){
  raiz.innerHTML = '<section class="hl-side" aria-label="O que tem no Hub">' +
    '<div class="hl-logos">' + logos() + '</div>' +
    '<div><div class="hl-kick">Hub Contábil · NHD Foods</div><h1>O fechamento do mês, <b>num lugar só</b>.</h1>' +
    '<p class="hl-lead">Resultado, balanço, impostos e o andamento do fechamento, atualizados pela Audicon a cada balancete.</p></div>' +
    '<div class="hl-grid">' + PONTOS.map(p => '<div class="hl-pt">' + ic(p[0]) + '<div><b>' + p[1] + '</b><span>' + p[2] + '</span></div></div>').join('') + '</div>' +
    '<div class="hl-foot">Audicon Contadores · acesso restrito a usuários liberados</div></section>' +
    '<section class="hl-form"><div class="hl-card" id="hlCard"></div></section>';
  document.body.appendChild(raiz);
}

let modo = 'carregando';
const $ = id => document.getElementById(id);
function msg(t, tipo){ const m = $('hlMsg'); if (!m) return; m.textContent = t || ''; m.className = 'hl-msg' + (t ? ' on ' + (tipo || 'err') : ''); }
const cadeado = '<div class="hl-sec">' + ic('M5 8V6a4 4 0 0 1 8 0v2M4 8h10v8H4z') + 'Conexão protegida. Seus dados só abrem para usuários liberados pela Audicon.</div>';
function campoSenha(id, rot, auto){
  return '<label for="' + id + '">' + rot + '<span class="hl-in"><input id="' + id + '" type="password" autocomplete="' + auto + '" required minlength="8">' +
    '<button type="button" class="hl-eye" data-alvo="' + id + '" aria-label="Mostrar senha">Mostrar</button></span></label>';
}
function tela(m, extra){
  modo = m; const c = $('hlCard'); if (!c) return;
  if (m === 'carregando') mostrarTrans('Verificando o seu acesso'); else esconderTrans(true);
  const em = (extra && extra.email) || ($('hlEmail') && $('hlEmail').value) || '';
  const campoEmail = '<label for="hlEmail">E-mail<input id="hlEmail" type="email" autocomplete="username" required value="' + em.replace(/"/g, '&quot;') + '"></label>';
  if (m === 'carregando') c.innerHTML = '<h2>Hub Contábil</h2><div class="hl-spin" role="status" aria-label="Verificando acesso"></div><p class="hl-sub" style="text-align:center">Verificando o seu acesso…</p>';
  else if (m === 'entrar') c.innerHTML = '<form id="hlF" class="hl-card" novalidate><h2>Entrar</h2><p class="hl-sub">Use o e-mail liberado pela Audicon.</p>' +
    campoEmail + campoSenha('hlSenha', 'Senha', 'current-password') + '<div id="hlMsg" class="hl-msg" role="alert"></div>' +
    '<button class="hl-btn" id="hlGo">Entrar</button><div class="hl-links"><button type="button" class="hl-lk" data-ir="esqueci">Esqueci a senha</button><button type="button" class="hl-lk" data-ir="criar">Primeiro acesso</button></div>' + cadeado + '</form>';
  else if (m === 'criar') c.innerHTML = '<form id="hlF" class="hl-card" novalidate><h2>Primeiro acesso</h2><p class="hl-sub">Crie a sua senha com o e-mail que a Audicon liberou. Depois enviamos um link para confirmar o e-mail.</p>' +
    campoEmail + campoSenha('hlSenha', 'Nova senha (mínimo 8 caracteres)', 'new-password') + campoSenha('hlSenha2', 'Repita a senha', 'new-password') +
    '<div id="hlMsg" class="hl-msg" role="alert"></div><button class="hl-btn" id="hlGo">Criar senha</button><div class="hl-links"><button type="button" class="hl-lk" data-ir="entrar">Já tenho senha</button></div></form>';
  else if (m === 'esqueci') c.innerHTML = '<form id="hlF" class="hl-card" novalidate><h2>Esqueci a senha</h2><p class="hl-sub">Enviamos um link para você cadastrar uma senha nova.</p>' +
    campoEmail + '<div id="hlMsg" class="hl-msg" role="alert"></div><button class="hl-btn" id="hlGo">Enviar link</button><div class="hl-links"><button type="button" class="hl-lk" data-ir="entrar">Voltar para entrar</button></div></form>';
  else if (m === 'confirmar') c.innerHTML = '<h2>Confirme o seu e-mail</h2><p class="hl-sub">Enviamos um link de confirmação para <b>' + emailDe(USER) + '</b>. Abra o e-mail (confira também o spam), clique no link e volte aqui.</p>' +
    '<div id="hlMsg" class="hl-msg" role="alert"></div><button class="hl-btn" data-acao="jaconfirmei">Já confirmei</button><button class="hl-btn sec" data-acao="reenviar">Reenviar o e-mail</button>' +
    '<div class="hl-links"><button type="button" class="hl-lk" data-acao="sair">Entrar com outro e-mail</button></div>';
  else if (m === 'semacesso') c.innerHTML = '<h2>Acesso não liberado</h2><p class="hl-sub">O e-mail <b>' + emailDe(USER) + '</b> entrou, mas ainda não foi liberado para o Hub. Peça para a Audicon incluir este e-mail na lista de acessos e entre de novo.</p>' +
    '<div id="hlMsg" class="hl-msg" role="alert"></div><button class="hl-btn" data-acao="jaconfirmei">Verificar de novo</button><div class="hl-links"><button type="button" class="hl-lk" data-acao="sair">Sair</button></div>';
  if (extra && extra.msg) msg(extra.msg, extra.tipo);
  const f = $('hlEmail') && !em ? $('hlEmail') : $('hlSenha') || $('hlEmail');
  if (f) setTimeout(() => f.focus(), 30);
}
raiz.addEventListener('click', ev => {
  const t = ev.target.closest('button'); if (!t) return;
  if (t.dataset.alvo){ const i = $(t.dataset.alvo); const v = i.type === 'password'; i.type = v ? 'text' : 'password'; t.textContent = v ? 'Ocultar' : 'Mostrar'; t.setAttribute('aria-label', v ? 'Ocultar senha' : 'Mostrar senha'); return; }
  if (t.dataset.ir){ tela(t.dataset.ir); return; }
  if (t.dataset.acao === 'sair'){ signOut(auth).then(() => tela('entrar')); return; }
  if (t.dataset.acao === 'reenviar'){ ocupado(t, true); sendEmailVerification(USER).then(() => msg('E-mail reenviado. Confira a caixa de entrada e o spam.', 'ok')).catch(e => msg(erroMsg(e))).finally(() => ocupado(t, false)); return; }
  if (t.dataset.acao === 'jaconfirmei'){ ocupado(t, true); verificar(true).finally(() => ocupado(t, false)); }
});
function ocupado(b, on){ if (b){ b.disabled = on; } }
raiz.addEventListener('submit', async ev => {
  ev.preventDefault(); msg('');
  const b = $('hlGo'), email = ($('hlEmail').value || '').trim().toLowerCase();
  if (!email){ msg('Informe o e-mail.'); return; }
  ocupado(b, true);
  try {
    if (modo === 'entrar'){
      const s = $('hlSenha').value; if (!s){ msg('Informe a senha.'); return; }
      mostrarTrans('Entrando');
      await signInWithEmailAndPassword(auth, email, s);
    } else if (modo === 'criar'){
      const s = $('hlSenha').value, s2 = $('hlSenha2').value;
      if (s.length < 8){ msg('A senha precisa ter pelo menos 8 caracteres.'); return; }
      if (s !== s2){ msg('As duas senhas não são iguais.'); return; }
      const cred = await createUserWithEmailAndPassword(auth, email, s);
      await sendEmailVerification(cred.user);
    } else if (modo === 'esqueci'){
      await sendPasswordResetEmail(auth, email);
      tela('entrar', { email, msg: 'Se este e-mail tiver cadastro, você vai receber o link em instantes. Confira também o spam.', tipo: 'ok' });
    }
  } catch (e) { esconderTrans(true); msg(erroMsg(e)); }
  finally { ocupado(b, false); }
});

/* confirma e-mail e lista de acessos; libera o painel uma única vez */
async function verificar(forcar){
  if (!USER) return;
  try {
    if (forcar){ await USER.reload(); USER = auth.currentUser; }
    if (!USER.emailVerified){ tela('confirmar'); if (forcar) msg('O e-mail ainda não aparece como confirmado. Clique no link do e-mail e tente de novo.', 'info'); return; }
    await USER.getIdToken(true); /* o token precisa trazer o e-mail confirmado para as regras do banco */
    const a = await getDoc(doc(db, 'acessos', emailDe(USER)));
    if (!a.exists()){ tela('semacesso'); if (forcar) msg('Ainda não foi liberado. Fale com a Audicon.', 'info'); return; }
    ACESSO = a.data();
    if (liberado) return;
    liberado = true;
    mostrarTrans('Carregando o seu painel');
    raiz.hidden = true; document.body.classList.remove('hub-locked');
    window.__hubPronto && window.__hubPronto({ email: emailDe(USER), papel: ACESSO.papel, nome: ACESSO.nome || '', book: podeBook() });
  } catch (e) {
    tela(USER && USER.emailVerified ? 'semacesso' : 'entrar', { msg: erroMsg(e) });
  }
}

document.body.classList.add('hub-locked');
montar(); tela('carregando');
onAuthStateChanged(auth, u => {
  USER = u;
  if (!u){ if (liberado) location.reload(); else tela('entrar'); return; }
  verificar(false);
});
