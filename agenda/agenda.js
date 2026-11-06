/* Agenda de fechamento — Hub Contábil (Belive / NHD Foods)
   Calendário do fechamento mensal com as tarefas do cliente e da contabilidade, progresso e prazos.
   Dados: agenda.json na raiz do repositório (o que todos veem). O admin edita aqui, o rascunho fica
   neste navegador (localStorage) até ele clicar em "Publicar agenda", que grava agenda.json pelo GitHub,
   com o mesmo token do "Publicar para todos". Quem não é admin só visualiza.
   Formato: {v:1, savedAt, comps:{'aaaa-mm':{inicio,prazo,tarefas:[{id,titulo,resp:'cliente'|'contador',data:'aaaa-mm-dd',status:'pendente'|'andamento'|'concluida',obs,concluidaEm}]}}} */
(function(){
'use strict';
var FILE='agenda.json', LS_DRAFT='nhdAgendaDraft', LS_VIEW='nhdAgendaView';
var MESES=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
var DSEM=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
/* feriados nacionais (dias úteis do modelo pulam estas datas) */
var FERIADOS={'2026-01-01':1,'2026-02-16':1,'2026-02-17':1,'2026-04-03':1,'2026-04-21':1,'2026-05-01':1,'2026-06-04':1,'2026-09-07':1,'2026-10-12':1,'2026-11-02':1,'2026-11-15':1,'2026-11-20':1,'2026-12-25':1,
  '2027-01-01':1,'2027-02-08':1,'2027-02-09':1,'2027-03-26':1,'2027-04-21':1,'2027-05-01':1,'2027-05-27':1,'2027-09-07':1,'2027-10-12':1,'2027-11-02':1,'2027-11-15':1,'2027-11-20':1,'2027-12-25':1};
/* modelo do fechamento: [responsável, tarefa, dia útil do mês seguinte à competência] */
var MODELO=[
  ['cliente','Enviar extratos bancários do mês (contas e aplicações)',2],
  ['cliente','Enviar relatório de contas a pagar e a receber',2],
  ['cliente','Enviar notas fiscais de entrada e saída pendentes',3],
  ['cliente','Enviar contratos e extratos de empréstimos, financiamentos e consórcios',3],
  ['contador','Importar balancete e razão do mês',3],
  ['contador','Conciliação bancária',4],
  ['contador','Conferência de faturamento',5],
  ['contador','Parcelamentos federais e estaduais',5],
  ['contador','Empréstimos, financiamentos e consórcios',6],
  ['contador','Book de conciliação (ativo, passivo e PL)',6],
  ['contador','Enviar pendências da conciliação ao cliente',6],
  ['cliente','Responder pendências da conciliação',8],
  ['contador','Provisões, ajustes e lançamentos finais',8],
  ['contador','Apuração de IRPJ e CSLL (LALUR)',9],
  ['contador','Publicar o Dash do mês',9],
  ['cliente','Reunião de resultado e aprovação do fechamento',10],
  ['contador','Reunião de resultado com o cliente',10]
];
var RESP={cliente:'Cliente (NHD)',contador:'Contabilidade (Audicon)'};
var ST={pendente:'Pendente',andamento:'Em andamento',concluida:'Concluída'};

var A=null, publicado=null, dirty=false, comp=null, calMes=null, diaSel=null, view='todas';
try{view=localStorage.getItem(LS_VIEW)||'todas';}catch(e){}

/* ---------- utilidades ---------- */
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function pad(n){return (n<10?'0':'')+n;}
function iso(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function parse(s){var p=s.split('-');return new Date(+p[0],+p[1]-1,+p[2]);}
function hoje(){return iso(new Date());}
function util(d){var w=d.getDay();return w!==0&&w!==6&&!FERIADOS[iso(d)];}
function diaUtil(ano,mes,n){var d=new Date(ano,mes,1),k=0;while(true){if(util(d)){k++;if(k===n)return iso(d);}d.setDate(d.getDate()+1);}}
function compNome(c){var p=c.split('-');return MESES[+p[1]-1]+'/'+p[0];}
function dataBR(s){var d=parse(s);return pad(d.getDate())+'/'+pad(d.getMonth()+1);}
function dataLonga(s){var d=parse(s);return DSEM[d.getDay()]+', '+d.getDate()+' de '+MESES[d.getMonth()].toLowerCase();}
function uid(){return 't'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function isAdmin(){return !!window.IS_ADMIN;}
function compAtual(){var d=new Date();d.setDate(1);d.setMonth(d.getMonth()-1);return d.getFullYear()+'-'+pad(d.getMonth()+1);}

function novaComp(c){
  var p=c.split('-'),ano=+p[0],mes=+p[1];/* execução no mês seguinte */
  if(mes===12){ano++;mes=0;}
  var tarefas=MODELO.map(function(m){return {id:uid(),titulo:m[1],resp:m[0],data:diaUtil(ano,mes,m[2]),status:'pendente',obs:''};});
  return {inicio:diaUtil(ano,mes,1),prazo:diaUtil(ano,mes,10),tarefas:tarefas};
}
function situacao(t){
  if(t.status==='concluida')return 'ok';
  var h=hoje();
  if(t.data<h)return 'atraso';
  var d=(parse(t.data)-parse(h))/864e5;
  return d<=2?'breve':'futuro';
}
function visiveis(c){var ts=(A.comps[c]||{tarefas:[]}).tarefas;return view==='todas'?ts:ts.filter(function(t){return t.resp===view;});}
function pct(ts){if(!ts.length)return 0;return Math.round(ts.filter(function(t){return t.status==='concluida';}).length/ts.length*100);}

/* ---------- dados ---------- */
function vazio(){return {v:1,savedAt:null,comps:{}};}
function salvarRascunho(){
  dirty=true;A.savedAt=new Date().toISOString();
  try{localStorage.setItem(LS_DRAFT,JSON.stringify({dados:A,base:publicado&&publicado.savedAt}));}catch(e){}
}
async function carregar(){
  try{var r=await fetch(FILE+'?t='+Date.now(),{cache:'no-store'});if(r.ok)publicado=await r.json();}catch(e){}
  if(!publicado||!publicado.comps)publicado=null;
  fonte();
  calMes=null;diaSel=null;
}
/* quem não é admin vê só a versão publicada; o admin vê o rascunho dele, se houver um mais novo que a publicação */
function fonte(){
  A=JSON.parse(JSON.stringify(publicado||vazio()));
  dirty=false;
  if(isAdmin()){
    try{
      var dr=JSON.parse(localStorage.getItem(LS_DRAFT)||'null');
      if(dr&&dr.dados&&(!publicado||!publicado.savedAt||dr.dados.savedAt>publicado.savedAt)){A=dr.dados;dirty=true;}
      else if(dr)localStorage.removeItem(LS_DRAFT);
    }catch(e){}
  }
  var cs=Object.keys(A.comps).sort();
  if(comp&&A.comps[comp])return;
  comp=cs.indexOf(compAtual())>=0?compAtual():(cs[cs.length-1]||null);
  calMes=null;diaSel=null;
}
async function publicar(){
  var msg=document.getElementById('agMsg');
  var token='';try{token=localStorage.getItem('nhdGhToken')||'';}catch(e){}
  if(!token){alert('Entre no Acesso admin com o token do GitHub para publicar.');return;}
  msg.textContent='Publicando a agenda...';msg.className='ag-msg';
  try{
    var repo=window.GH_REPO||'clecioferreiracontador-byte/nhdfoods-dashboard',br=window.GH_BRANCH||'main';
    var api='https://api.github.com/repos/'+repo+'/contents/'+FILE;
    var hdr={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json'};
    var sha,g=await fetch(api+'?ref='+br+'&t='+Date.now(),{headers:hdr,cache:'no-store'});
    if(g.status===200){
      var cur=await g.json();sha=cur.sha;
      try{var remoto=JSON.parse(decodeURIComponent(escape(atob(cur.content.replace(/\n/g,'')))));
        var base=publicado&&publicado.savedAt;
        if(remoto.savedAt&&base&&remoto.savedAt>base&&!confirm('Alguém publicou a agenda depois que você abriu esta página. Publicar mesmo assim e substituir a versão dela?'))
          {msg.textContent='Publicação cancelada.';return;}
      }catch(e){}
    }else if(g.status!==404)throw new Error(g.status===401||g.status===403?'token inválido ou sem permissão':'GitHub respondeu '+g.status);
    A.savedAt=new Date().toISOString();
    var body={message:'Agenda de fechamento ('+new Date().toLocaleString('pt-BR')+')',branch:br,content:btoa(unescape(encodeURIComponent(JSON.stringify(A,null,1))))};
    if(sha)body.sha=sha;
    var p=await fetch(api,{method:'PUT',headers:Object.assign({'Content-Type':'application/json'},hdr),body:JSON.stringify(body)});
    if(!p.ok)throw new Error('GitHub respondeu '+p.status);
    publicado=JSON.parse(JSON.stringify(A));dirty=false;
    try{localStorage.removeItem(LS_DRAFT);}catch(e){}
    render();
    var m2=document.getElementById('agMsg');m2.textContent='✓ Agenda publicada. O cliente vê a nova versão em 1 a 2 minutos.';m2.className='ag-msg ok';
  }catch(err){msg.textContent='⚠ Não foi possível publicar: '+err.message;msg.className='ag-msg err';}
}
function descartar(){
  if(!confirm('Descartar as alterações não publicadas e voltar para a agenda publicada?'))return;
  try{localStorage.removeItem(LS_DRAFT);}catch(e){}
  A=JSON.parse(JSON.stringify(publicado||vazio()));dirty=false;
  if(comp&&!A.comps[comp])comp=Object.keys(A.comps).sort().pop()||null;
  render();
}

/* ---------- render ---------- */
function render(){
  var el=document.getElementById('agendaRoot');if(!el||!A)return;
  var adm=isAdmin(), cs=Object.keys(A.comps).sort();
  var h='<div class="ag-head"><div><div class="ptitle">Agenda de fechamento</div><div class="psub">Datas e tarefas do fechamento mensal, do cliente e da contabilidade, com o andamento de cada uma.</div></div>';
  if(adm)h+='<div class="ag-admin">'+(dirty?'<span class="ag-dirty">● Alterações não publicadas</span><button class="fs" onclick="Agenda.descartar()">Descartar</button>':'')+
    '<button class="fs ag-pub" onclick="Agenda.publicar()"'+(dirty?'':' disabled')+'>🌐 Publicar agenda</button></div>';
  h+='</div><div id="agMsg" class="ag-msg"></div>';

  if(!cs.length){
    h+='<div class="cc ag-empty">'+(adm?
      '<p>Nenhuma agenda criada ainda.</p><p class="ag-note">Crie a agenda a partir do modelo de fechamento (17 tarefas nos 10 primeiros dias úteis do mês seguinte). Depois você ajusta datas e tarefas e publica.</p><div class="ag-row"><label class="fl" for="agNovaC">Competência</label>'+selNova()+'<button class="fs ag-pri" onclick="Agenda.criar()">Criar agenda</button></div>':
      '<p>A agenda de fechamento ainda não foi publicada pela contabilidade.</p>')+'</div>';
    el.innerHTML=h;return;
  }
  var C=A.comps[comp], todas=C.tarefas, ts=visiveis(comp);
  /* barra de filtros */
  h+='<div class="ag-bar"><label class="fl" for="agComp">Competência</label><select class="fs" id="agComp" onchange="Agenda.setComp(this.value)">'+
    cs.slice().reverse().map(function(c){return '<option value="'+c+'"'+(c===comp?' selected':'')+'>'+compNome(c)+'</option>';}).join('')+'</select>'+
    '<span class="ag-seg" role="group" aria-label="Ver agenda de">'+[['todas','Todas'],['cliente','Cliente'],['contador','Contabilidade']].map(function(v){
      return '<button class="'+(view===v[0]?'on':'')+'" onclick="Agenda.setView(\''+v[0]+'\')">'+v[1]+'</button>';}).join('')+'</span>'+
    (adm?'<span class="ag-sp"></span>'+selNova()+'<button class="fs" onclick="Agenda.criar()">+ Nova competência</button>':'')+'</div>';

  /* progresso */
  var pc=pct(todas.filter(function(t){return t.resp==='cliente';})), pa=pct(todas.filter(function(t){return t.resp==='contador';})), pg=pct(ts);
  var atr=ts.filter(function(t){return situacao(t)==='atraso';}).length, brev=ts.filter(function(t){return situacao(t)==='breve';}).length;
  var conc=ts.filter(function(t){return t.status==='concluida';}).length;
  var fim=todas.reduce(function(m,t){return t.data>m?t.data:m;},C.prazo||'');
  h+='<div class="ag-kpis">'+
    kpi('Progresso '+(view==='todas'?'geral':view==='cliente'?'do cliente':'da contabilidade'),pg+'%',conc+' de '+ts.length+' tarefas concluídas',pg,'gold')+
    (view!=='contador'?kpi('Cliente',pc+'%',RESP.cliente,pc,'cli'):'')+
    (view!=='cliente'?kpi('Contabilidade',pa+'%',RESP.contador,pa,'ctb'):'')+
    '<div class="kcard ag-k"><div class="klbl">Prazos</div><div class="kval '+(atr?'ag-red':'')+'">'+atr+' atrasada'+(atr===1?'':'s')+'</div><div class="ksub">'+brev+' vence'+(brev===1?'':'m')+' em até 2 dias · fim previsto '+(fim?dataBR(fim):'—')+'</div></div>'+
    '</div>';

  /* calendário + lista do dia */
  if(!calMes)calMes=(C.inicio||todas[0]&&todas[0].data||hoje()).slice(0,7);
  h+='<div class="ag-main"><div class="cc ag-cal">'+cal(ts)+'</div><div class="cc ag-day" id="agDay">'+dia(ts)+'</div></div>';

  /* lista completa */
  h+='<div class="cc ag-list"><div class="ag-lh"><div class="ctitle">Todas as tarefas · '+compNome(comp)+'</div><span class="ag-legend"><i class="cli"></i>Cliente <i class="ctb"></i>Contabilidade</span></div>'+lista(ts)+'</div>';
  if(!adm)h+='<p class="ag-note ag-foot">Para atualizar uma tarefa, fale com a contabilidade. A agenda mostrada é a última versão publicada.</p>';
  el.innerHTML=h;
}
function kpi(l,v,s,p,cls){return '<div class="kcard ag-k"><div class="klbl">'+esc(l)+'</div><div class="kval">'+v+'</div><div class="ag-pbar '+cls+'"><span style="width:'+p+'%"></span></div><div class="ksub">'+esc(s)+'</div></div>';}
function selNova(){
  var d=new Date();d.setDate(1);d.setMonth(d.getMonth()-3);var o='';
  for(var i=0;i<6;i++){var c=d.getFullYear()+'-'+pad(d.getMonth()+1);if(!A.comps[c])o+='<option value="'+c+'"'+(c===compAtual()?' selected':'')+'>'+compNome(c)+'</option>';d.setMonth(d.getMonth()+1);}
  return '<select class="fs" id="agNovaC" aria-label="Competência da nova agenda">'+o+'</select>';
}
function cal(ts){
  var p=calMes.split('-'),ano=+p[0],mes=+p[1]-1, d1=new Date(ano,mes,1), ini=d1.getDay(), nd=new Date(ano,mes+1,0).getDate(), h=hoje();
  var por={};ts.forEach(function(t){(por[t.data]=por[t.data]||[]).push(t);});
  var o='<div class="ag-ch"><button class="fs ag-nav" onclick="Agenda.mes(-1)" aria-label="Mês anterior">‹</button><div class="ctitle">'+MESES[mes]+' '+ano+'</div><button class="fs ag-nav" onclick="Agenda.mes(1)" aria-label="Próximo mês">›</button></div>';
  o+='<div class="ag-grid">'+DSEM.map(function(x){return '<div class="ag-dw">'+x+'</div>';}).join('');
  for(var i=0;i<ini;i++)o+='<div class="ag-c ag-out"></div>';
  for(var n=1;n<=nd;n++){
    var ds=ano+'-'+pad(mes+1)+'-'+pad(n), lst=por[ds]||[], dt=new Date(ano,mes,n);
    var cls='ag-c'+(util(dt)?'':' ag-nu')+(ds===h?' ag-today':'')+(ds===diaSel?' ag-sel':'')+(lst.length?' ag-has':'');
    var feitos=lst.filter(function(t){return t.status==='concluida';}).length, atr=lst.some(function(t){return situacao(t)==='atraso';});
    o+='<button class="'+cls+'" onclick="Agenda.dia(\''+ds+'\')" aria-label="'+esc(dataLonga(ds))+(lst.length?', '+lst.length+' tarefas, '+feitos+' concluídas':'')+'"><span class="ag-n">'+n+'</span>';
    if(lst.length){
      o+='<span class="ag-chips">'+lst.slice(0,3).map(function(t){return '<span class="ag-chip '+(t.resp==='cliente'?'cli':'ctb')+' s-'+situacao(t)+'">'+esc(t.titulo)+'</span>';}).join('')+(lst.length>3?'<span class="ag-more">+'+(lst.length-3)+'</span>':'')+'</span>';
      o+='<span class="ag-dots">'+lst.map(function(t){return '<i class="'+(t.resp==='cliente'?'cli':'ctb')+' s-'+situacao(t)+'"></i>';}).join('')+'</span>';
      o+='<span class="ag-cnt'+(atr?' ag-red':feitos===lst.length?' ag-grn':'')+'">'+feitos+'/'+lst.length+'</span>';
    }
    o+='</button>';
  }
  return o+'</div>';
}
function dia(ts){
  var d=diaSel||hoje(), lst=ts.filter(function(t){return t.data===d;}), adm=isAdmin();
  var o='<div class="ag-lh"><div class="ctitle">'+esc(dataLonga(d))+'</div>'+(adm?'<button class="fs ag-pri" onclick="Agenda.editar(null,\''+d+'\')">+ Tarefa</button>':'')+'</div>';
  if(!lst.length)o+='<p class="ag-note">'+(diaSel?'Nenhuma tarefa neste dia.':'Nenhuma tarefa hoje. Toque em um dia do calendário para ver as tarefas.')+'</p>';
  return o+lst.map(item).join('');
}
function lista(ts){
  if(!ts.length)return '<p class="ag-note">Nenhuma tarefa nesta visão.</p>';
  var g={};ts.slice().sort(function(a,b){return a.data.localeCompare(b.data)||a.resp.localeCompare(b.resp);}).forEach(function(t){(g[t.data]=g[t.data]||[]).push(t);});
  return Object.keys(g).map(function(d){return '<div class="ag-grp"><div class="ag-gd'+(d===hoje()?' ag-gtoday':'')+'">'+esc(dataLonga(d))+(d===hoje()?' · hoje':'')+'</div>'+g[d].map(item).join('')+'</div>';}).join('');
}
function item(t){
  var s=situacao(t), adm=isAdmin();
  var badge=t.status==='concluida'?'<span class="ag-st ok">✓ Concluída</span>':s==='atraso'?'<span class="ag-st atr">Atrasada</span>':t.status==='andamento'?'<span class="ag-st and">Em andamento</span>':'<span class="ag-st pen">Pendente</span>';
  var o='<div class="ag-it '+(t.resp==='cliente'?'cli':'ctb')+(t.status==='concluida'?' done':'')+'">';
  if(adm)o+='<button class="ag-chk" onclick="Agenda.ciclo(\''+t.id+'\')" title="Mudar status (pendente → em andamento → concluída)" aria-label="Mudar status de '+esc(t.titulo)+'">'+(t.status==='concluida'?'✓':t.status==='andamento'?'◐':'')+'</button>';
  else o+='<span class="ag-chk ro" aria-hidden="true">'+(t.status==='concluida'?'✓':t.status==='andamento'?'◐':'')+'</span>';
  o+='<div class="ag-it-b"><div class="ag-it-t">'+esc(t.titulo)+'</div><div class="ag-it-m"><span class="ag-who">'+RESP[t.resp]+'</span> · '+dataBR(t.data)+' '+badge+'</div>'+(t.obs?'<div class="ag-obs">'+esc(t.obs)+'</div>':'')+'</div>';
  if(adm)o+='<button class="fs ag-ed" onclick="Agenda.editar(\''+t.id+'\')" aria-label="Editar '+esc(t.titulo)+'">Editar</button>';
  return o+'</div>';
}

/* ---------- edição (admin) ---------- */
function acha(id){return A.comps[comp].tarefas.filter(function(t){return t.id===id;})[0];}
function editar(id,data){
  if(!isAdmin())return;
  var t=id?acha(id):{id:null,titulo:'',resp:view==='cliente'?'cliente':'contador',data:data||diaSel||hoje(),status:'pendente',obs:''};
  var m=document.getElementById('agModal');
  m.innerHTML='<form class="ag-dlg" onsubmit="Agenda.salvar(event)"><div class="ctitle">'+(id?'Editar tarefa':'Nova tarefa')+'</div>'+
    '<input type="hidden" id="agfId" value="'+esc(t.id||'')+'">'+
    '<label>Tarefa<input class="fs" id="agfT" required maxlength="160" value="'+esc(t.titulo)+'"></label>'+
    '<div class="ag-2"><label>Responsável<select class="fs" id="agfR"><option value="cliente"'+(t.resp==='cliente'?' selected':'')+'>Cliente (NHD)</option><option value="contador"'+(t.resp==='contador'?' selected':'')+'>Contabilidade (Audicon)</option></select></label>'+
    '<label>Data<input class="fs" type="date" id="agfD" required value="'+esc(t.data)+'"></label></div>'+
    '<label>Status<select class="fs" id="agfS">'+Object.keys(ST).map(function(k){return '<option value="'+k+'"'+(t.status===k?' selected':'')+'>'+ST[k]+'</option>';}).join('')+'</select></label>'+
    '<label>Observação<textarea class="fs" id="agfO" rows="3" maxlength="600">'+esc(t.obs||'')+'</textarea></label>'+
    '<div class="ag-acts">'+(id?'<button type="button" class="fs ag-del" onclick="Agenda.excluir(\''+t.id+'\')">Excluir</button>':'')+'<span class="ag-sp"></span><button type="button" class="fs" onclick="Agenda.fechar()">Cancelar</button><button class="fs ag-pri">Salvar</button></div></form>';
  m.classList.add('on');
  setTimeout(function(){var i=document.getElementById('agfT');if(i)i.focus();},30);
}
function salvar(e){
  e.preventDefault();
  var id=document.getElementById('agfId').value, st=document.getElementById('agfS').value;
  var v={titulo:document.getElementById('agfT').value.trim(),resp:document.getElementById('agfR').value,data:document.getElementById('agfD').value,status:st,obs:document.getElementById('agfO').value.trim()};
  if(!v.titulo||!v.data)return;
  var t=id?acha(id):null;
  if(t){if(st==='concluida'&&t.status!=='concluida')v.concluidaEm=hoje();if(st!=='concluida')v.concluidaEm=null;Object.assign(t,v);}
  else{v.id=uid();if(st==='concluida')v.concluidaEm=hoje();A.comps[comp].tarefas.push(v);}
  diaSel=v.data;calMes=v.data.slice(0,7);
  salvarRascunho();fechar();render();
}
function excluir(id){
  if(!confirm('Excluir esta tarefa?'))return;
  A.comps[comp].tarefas=A.comps[comp].tarefas.filter(function(t){return t.id!==id;});
  salvarRascunho();fechar();render();
}
function ciclo(id){
  if(!isAdmin())return;var t=acha(id);
  t.status=t.status==='pendente'?'andamento':t.status==='andamento'?'concluida':'pendente';
  t.concluidaEm=t.status==='concluida'?hoje():null;
  salvarRascunho();render();
}
function fechar(){var m=document.getElementById('agModal');m.classList.remove('on');m.innerHTML='';}
function criar(){
  if(!isAdmin())return;
  var s=document.getElementById('agNovaC');if(!s||!s.value){alert('Todas as competências desta lista já têm agenda.');return;}
  var c=s.value;if(A.comps[c]){comp=c;render();return;}
  A.comps[c]=novaComp(c);comp=c;calMes=null;diaSel=null;
  salvarRascunho();render();
}

/* ---------- estilos ---------- */
var css='\
#agendaRoot{display:flex;flex-direction:column;gap:14px}\
.ag-head{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:flex-end;justify-content:space-between}\
.ag-admin{display:flex;flex-wrap:wrap;gap:8px;align-items:center}\
.ag-dirty{color:var(--amber);font-size:13px;font-weight:600}\
.ag-pub{border-color:rgba(52,152,219,.6)!important;color:var(--blue2)!important}.ag-pub[disabled]{opacity:.45;cursor:default}\
.ag-pri{background:rgba(201,168,76,.18)!important;border-color:var(--gold)!important;color:var(--g2)!important;font-weight:700!important}\
.ag-del{border-color:rgba(231,76,60,.6)!important;color:var(--red2)!important}\
.ag-msg{font-size:13px;color:var(--gray2);min-height:0}.ag-msg:empty{display:none}.ag-msg.ok{color:var(--green2)}.ag-msg.err{color:var(--red2)}\
.ag-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.ag-sp{flex:1}\
.ag-seg{display:inline-flex;border:1px solid rgba(201,168,76,.35);border-radius:7px;overflow:hidden}\
.ag-seg button{background:transparent;border:0;color:var(--gray2);padding:5px 12px;font:inherit;font-size:14px;cursor:pointer}\
.ag-seg button.on{background:rgba(201,168,76,.18);color:var(--g2);font-weight:700}\
.ag-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:11px}\
.ag-k .klbl{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--gray);font-weight:700}\
.ag-k .kval{font-size:26px;font-weight:800;margin:2px 0 6px}.ag-k .ksub{font-size:12.5px;color:var(--gray2)}\
.ag-pbar{height:7px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden;margin-bottom:6px}\
.ag-pbar span{display:block;height:100%;border-radius:99px;transition:width .4s}\
.ag-pbar.gold span{background:var(--gold)}.ag-pbar.cli span{background:#5DADE2}.ag-pbar.ctb span{background:#C9A84C}\
.ag-red{color:var(--red2)!important}.ag-grn{color:var(--green2)!important}\
.ag-main{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);gap:12px;align-items:start}\
.ag-ch{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.ag-nav{min-width:34px}\
.ag-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}\
.ag-dw{font-size:11.5px;color:var(--gray);text-align:center;font-weight:700;text-transform:uppercase;padding-bottom:2px}\
.ag-c{position:relative;min-height:86px;background:rgba(255,255,255,.025);border:1px solid rgba(201,168,76,.10);border-radius:7px;padding:4px 5px;text-align:left;color:var(--white);font:inherit;cursor:pointer;display:flex;flex-direction:column;gap:3px;min-width:0;overflow:hidden}\
.ag-c:hover{border-color:rgba(201,168,76,.45)}.ag-out{visibility:hidden}.ag-nu{background:transparent;opacity:.55}\
.ag-today{border-color:var(--gold)!important;box-shadow:inset 0 0 0 1px var(--gold)}.ag-sel{background:rgba(201,168,76,.14)!important;border-color:var(--gold)!important}\
.ag-n{font-size:13px;font-weight:700}.ag-today .ag-n{color:var(--g2)}\
.ag-chips{display:flex;flex-direction:column;gap:2px;min-width:0}\
.ag-chip{font-size:11px;line-height:1.25;padding:1px 5px;border-radius:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-left:3px solid}\
.ag-chip.cli{background:rgba(93,173,226,.14);border-color:#5DADE2}.ag-chip.ctb{background:rgba(201,168,76,.14);border-color:#C9A84C}\
.ag-chip.s-ok{opacity:.5;text-decoration:line-through}.ag-chip.s-atraso{background:rgba(231,76,60,.2);border-color:var(--red2)}\
.ag-more{font-size:11px;color:var(--gray2)}.ag-dots{display:none}.ag-cnt{position:absolute;right:5px;top:4px;font-size:11px;color:var(--gray2);font-weight:700}\
.ag-lh{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;flex-wrap:wrap}\
.ag-legend{font-size:12.5px;color:var(--gray2);display:flex;align-items:center;gap:6px}.ag-legend i{width:10px;height:10px;border-radius:3px;display:inline-block;margin-left:6px}\
.ag-legend i.cli{background:#5DADE2}.ag-legend i.ctb{background:#C9A84C}\
.ag-it{display:flex;gap:10px;align-items:flex-start;padding:9px 10px;border-radius:8px;background:rgba(255,255,255,.03);border-left:3px solid;margin-bottom:6px}\
.ag-it.cli{border-color:#5DADE2}.ag-it.ctb{border-color:#C9A84C}.ag-it.done .ag-it-t{text-decoration:line-through;opacity:.6}\
.ag-chk{flex:none;width:24px;height:24px;border-radius:6px;border:1.5px solid rgba(201,168,76,.6);background:transparent;color:var(--green2);font-weight:800;font-size:14px;line-height:1;cursor:pointer;display:grid;place-items:center}\
.ag-chk.ro{cursor:default;border-color:rgba(255,255,255,.25)}.ag-it.done .ag-chk{background:rgba(46,204,113,.15);border-color:var(--green2)}\
.ag-it-b{flex:1;min-width:0}.ag-it-t{font-weight:600;overflow-wrap:anywhere}.ag-it-m{font-size:12.5px;color:var(--gray2);display:flex;flex-wrap:wrap;gap:4px 6px;align-items:center;margin-top:2px}\
.ag-obs{font-size:12.5px;color:var(--gray2);margin-top:4px;font-style:italic;overflow-wrap:anywhere}\
.ag-st{font-size:11.5px;font-weight:700;padding:1px 8px;border-radius:99px}\
.ag-st.ok{background:rgba(46,204,113,.15);color:var(--green2)}.ag-st.atr{background:rgba(231,76,60,.18);color:var(--red2)}\
.ag-st.and{background:rgba(52,152,219,.18);color:var(--blue2)}.ag-st.pen{background:rgba(255,255,255,.07);color:var(--gray2)}\
.ag-ed{flex:none;font-size:12.5px!important;padding:3px 9px!important}\
.ag-grp{margin-bottom:10px}.ag-gd{font-size:12.5px;font-weight:700;color:var(--gray);text-transform:uppercase;letter-spacing:.04em;margin:4px 0 6px}.ag-gtoday{color:var(--g2)}\
.ag-note{font-size:13px;color:var(--gray2)}.ag-foot{text-align:center}\
.ag-empty{display:flex;flex-direction:column;gap:10px}.ag-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}\
#agModal{position:fixed;inset:0;z-index:9999;background:rgba(5,10,20,.7);display:none;align-items:center;justify-content:center;padding:16px}\
#agModal.on{display:flex}\
.ag-dlg{background:var(--n3);border:1px solid rgba(201,168,76,.35);border-radius:12px;padding:18px;width:min(480px,100%);max-height:92vh;overflow:auto;display:flex;flex-direction:column;gap:12px}\
.ag-dlg label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--gray2);font-weight:600}\
.ag-dlg .fs{width:100%;font-weight:400}.ag-dlg textarea{resize:vertical}\
.ag-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ag-acts{display:flex;gap:8px;align-items:center}\
@media(max-width:1100px){.ag-main{grid-template-columns:minmax(0,1fr)}}\
@media(max-width:640px){\
 .ag-c{min-height:52px;padding:3px;align-items:center}.ag-chips,.ag-cnt{display:none}\
 .ag-dots{display:flex;flex-wrap:wrap;gap:2px;justify-content:center}.ag-dots i{width:6px;height:6px;border-radius:50%}\
 .ag-dots i.cli{background:#5DADE2}.ag-dots i.ctb{background:#C9A84C}.ag-dots i.s-ok{opacity:.35}.ag-dots i.s-atraso{background:var(--red2)}\
 .ag-grid{gap:3px}.ag-dw{font-size:10px}.ag-k .kval{font-size:22px}\
 .ag-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.ag-kpis .ag-k:first-child{grid-column:1/-1}\
 .ag-2{grid-template-columns:1fr}.ag-seg button{padding:5px 9px}\
}';
var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);

/* ---------- API pública e integração ---------- */
window.Agenda={
  init:async function(){
    if(!document.getElementById('agModal')){var m=document.createElement('div');m.id='agModal';m.onclick=function(e){if(e.target===m)fechar();};document.body.appendChild(m);}
    await carregar();render();
  },
  render:render,publicar:publicar,descartar:descartar,criar:criar,editar:editar,salvar:salvar,excluir:excluir,ciclo:ciclo,fechar:fechar,
  setComp:function(c){comp=c;calMes=null;diaSel=null;render();},
  setView:function(v){view=v;try{localStorage.setItem(LS_VIEW,v);}catch(e){}render();},
  mes:function(k){var p=calMes.split('-'),d=new Date(+p[0],+p[1]-1+k,1);calMes=d.getFullYear()+'-'+pad(d.getMonth()+1);render();},
  dia:function(d){diaSel=d;render();if(window.innerWidth<=1100){var e=document.getElementById('agDay');if(e)e.scrollIntoView({behavior:'smooth',block:'start'});}}
};
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&document.getElementById('agModal')&&document.getElementById('agModal').classList.contains('on'))fechar();});
/* reapresenta ao entrar/sair do admin (botões de edição) */
if(typeof window.adminApply==='function'){var orig=window.adminApply;window.adminApply=function(on){orig(on);if(A){fonte();render();}};}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',window.Agenda.init);else window.Agenda.init();
})();
