/* ============================================================
   Consentimento de cookies — Google Analytics 4
   O GA só é carregado depois de "Aceitar". Sem aceite, nenhuma
   requisição ao Google e nenhum cookie _ga é criado.
   ============================================================ */
(function () {
  'use strict';

  var CHAVE = 'consentimento-analytics';
  var GA_ID = 'G-L1BM28TN18';
  var COOKIES = ['_ga', '_ga_L1BM28TN18'];
  var banner = null;

  function lerEscolha() {
    try {
      return localStorage.getItem(CHAVE);
    } catch (e) {
      return null;
    }
  }

  function salvarEscolha(valor) {
    try {
      localStorage.setItem(CHAVE, valor);
    } catch (e) {}
  }

  function apagarCookiesGA() {
    COOKIES.forEach(function (nome) {
      document.cookie = nome + '=; Max-Age=0; path=/; SameSite=Lax';
      document.cookie = nome + '=; Max-Age=0; path=/; domain=' +
        location.hostname + '; SameSite=Lax';
    });
  }

  function carregarGA() {
    if (window.__gaCarregado) return;
    window.__gaCarregado = true;

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };

    gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied'
    });
    gtag('consent', 'update', { analytics_storage: 'granted' });
    gtag('js', new Date());
    gtag('config', GA_ID);

    var preconnect = document.createElement('link');
    preconnect.rel = 'preconnect';
    preconnect.href = 'https://www.googletagmanager.com';
    document.head.appendChild(preconnect);

    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(script);
  }

  function fecharBanner() {
    if (banner) banner.hidden = true;
    document.body.classList.remove('consent-visivel');
  }

  function aceitar() {
    salvarEscolha('aceito');
    fecharBanner();
    carregarGA();
  }

  function recusar() {
    var tinhaGA = window.__gaCarregado === true;
    salvarEscolha('recusado');
    fecharBanner();

    if (tinhaGA && window.gtag) {
      window.gtag('consent', 'update', { analytics_storage: 'denied' });
      apagarCookiesGA();
      location.reload();
    }
  }

  function criarBanner() {
    if (banner) return banner;

    banner = document.createElement('div');
    banner.className = 'consent';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Consentimento de cookies');
    banner.hidden = true;

    var texto = document.createElement('p');
    texto.className = 'consent-texto';
    texto.textContent = 'Usamos cookies do Google Analytics para medir audiência ' +
      '(páginas vistas e tempo de permanência). Você pode aceitar ou recusar. ';
    var link = document.createElement('a');
    link.href = 'privacidade.html';
    link.textContent = 'Saiba mais';
    texto.appendChild(link);
    texto.appendChild(document.createTextNode('.'));

    var acoes = document.createElement('div');
    acoes.className = 'consent-acoes';

    var recusarBotao = document.createElement('button');
    recusarBotao.type = 'button';
    recusarBotao.className = 'consent-botao consent-recusar';
    recusarBotao.textContent = 'Recusar';
    recusarBotao.addEventListener('click', recusar);

    var aceitarBotao = document.createElement('button');
    aceitarBotao.type = 'button';
    aceitarBotao.className = 'consent-botao consent-aceitar';
    aceitarBotao.textContent = 'Aceitar';
    aceitarBotao.addEventListener('click', aceitar);

    acoes.appendChild(recusarBotao);
    acoes.appendChild(aceitarBotao);
    banner.appendChild(texto);
    banner.appendChild(acoes);
    document.body.appendChild(banner);
    return banner;
  }

  function abrirBanner() {
    criarBanner();
    banner.hidden = false;
    document.body.classList.add('consent-visivel');
    var botao = banner.querySelector('.consent-aceitar');
    if (botao) botao.focus();
  }

  function iniciar() {
    var escolha = lerEscolha();

    if (escolha !== 'aceito') {
      apagarCookiesGA();
    }

    if (escolha === 'aceito') {
      carregarGA();
    } else if (!escolha) {
      abrirBanner();
    }

    var botoes = document.querySelectorAll('[data-cookies]');
    for (var i = 0; i < botoes.length; i++) {
      botoes[i].addEventListener('click', abrirBanner);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
