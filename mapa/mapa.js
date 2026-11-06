/* Mapa de vendas — Hub Contábil (NHD Foods)
   Vendas por estado a partir do SPED Fiscal (EFD ICMS/IPI): notas de saída com CFOP de venda,
   agrupadas pela UF do destinatário (cadastro 0150). Só ficam totais por UF e por cidade, sem nomes de clientes.
   Dados: mapa/vendas-uf.json  {v,savedAt,meses:{'aaaa-mm':{filiais:{cnpj:{periodo,origem,uf:{UF:{fat,notas,cli,fatPF,fatPJ,cliPF,cliPJ,dev,bonif,cid:[[cidade,valor]]}}}}}}}
   Mercado: mapa/ibge-uf.json (população 2025, PIB 2023, receita do atacado 2024 por UF). Contornos: mapa/brasil-uf.js.
   O admin importa o SPED de cada mês aqui mesmo (fica um rascunho neste navegador) e clica em "Publicar mapa",
   que grava mapa/vendas-uf.json pelo GitHub com o mesmo token do "Publicar para todos". */
(function(){
'use strict';
var CFG=window.MAPA_CFG||{};
var ROOT=CFG.root||'mapaRoot', FILE='mapa/vendas-uf.json', LS_DRAFT='nhdMapaDraft';
var VENDA={'5101':1,'5102':1,'5401':1,'5403':1,'5405':1,'6101':1,'6102':1,'6107':1,'6108':1,'6401':1,'6403':1,'6404':1,'7101':1,'7102':1};
var DEVOL={'1201':1,'1202':1,'1410':1,'1411':1,'2201':1,'2202':1,'2410':1,'2411':1};
var BONIF={'5910':1,'6910':1};
var UFC={'11':'RO','12':'AC','13':'AM','14':'RR','15':'PA','16':'AP','17':'TO','21':'MA','22':'PI','23':'CE','24':'RN','25':'PB','26':'PE','27':'AL','28':'SE','29':'BA','31':'MG','32':'ES','33':'RJ','35':'SP','41':'PR','42':'SC','43':'RS','50':'MS','51':'MT','52':'GO','53':'DF'};
var MESES=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
var METR=[
  {k:'fat',nome:'Faturamento',un:'R$'},
  {k:'cli',nome:'Clientes',un:'n'},
  {k:'ticket',nome:'Ticket médio',un:'R$'},
  {k:'pf',nome:'% consumidor final',un:'%'},
  {k:'iPop',nome:'Penetração por habitante',un:'i',tip:'100 = média nacional da empresa. Acima de 100, o estado compra mais do que o tamanho da população sugere.'},
  {k:'iAtac',nome:'Penetração no atacado',un:'i',tip:'100 = média nacional. Compara a venda da empresa com o tamanho do comércio atacadista do estado (IBGE).'}
];
var V=CFG.vendas||null, publicado=null, IB=CFG.ibge||null, erro=null, dirty=false;
var S={mes:'todos',met:'fat',canal:'todos',uf:null,ord:'fat'};

/* ---------- utilidades ---------- */
function esc(t){return String(t==null?'':t).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
var nf0=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0}),nf1=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1}),nf2=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
function rs(v){var a=Math.abs(v);if(a>=1e9)return 'R$ '+nf1.format(v/1e9)+' bi';if(a>=1e6)return 'R$ '+nf2.format(v/1e6)+' mi';if(a>=1e4)return 'R$ '+nf0.format(v/1e3)+' mil';return 'R$ '+nf0.format(v);}
function fm(v,un){if(v==null||!isFinite(v))return '—';if(un==='R$')return rs(v);if(un==='%')return nf1.format(v)+'%';if(un==='i')return nf0.format(v);return nf0.format(v);}
function isAdmin(){return CFG.admin!=null?!!CFG.admin:!!window.IS_ADMIN;}
function nomeMes(c){var p=c.split('-');return MESES[+p[1]-1]+'/'+p[0];}
function clone(o){return JSON.parse(JSON.stringify(o));}

