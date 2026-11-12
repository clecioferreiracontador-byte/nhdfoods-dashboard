/* Áreas de importação recolhíveis (painéis da Conciliação).
   Cada elemento com data-recolher="Título" ganha uma barra fina "▸ Título" logo acima: clicar abre ou recolhe.
   A escolha fica guardada neste navegador, por painel e por área. Começa recolhida. */
(function(){
  var css = '.rec-bar{display:flex;align-items:center;gap:6px;width:100%;background:transparent;border:0;border-bottom:1px dashed rgba(205,154,86,.55);'
    + 'padding:2px 2px 6px;margin:0 0 8px;font:inherit;font-size:.82rem;font-weight:600;color:#122A4F;cursor:pointer;text-align:left;border-radius:0}'
    + '.rec-bar:hover{color:#B5833F;background:transparent}.rec-seta{color:#CD9A56;width:12px;display:inline-block}'
    + '.rec-dica{font-weight:400;color:#69727D;font-size:.74rem}[data-recolher][hidden]{display:none!important}'
    + 'body.leitura .rec-bar{display:none!important}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  function iniciar(){
    var pag = location.pathname.split('/').pop() || 'painel';
    Array.prototype.forEach.call(document.querySelectorAll('[data-recolher]'), function(el, i){
      if (el.dataset.recIni) return; el.dataset.recIni = '1';
      var chave = 'aud-recolher:' + pag + ':' + (el.id || i), titulo = el.getAttribute('data-recolher');
      var bar = document.createElement('button'); bar.type = 'button'; bar.className = 'rec-bar';
      function aplicar(min, guardar){
        el.hidden = min;
        bar.innerHTML = '<span class="rec-seta">' + (min ? '▸' : '▾') + '</span>' + titulo + (min ? ' <span class="rec-dica">· clique para abrir</span>' : '');
        bar.setAttribute('aria-expanded', min ? 'false' : 'true');
        if (guardar){ try { localStorage.setItem(chave, min ? '1' : '0'); } catch(e){} }
      }
      bar.addEventListener('click', function(){ aplicar(!el.hidden, true); });
      el.parentNode.insertBefore(bar, el);
      var salvo = null; try { salvo = localStorage.getItem(chave); } catch(e){}
      aplicar(salvo === null ? true : salvo === '1', false);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