/* ---------- agregação ---------- */
function mesesDisp(){return V?Object.keys(V.meses||{}).sort():[];}
function agrega(){
  var ms=S.mes==='todos'?mesesDisp():[S.mes], R={}, fil={};
  ms.forEach(function(m){var F=(V.meses[m]||{}).filiais||{};Object.keys(F).forEach(function(c){fil[c]=1;var U=F[c].uf||{};
    Object.keys(U).forEach(function(uf){var x=U[uf],r=R[uf]||(R[uf]={fat:0,notas:0,cli:0,fatPF:0,fatPJ:0,cliPF:0,cliPJ:0,dev:0,bonif:0,cid:{}});
      ['fat','notas','cli','fatPF','fatPJ','cliPF','cliPJ','dev','bonif'].forEach(function(k){r[k]+=x[k]||0;});
      (x.cid||[]).forEach(function(c2){r.cid[c2[0]]=(r.cid[c2[0]]||0)+c2[1];});});});});
  /* canal */
  Object.keys(R).forEach(function(uf){var r=R[uf];
    if(S.canal==='pj'){r.fat=r.fatPJ;r.cli=r.cliPJ;}else if(S.canal==='pf'){r.fat=r.fatPF;r.cli=r.cliPF;}
  });
  var T={fat:0,cli:0,notas:0,dev:0,pop:0,atac:0,fatPF:0,ufs:0};
  Object.keys(R).forEach(function(uf){var r=R[uf];T.fat+=r.fat;T.cli+=r.cli;T.notas+=r.notas;T.dev+=r.dev;T.fatPF+=r.fatPF;if(r.fat>0)T.ufs++;});
  var ufs=Object.keys(UFC).map(function(c){return UFC[c];});
  ufs.forEach(function(uf){var g=(IB&&IB.uf[uf])||{};T.pop+=g.pop||0;T.atac+=g.atac||0;});
  var mP=T.pop?T.fat/T.pop:0, mA=T.atac?T.fat/T.atac:0;
  ufs.forEach(function(uf){var r=R[uf]||(R[uf]={fat:0,notas:0,cli:0,fatPF:0,fatPJ:0,cliPF:0,cliPJ:0,dev:0,bonif:0,cid:{}}),g=(IB&&IB.uf[uf])||{};
    r.ticket=r.cli?r.fat/r.cli:null;
    r.pf=(r.fatPF+r.fatPJ)?r.fatPF/(r.fatPF+r.fatPJ)*100:null;
    r.iPop=g.pop&&mP?(r.fat/g.pop)/mP*100:null;
    r.iAtac=g.atac&&mA?(r.fat/g.atac)/mA*100:null;
    r.share=T.fat?r.fat/T.fat*100:0;});
  T.ticket=T.cli?T.fat/T.cli:null;
  return {R:R,T:T,meses:ms,filiais:Object.keys(fil)};
}

/* ---------- cores ---------- */
var PAL=['#1C3557','#2B5480','#3D7AA8','#8FA77A','#C9A84C','#E8C96A'];
function escala(vals){
  var v=vals.filter(function(x){return x!=null&&isFinite(x)&&x>0;}).sort(function(a,b){return a-b;});
  if(!v.length)return {cor:function(){return '#15263D';},cortes:[]};
  var q=[];for(var i=1;i<PAL.length;i++)q.push(v[Math.min(v.length-1,Math.floor(v.length*i/PAL.length))]);
  return {cortes:q,cor:function(x){if(x==null||!isFinite(x)||x<=0)return '#15263D';var j=0;while(j<q.length&&x>=q[j])j++;return PAL[Math.min(j,PAL.length-1)];}};
}

/* ---------- estilos ---------- */
function css(){
  if(document.getElementById('mapa-css'))return;
  var s=document.createElement('style');s.id='mapa-css';
  s.textContent=
  '.mp-head{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:flex-end;justify-content:space-between;margin:18px 0 12px}'+
  '.mp-ctrl{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}'+
  '.mp-seg{display:inline-flex;flex-wrap:wrap;border:1px solid var(--bdr);border-radius:8px;overflow:hidden;background:var(--n3)}'+
  '.mp-seg button{background:none;border:0;color:var(--gray2);font:inherit;font-size:12.5px;padding:6px 11px;cursor:pointer;border-right:1px solid var(--bdr)}'+
  '.mp-seg button:last-child{border-right:0}.mp-seg button.on{background:rgba(201,168,76,.18);color:var(--g2);font-weight:700}'+
  '.mp-sel{background:var(--n3);color:var(--white);border:1px solid var(--bdr);border-radius:8px;padding:6px 10px;font:inherit;font-size:13px}'+
  '.mp-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-bottom:12px}'+
  '.mp-k{background:var(--n3);border:1px solid var(--bdr);border-radius:var(--r);padding:10px 12px;min-width:0}'+
  '.mp-k span{display:block;font-size:11.5px;color:var(--gray)}.mp-k b{display:block;font-size:19px;color:var(--white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
  '.mp-main{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:12px;align-items:start}'+
  '.mp-box{background:var(--n3);border:1px solid var(--bdr);border-radius:var(--r);padding:14px;min-width:0;position:relative}'+
  '.mp-svg{width:100%;height:auto;display:block;max-height:640px}'+
  '.mp-svg path{stroke:#0D1B2E;stroke-width:.8;cursor:pointer;transition:opacity .15s}'+
  '.mp-svg path:hover{opacity:.82}.mp-svg path.sel{stroke:#fff;stroke-width:2}'+
  '.mp-svg text{font-size:10px;font-weight:700;fill:#EDEAE4;pointer-events:none;text-anchor:middle;paint-order:stroke;stroke:#0D1B2E;stroke-width:2.5px}'+
  '.mp-legend{display:flex;flex-wrap:wrap;gap:8px 12px;font-size:11.5px;color:var(--gray2);margin-top:8px;align-items:center}'+
  '.mp-legend i{display:inline-block;width:14px;height:10px;border-radius:2px;vertical-align:middle;margin-right:4px}'+
  '.mp-tip{position:fixed;z-index:50;pointer-events:none;background:#0D1B2E;border:1px solid rgba(201,168,76,.4);border-radius:8px;padding:8px 10px;font-size:12px;color:var(--white);display:none;max-width:240px}'+
  '.mp-pt{font-size:18px;font-weight:700;color:var(--white);display:flex;justify-content:space-between;gap:8px;align-items:center}'+
  '.mp-ps{font-size:12px;color:var(--gray);margin:2px 0 10px}'+
  '.mp-row{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid rgba(201,168,76,.07);font-size:13px;color:var(--gray2)}'+
  '.mp-row b{color:var(--white);font-weight:600;white-space:nowrap}'+
  '.mp-sub{font-size:12px;font-weight:700;color:var(--g2);margin:12px 0 4px;letter-spacing:.3px;text-transform:uppercase}'+
  '.mp-bar{height:8px;border-radius:99px;background:#5DADE2;overflow:hidden;margin:4px 0 2px}.mp-bar div{height:8px;background:#C9A84C}'+
  '.mp-btn{background:none;border:1px solid var(--bdr);color:var(--g2);border-radius:8px;padding:5px 10px;font:inherit;font-size:12px;cursor:pointer}'+
  '.mp-btn.pri{background:var(--gold);color:#0D1B2E;border-color:var(--gold);font-weight:700}'+
  '.mp-tw{overflow-x:auto;-webkit-overflow-scrolling:touch;margin-top:12px}'+
  '.mp-t{width:100%;border-collapse:collapse;font-size:13px;min-width:640px}'+
  '.mp-t th,.mp-t td{padding:7px 8px;border-bottom:1px solid rgba(201,168,76,.08);text-align:right;white-space:nowrap}'+
  '.mp-t th{color:var(--gray2);font-weight:600;font-size:12px;cursor:pointer}.mp-t th.on{color:var(--g2)}'+
  '.mp-t td:first-child,.mp-t th:first-child{text-align:left}.mp-t tr{cursor:pointer}.mp-t tr.sel td{background:rgba(201,168,76,.08);color:var(--g2)}'+
  '.mp-reg{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-top:12px}'+
  '.mp-note{font-size:12px;color:var(--gray);line-height:1.5;margin-top:10px}'+
  '.mp-admin{display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:rgba(201,168,76,.06);border:1px dashed rgba(201,168,76,.35);border-radius:var(--r);padding:10px 12px;margin-bottom:12px;font-size:12.5px;color:var(--gray2)}'+
  '.mp-msg.ok{color:#2ECC71}.mp-msg.err{color:#F08A7C}'+
  '@media(max-width:1100px){.mp-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.mp-main{grid-template-columns:minmax(0,1fr)}}'+
  '@media(max-width:860px){.mp-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.mp-k b{font-size:16px}.mp-reg{grid-template-columns:repeat(2,minmax(0,1fr))}.mp-seg button{padding:6px 8px;font-size:12px}.mp-svg text{font-size:12px}}';
  document.head.appendChild(s);
}

/* ---------- render ---------- */
function render(){
  var root=document.getElementById(ROOT);if(!root)return;css();
  if(!V||!IB||!window.BR_UF){
    root.innerHTML='<div style="margin:18px 0"><div class="ptitle">Mapa de vendas</div><div class="psub">'+(erro?'Não foi possível carregar os dados ('+esc(erro)+').':'Carregando…')+'</div></div>';
    return;
  }
  var ms=mesesDisp();
  if(S.mes!=='todos'&&ms.indexOf(S.mes)<0)S.mes='todos';
  var A=agrega(),R=A.R,T=A.T,M=METR.filter(function(m){return m.k===S.met;})[0];
  var ufs=Object.keys(R), esc1=escala(ufs.map(function(u){return R[u][S.met];}));
  var mg=(R.MG||{}).fat||0;
  var per=A.meses.length?(A.meses.length===1?nomeMes(A.meses[0]):nomeMes(A.meses[0])+' a '+nomeMes(A.meses[A.meses.length-1])):'sem dados';
  var h='';
  /* admin */
  if(isAdmin()&&!CFG.demo){
    h+='<div class="mp-admin"><b style="color:var(--g2)">Admin</b> Importe o SPED Fiscal (EFD ICMS/IPI) do mês. Cada arquivo soma ao mapa por mês e por CNPJ.'+
      '<label class="mp-btn" style="display:inline-block">Importar SPED<input type="file" accept=".txt" multiple style="display:none" onchange="Mapa.importar(this.files);this.value=\'\'"></label>'+
      (dirty?'<button class="mp-btn pri" onclick="Mapa.publicar()">Publicar mapa</button><button class="mp-btn" onclick="Mapa.descartar()">Descartar</button>':'')+
      '<span id="mpMsg" class="mp-msg">'+(dirty?'Há importações não publicadas; só você vê.':'')+'</span></div>';
  }
  h+='<div class="mp-head"><div><div class="ptitle">Mapa de vendas</div><div class="psub">Vendas por estado do cliente · '+esc(per)+' · fonte: SPED Fiscal das notas de saída'+(CFG.demo?' (dados fictícios)':'')+'</div></div>'+
    '<button class="mp-btn" onclick="Mapa.sel(null)"'+(S.uf?'':' disabled style="opacity:.5"')+'>Ver Brasil</button></div>';
  h+='<div class="mp-ctrl"><select class="mp-sel" onchange="Mapa.set(\'mes\',this.value)"><option value="todos">Todos os meses</option>'+
    ms.map(function(m){return '<option value="'+m+'"'+(S.mes===m?' selected':'')+'>'+nomeMes(m)+'</option>';}).join('')+'</select>'+
    seg('canal',[['todos','Todos'],['pj','Empresas'],['pf','Consumidor final']])+'</div>';
  h+='<div class="mp-ctrl">'+seg('met',METR.map(function(m){return [m.k,m.nome];}))+'</div>';
  h+='<div class="mp-kpis">'+
    k('Faturamento',rs(T.fat))+k('Estados atendidos',T.ufs+' de 27')+k(A.meses.length>1?'Clientes (soma dos meses)':'Clientes',nf0.format(T.cli))+
    k('Ticket médio',T.ticket?rs(T.ticket):'—')+k('Fora de MG',T.fat?nf1.format((T.fat-mg)/T.fat*100)+'%':'—')+
    k('Consumidor final',T.fat&&S.canal==='todos'?nf1.format(T.fatPF/T.fat*100)+'%':(S.canal==='pf'?'100%':S.canal==='pj'?'0%':'—'))+'</div>';
  /* mapa */
  var B=window.BR_UF;
  var svg='<svg class="mp-svg" viewBox="0 0 '+B.w+' '+B.h+'" role="img" aria-label="Mapa do Brasil por estado, colorido por '+esc(M.nome)+'">';
  ufs.forEach(function(uf){if(!B.paths[uf])return;var v=R[uf][S.met];
    svg+='<path d="'+B.paths[uf]+'" fill="'+esc1.cor(v)+'" class="'+(S.uf===uf?'sel':'')+'" data-uf="'+uf+'" onclick="Mapa.sel(\''+uf+'\')" onmousemove="Mapa.tip(event,\''+uf+'\')" onmouseleave="Mapa.tip(null)"></path>';});
  ufs.forEach(function(uf){var c=B.centro[uf];if(c)svg+='<text x="'+c[0]+'" y="'+(c[1]+3)+'">'+uf+'</text>';});
  svg+='</svg>';
  var leg='<div class="mp-legend"><span>'+esc(M.nome)+':</span><span><i style="background:#15263D;border:1px solid var(--bdr)"></i>sem venda</span>';
  var cs=esc1.cortes;
  for(var i=0;i<PAL.length;i++){var a=i?cs[i-1]:null,b=cs[i];leg+='<span><i style="background:'+PAL[i]+'"></i>'+(a==null?'até '+fm(b,M.un):b==null?fm(a,M.un)+' ou mais':fm(a,M.un)+' a '+fm(b,M.un))+'</span>';}
  leg+='</div>'+(M.tip?'<div class="mp-note">'+esc(M.tip)+'</div>':'');
  h+='<div class="mp-main"><div class="mp-box">'+svg+leg+'</div><div class="mp-box">'+painel(A)+'</div></div>';
  h+=regioes(A)+tabela(A);
  h+='<div class="mp-note">Contam as notas de saída com CFOP de venda (5101, 5102, 5401, 5405, 6101, 6102, 6107, 6108, 6401, 6403, 6404 e exportação). Transferências, remessas e bonificações ficam de fora; devoluções são as notas de entrada com CFOP de devolução de venda. '+
    'Empresa = cliente com CNPJ; consumidor final = cliente com CPF. Penetração compara com a população (IBGE 2025) e com a receita do comércio atacadista de cada estado (IBGE, PAC 2024). '+
    (A.filiais.length?'CNPJ'+(A.filiais.length>1?'s':'')+' no período: '+A.filiais.map(fmtCnpj).join(', ')+'.':'')+'</div>';
  h+='<div class="mp-tip" id="mpTip"></div>';
  root.innerHTML=h;
}
function fmtCnpj(c){c=String(c);return c.length===14?c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5'):c;}
function seg(key,opts){return '<span class="mp-seg">'+opts.map(function(o){return '<button class="'+(S[key]===o[0]?'on':'')+'" onclick="Mapa.set(\''+key+'\',\''+o[0]+'\')">'+esc(o[1])+'</button>';}).join('')+'</span>';}
function k(l,v){return '<div class="mp-k"><span>'+esc(l)+'</span><b title="'+esc(v)+'">'+esc(v)+'</b></div>';}

function rank(A,key,uf){var l=Object.keys(A.R).filter(function(u){return A.R[u][key]!=null&&A.R[u].fat>0;}).sort(function(a,b){return A.R[b][key]-A.R[a][key];});var i=l.indexOf(uf);return i<0?null:i+1;}
function painel(A){
  var R=A.R,T=A.T;
  if(!S.uf){
    var top=Object.keys(R).sort(function(a,b){return R[b].fat-R[a].fat;}).slice(0,6);
    var h='<div class="mp-pt">Brasil</div><div class="mp-ps">Toque num estado para ver o detalhe.</div><div class="mp-sub">Estados que mais compram</div>';
    top.forEach(function(u){h+='<div class="mp-row" style="cursor:pointer" onclick="Mapa.sel(\''+u+'\')"><span>'+esc(IB.uf[u].nome)+'</span><b>'+rs(R[u].fat)+' · '+nf1.format(R[u].share)+'%</b></div>';});
    var p3=top.slice(0,3).reduce(function(s,u){return s+R[u].share;},0);
    h+='<div class="mp-note">Os 3 maiores estados somam '+nf1.format(p3)+'% do faturamento. '+(T.dev?'Devoluções no período: '+rs(T.dev)+' ('+nf1.format(T.dev/(T.fat||1)*100)+'% do faturamento).':'')+'</div>';
    return h;
  }
  var u=S.uf,r=R[u],g=IB.uf[u],cid=Object.keys(r.cid).sort(function(a,b){return r.cid[b]-r.cid[a];}).slice(0,5);
  var h='<div class="mp-pt"><span>'+esc(g.nome)+'</span><button class="mp-btn" onclick="Mapa.sel(null)">Ver Brasil</button></div><div class="mp-ps">'+esc(g.regiao)+' · '+(r.fat?nf1.format(r.share)+'% do faturamento · '+rank(A,'fat',u)+'º estado':'sem vendas no período')+'</div>';
  h+=row('Faturamento',rs(r.fat))+row('Notas de venda',nf0.format(r.notas))+row('Clientes',nf0.format(r.cli))+row('Ticket médio',r.ticket?rs(r.ticket)+cmp(r.ticket,T.ticket):'—')+
     row('Devoluções',r.dev?rs(r.dev)+(r.fat?' ('+nf1.format(r.dev/r.fat*100)+'%)':''):'—')+(r.bonif?row('Bonificações',rs(r.bonif)):'');
  if(r.fatPF+r.fatPJ>0){var pj=r.fatPJ/(r.fatPF+r.fatPJ)*100;
    h+='<div class="mp-sub">Empresas x consumidor final</div><div class="mp-bar"><div style="width:'+pj.toFixed(1)+'%"></div></div>'+
      '<div class="mp-legend" style="margin-top:2px"><span><i style="background:#C9A84C"></i>Empresas '+nf1.format(pj)+'% · '+nf0.format(r.cliPJ)+' clientes</span><span><i style="background:#5DADE2"></i>Consumidor '+nf1.format(100-pj)+'% · '+nf0.format(r.cliPF)+' clientes</span></div>';}
  h+='<div class="mp-sub">Comparado com o mercado</div>'+
    row('Penetração por habitante',r.iPop!=null?nf0.format(r.iPop)+' <small style="color:var(--gray)">(100 = média)</small>':'—')+
    row('Penetração no atacado',r.iAtac!=null?nf0.format(r.iAtac)+' <small style="color:var(--gray)">(100 = média)</small>':'—')+
    row('População (2025)',g.pop?nf0.format(g.pop)+' · '+nf1.format(g.pop/(T.pop||1)*100)+'% do país':'—')+
    row('PIB (2023)',g.pib?rs(g.pib):'—')+
    row('Atacado no estado (2024)',g.atac?rs(g.atac)+' · '+nf1.format(g.atac/(T.atac||1)*100)+'% do país':'—')+
    (g.atacAlim?row('Atacado de alimentos (2024)',rs(g.atacAlim)):'');
  if(cid.length){h+='<div class="mp-sub">Principais cidades</div>';cid.forEach(function(c){h+=row(esc(c),rs(r.cid[c]));});}
  return h;
}
function row(l,v){return '<div class="mp-row"><span>'+l+'</span><b>'+v+'</b></div>';}
function cmp(v,m){if(!v||!m)return '';var d=(v/m-1)*100;return ' <small style="color:'+(d>=0?'#2ECC71':'#F08A7C')+'">'+(d>=0?'+':'−')+nf0.format(Math.abs(d))+'% vs média</small>';}

function regioes(A){
  var G={},T=A.T;['Norte','Nordeste','Centro-Oeste','Sudeste','Sul'].forEach(function(r){G[r]={fat:0,pop:0};});
  Object.keys(A.R).forEach(function(u){var g=IB.uf[u];if(!g)return;G[g.regiao].fat+=A.R[u].fat;G[g.regiao].pop+=g.pop||0;});
  return '<div class="mp-reg">'+Object.keys(G).map(function(r){var x=G[r];return '<div class="mp-k"><span>'+r+'</span><b>'+(T.fat?nf1.format(x.fat/T.fat*100):'0')+'% das vendas</b><span>'+(T.pop?nf1.format(x.pop/T.pop*100):'0')+'% da população</span></div>';}).join('')+'</div>';
}
function tabela(A){
  var R=A.R,cols=[['fat','Faturamento','R$'],['share','% do total','%'],['cli','Clientes','n'],['ticket','Ticket','R$'],['pf','% consumidor','%'],['iPop','Penetr. hab.','i'],['iAtac','Penetr. atacado','i'],['dev','Devoluções','R$']];
  var l=Object.keys(R).sort(function(a,b){var x=R[a][S.ord],y=R[b][S.ord];return (y==null?-1e18:y)-(x==null?-1e18:x);});
  var h='<div class="mp-box mp-tw" style="padding:6px 10px"><table class="mp-t"><thead><tr><th>Estado</th>'+cols.map(function(c){return '<th class="'+(S.ord===c[0]?'on':'')+'" onclick="Mapa.set(\'ord\',\''+c[0]+'\')">'+c[1]+(S.ord===c[0]?' ▾':'')+'</th>';}).join('')+'</tr></thead><tbody>';
  l.forEach(function(u){var r=R[u];h+='<tr class="'+(S.uf===u?'sel':'')+'" onclick="Mapa.sel(\''+u+'\')"><td>'+esc(IB.uf[u].nome)+'</td>'+cols.map(function(c){return '<td>'+(r.fat||c[0]==='fat'?fm(r[c[0]],c[2]):'—')+'</td>';}).join('')+'</tr>';});
  return h+'</tbody></table></div>';
}

/* ---------- interação ---------- */
function set(k2,v){S[k2]=v;if(k2==='met')S.ord=v==='share'?'fat':v;render();}
function sel(uf){S.uf=uf;render();if(uf&&window.matchMedia('(max-width:1100px)').matches){var b=document.querySelectorAll('#'+ROOT+' .mp-box')[1];if(b)b.scrollIntoView({behavior:'smooth',block:'start'});}}
function tip(ev,uf){
  var t=document.getElementById('mpTip');if(!t)return;
  if(!ev||window.matchMedia('(hover:none)').matches){t.style.display='none';return;}
  var A=agrega(),r=A.R[uf],M=METR.filter(function(m){return m.k===S.met;})[0];
  t.innerHTML='<b>'+esc(IB.uf[uf].nome)+'</b><br>'+esc(M.nome)+': '+fm(r[S.met],M.un)+'<br>Faturamento: '+rs(r.fat)+' ('+nf1.format(r.share)+'%)';
  t.style.display='block';t.style.left=Math.min(ev.clientX+14,window.innerWidth-250)+'px';t.style.top=(ev.clientY+14)+'px';
}

/* ---------- importação do SPED (admin) ---------- */
var MUN=null;
async function municipios(){
  if(MUN)return MUN;
  try{var r=await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado');var j=await r.json();MUN={};j.forEach(function(m){MUN[String(m['municipio-id'])]=m['municipio-nome'];});}
  catch(e){MUN={};}
  return MUN;
}
function parseSped(txt,mun){
  var part={},notas=[],cur=null,ini='',fim='',cnpj='';
  txt.split(/\r?\n/).forEach(function(ln){
    var p=ln.split('|');if(p.length<3)return;var r=p[1];
    if(r==='0000'){ini=p[4];fim=p[5];cnpj=p[7];}
    else if(r==='0150'){part[p[2]]={cnpj:p[5],cpf:p[6],mun:p[8],pais:p[4]};}
    else if(r==='C100'){cur=null;if(['02','03','04','05'].indexOf(p[6])>=0)return;cur={oper:p[2],part:p[4],venda:0,dev:0,bonif:0};notas.push(cur);}
    else if(r==='C190'&&cur){var c=p[3],v=parseFloat((p[5]||'0').replace(',','.'))||0;
      if(cur.oper==='1'&&VENDA[c])cur.venda+=v;else if(cur.oper==='0'&&DEVOL[c])cur.dev+=v;else if(cur.oper==='1'&&BONIF[c])cur.bonif+=v;}
  });
  if(!fim||!/^\d{8}$/.test(fim))throw new Error('o arquivo não parece um SPED Fiscal (registro 0000 não encontrado)');
  var A={};
  notas.forEach(function(n){
    var pt=part[n.part]||{},m=pt.mun||'',uf=UFC[m.slice(0,2)];if(!uf)return;
    var a=A[uf]||(A[uf]={fat:0,notas:0,cli:{},fatPF:0,fatPJ:0,cliPF:{},cliPJ:{},dev:0,bonif:0,cid:{}});
    if(n.venda){var pj=!!pt.cnpj;a.fat+=n.venda;a.notas++;a.cli[n.part]=1;a[pj?'fatPJ':'fatPF']+=n.venda;a[pj?'cliPJ':'cliPF'][n.part]=1;var nm=mun[m]||m;a.cid[nm]=(a.cid[nm]||0)+n.venda;}
    a.dev+=n.dev;a.bonif+=n.bonif;
  });
  var r2=function(x){return Math.round(x*100)/100;},uf={};
  Object.keys(A).forEach(function(u){var a=A[u];uf[u]={fat:r2(a.fat),notas:a.notas,cli:Object.keys(a.cli).length,fatPF:r2(a.fatPF),fatPJ:r2(a.fatPJ),
    cliPF:Object.keys(a.cliPF).length,cliPJ:Object.keys(a.cliPJ).length,dev:r2(a.dev),bonif:r2(a.bonif),
    cid:Object.keys(a.cid).sort(function(x,y){return a.cid[y]-a.cid[x];}).slice(0,5).map(function(c){return [c,r2(a.cid[c])];})};});
  return {comp:fim.slice(4,8)+'-'+fim.slice(2,4),periodo:ini+'-'+fim,cnpj:cnpj,uf:uf};
}
async function importar(files){
  var msg=function(t,c){var m=document.getElementById('mpMsg');if(m){m.textContent=t;m.className='mp-msg '+(c||'');}};
  if(!files||!files.length)return;msg('Lendo o arquivo…');
  try{
    var mun=await municipios(),feitos=[];
    for(var i=0;i<files.length;i++){
      var buf=await files[i].arrayBuffer(),txt=new TextDecoder('windows-1252').decode(buf),x=parseSped(txt,mun);
      V.meses[x.comp]=V.meses[x.comp]||{filiais:{}};
      var ja=!!V.meses[x.comp].filiais[x.cnpj];
      V.meses[x.comp].filiais[x.cnpj]={periodo:x.periodo,origem:'EFD ICMS/IPI (SPED Fiscal)',uf:x.uf};
      var tot=Object.keys(x.uf).reduce(function(s,u){return s+x.uf[u].fat;},0);
      feitos.push(nomeMes(x.comp)+' · '+fmtCnpj(x.cnpj)+' · '+rs(tot)+(ja?' (substituiu o anterior)':''));
    }
    dirty=true;try{localStorage.setItem(LS_DRAFT,JSON.stringify(V));}catch(e){}
    S.mes=Object.keys(V.meses).sort().pop();render();msg('✓ Importado: '+feitos.join('; ')+'. Confira e clique em Publicar mapa.','ok');
  }catch(err){msg('⚠ Não foi possível importar: '+err.message,'err');}
}
async function publicar(){
  var msg=function(t,c){var m=document.getElementById('mpMsg');if(m){m.textContent=t;m.className='mp-msg '+(c||'');}};
  var token='';try{token=localStorage.getItem('nhdGhToken')||'';}catch(e){}
  if(!token){alert('Entre no Acesso admin com o token do GitHub para publicar.');return;}
  msg('Publicando o mapa…');
  try{
    var repo=window.GH_REPO||'clecioferreiracontador-byte/nhdfoods-dashboard',br=window.GH_BRANCH||'main';
    var api='https://api.github.com/repos/'+repo+'/contents/'+FILE,hdr={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json'};
    var sha,g=await fetch(api+'?ref='+br+'&t='+Date.now(),{headers:hdr,cache:'no-store'});
    if(g.status===200){var cur=await g.json();sha=cur.sha;
      try{var remoto=JSON.parse(decodeURIComponent(escape(atob(cur.content.replace(/\n/g,'')))));
        if(remoto.savedAt&&publicado&&publicado.savedAt&&remoto.savedAt>publicado.savedAt&&!confirm('Alguém publicou o mapa depois que você abriu esta página. Publicar mesmo assim e substituir a versão dela?')){msg('Publicação cancelada.');return;}
      }catch(e){}
    }else if(g.status!==404)throw new Error(g.status===401||g.status===403?'token inválido ou sem permissão':'GitHub respondeu '+g.status);
    V.savedAt=new Date().toISOString();
    var body={message:'Mapa de vendas por UF ('+new Date().toLocaleString('pt-BR')+')',branch:br,content:btoa(unescape(encodeURIComponent(JSON.stringify(V))))};
    if(sha)body.sha=sha;
    var p=await fetch(api,{method:'PUT',headers:Object.assign({'Content-Type':'application/json'},hdr),body:JSON.stringify(body)});
    if(!p.ok)throw new Error('GitHub respondeu '+p.status);
    publicado=clone(V);dirty=false;try{localStorage.removeItem(LS_DRAFT);}catch(e){}
    render();msg('✓ Mapa publicado. O cliente vê a nova versão em 1 a 2 minutos.','ok');
  }catch(err){msg('⚠ Não foi possível publicar: '+err.message,'err');}
}
function descartar(){
  if(!confirm('Descartar as importações não publicadas?'))return;
  try{localStorage.removeItem(LS_DRAFT);}catch(e){}
  V=clone(publicado||{v:1,meses:{}});dirty=false;render();
}
/* admin vê o rascunho dele; os demais, só o publicado */
function fonte(){
  var d=null;if(isAdmin()&&!CFG.demo){try{d=JSON.parse(localStorage.getItem(LS_DRAFT)||'null');}catch(e){}}
  if(d&&d.meses){V=d;dirty=true;}else{V=clone(publicado||{v:1,meses:{}});dirty=false;}
}

function ativo(){if(typeof CFG.ativo==='function')return CFG.ativo();var p=document.getElementById('page-mapa');return !!(p&&p.classList.contains('active'));}
function carregar(){
  var j=function(u){return fetch(u+'?t='+Date.now(),{cache:'no-store'}).then(function(r){if(!r.ok)throw new Error(u+': HTTP '+r.status);return r.json();});};
  Promise.all([V?Promise.resolve(V):j(FILE).catch(function(e){if(/404/.test(e.message))return {v:1,meses:{}};throw e;}),IB?Promise.resolve(IB):j('mapa/ibge-uf.json')])
    .then(function(x){publicado=x[0];IB=x[1];fonte();if(ativo())render();})
    .catch(function(e){erro=e.message||String(e);if(ativo())render();});
}
if(typeof window.adminApply==='function'){var aa=window.adminApply;window.adminApply=function(){var r=aa.apply(this,arguments);try{if(publicado){fonte();if(ativo())render();}}catch(e){}return r;};}

window.Mapa={render:render,set:set,sel:sel,tip:tip,importar:importar,publicar:publicar,descartar:descartar};
if(CFG.vendas&&CFG.ibge){publicado=clone(CFG.vendas);V=clone(CFG.vendas);}else carregar();
})();
