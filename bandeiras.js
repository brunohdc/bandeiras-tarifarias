/* ============================================================
   Histórico das bandeiras tarifárias — ANEEL (2015–…)
   Lê data/bandeiras.json e renderiza a página.
   Fallback: JSON embutido no HTML (funciona com file://)
   ============================================================ */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  var MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
                      'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
                      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  var R100 = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2, maximumFractionDigits: 3
  });
  var RKWH = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 5, maximumFractionDigits: 5
  });
  var DATA_LONGA = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC'
  });

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- Utilidades de data e formato ---------- */
  function partes(comp) {
    return { ano: +comp.slice(0, 4), mes: +comp.slice(5, 7) };
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function rotuloCurto(comp) {
    var p = partes(comp);
    return MESES_CURTOS[p.mes - 1] + '/' + p.ano;
  }
  function rotuloLongo(comp) {
    var p = partes(comp);
    return primeiraMaiuscula(MESES_LONGOS[p.mes - 1]) + ' de ' + p.ano;
  }
  function primeiraMaiuscula(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }
  function dataLonga(iso) {
    if (!iso) return '—';
    var d = new Date(iso + 'T00:00:00Z');
    return isNaN(d.getTime()) ? '—' : DATA_LONGA.format(d);
  }
  function vigenciaMes(comp) {
    var p = partes(comp);
    var ultimo = new Date(Date.UTC(p.ano, p.mes, 0)).getUTCDate();
    return '01/' + pad(p.mes) + '/' + p.ano + ' a ' +
           pad(ultimo) + '/' + pad(p.mes) + '/' + p.ano;
  }
  function competenciaAtual() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  }

  function adicional100(mes) { return mes.adicionalMwh / 10; }

  function textoAdicionalCurto(mes) {
    if (!mes.adicionalMwh) return 'sem acréscimo';
    return 'R$ ' + R100.format(adicional100(mes)) + ' / 100 kWh';
  }
  function textoAdicionalLongo(mes) {
    if (!mes.adicionalMwh) return 'R$ 0,00 a cada 100 kWh (sem acréscimo)';
    return 'R$ ' + R100.format(adicional100(mes)) + ' a cada 100 kWh (' +
           RKWH.format(mes.adicionalKwh) + '/kWh)';
  }

  function montarLink(el, href, rotulo) {
    if (!el) return;
    el.setAttribute('href', href);
    el.textContent = rotulo;
    var span = document.createElement('span');
    span.className = 'externo';
    span.textContent = ' (site externo)';
    el.appendChild(span);
  }

  function svgEl(nome, attrs) {
    var n = document.createElementNS(SVG_NS, nome);
    for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    }
    return n;
  }

  var dadosAtuais = null;
  var anos = [];
  var anoSelecionado = null;
  var refs = { linhas: {}, pontos: {}, rotulos: {} };
  var resumoAno = {};

  /* ---------- 1. Bandeira vigente ---------- */
  function renderVigente(dados) {
    var v = dados.vigente;
    var definicao = null;
    dados.bandeiras.forEach(function (b) {
      if (b.chave === v.chave) definicao = b;
    });

    var bloco = $('titulo-vigente').closest('.cartao');
    bloco.classList.add('bandeira-' + v.chave + '-bloco');

    $('vig-icone').className = 'bandeira-icone bandeira-' + v.chave;
    $('vig-nome').textContent = v.bandeira;
    $('vig-descricao').textContent = definicao ? definicao.descricao : '';
    $('vig-mes').textContent = rotuloLongo(v.competencia);
    $('vig-vigencia').textContent = vigenciaMes(v.competencia);
    $('vig-adicional').textContent = textoAdicionalLongo(v);
    $('vig-atualizado').textContent = dataLonga(dados.fonte.atualizadoEm);

    var serie = 'Licença ' + dados.fonte.licenca.split(' (')[0] +
      ' · série de ' + rotuloCurto(dados.meses[0].competencia) +
      ' a ' + rotuloCurto(v.competencia);
    $('vig-serie').textContent = serie;

    montarLink($('vig-fonte'), dados.fonte.url, dados.fonte.nome);

    var aviso = $('vig-aviso');
    if (v.competencia !== competenciaAtual()) {
      aviso.hidden = false;
      aviso.textContent = 'O mês mais recente disponível nos dados é ' +
        rotuloLongo(v.competencia) + '; a ANEEL ainda não publicou o mês corrente.';
    } else {
      aviso.hidden = true;
      aviso.textContent = '';
    }
  }

  /* ---------- 2. Agenda de divulgação ---------- */
  var DATA_COM_DIA = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC'
  });

  function dataCurta(iso) {
    if (!iso) return '—';
    return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
  }
  function dataLongaComDia(iso) {
    if (!iso) return '—';
    var d = new Date(iso + 'T00:00:00Z');
    return isNaN(d.getTime()) ? '—' : primeiraMaiuscula(DATA_COM_DIA.format(d));
  }
  function hojeISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function diasAte(iso) {
    var hoje = new Date(hojeISO() + 'T00:00:00Z');
    var alvo = new Date(iso + 'T00:00:00Z');
    return Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
  }
  function quandoRelativo(dias) {
    if (dias === 0) return 'hoje';
    if (dias === 1) return 'amanhã';
    return 'em ' + dias + ' dias';
  }

  function renderAgenda(dados, agenda) {
    var secao = $('titulo-agenda').closest('.cartao');
    if (!agenda || !agenda.divulgacoes || !agenda.divulgacoes.length) {
      secao.hidden = true;
      return;
    }

    var porCompetencia = {};
    dados.meses.forEach(function (mes) { porCompetencia[mes.competencia] = mes; });

    var lista = agenda.divulgacoes.slice().sort(function (a, b) {
      return a.data < b.data ? -1 : 1;
    });
    var hoje = hojeISO();
    var anoAtual = String(new Date().getFullYear());

    $('agenda-ano').textContent = '· ' + agenda.ano;

    var nota = $('agenda-nota');
    if (String(agenda.ano) < anoAtual) {
      nota.hidden = false;
      nota.textContent = 'Este é o calendário de ' + agenda.ano +
        '. Consulte o calendário oficial para as datas de ' + anoAtual + '.';
    } else {
      nota.hidden = true;
      nota.textContent = '';
    }

    var proxima = null;
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].data >= hoje) { proxima = lista[i]; break; }
    }

    if (proxima) {
      var mesProximo = porCompetencia[proxima.competencia];
      var rel = quandoRelativo(diasAte(proxima.data));
      var tempo = $('agenda-proxima-data');
      tempo.setAttribute('datetime', proxima.data);
      tempo.textContent = dataLongaComDia(proxima.data);
      $('agenda-proxima-detalhe').textContent =
        'Bandeira de ' + rotuloLongo(proxima.competencia).toLowerCase() + ' · ' +
        (mesProximo ? mesProximo.bandeira : 'a divulgar') +
        (rel ? ' (' + rel + ')' : '');
      $('agenda-proxima').hidden = false;
    } else {
      $('agenda-proxima').hidden = true;
    }

    var tbody = $('corpo-agenda');
    tbody.textContent = '';

    lista.forEach(function (item) {
      var tr = document.createElement('tr');
      if (proxima && item.data === proxima.data) tr.className = 'linha-proxima';

      var tdData = document.createElement('td');
      var time = document.createElement('time');
      time.setAttribute('datetime', item.data);
      time.textContent = dataCurta(item.data);
      tdData.appendChild(time);
      tr.appendChild(tdData);

      var tdMes = document.createElement('td');
      tdMes.textContent = rotuloLongo(item.competencia);
      tr.appendChild(tdMes);

      var tdFlag = document.createElement('td');
      var mes = porCompetencia[item.competencia];
      if (mes) {
        var selo = document.createElement('span');
        selo.className = 'selo selo-' + mes.chave;
        selo.textContent = mes.bandeira;
        tdFlag.appendChild(selo);
      } else {
        var pendente = document.createElement('span');
        pendente.className = 'pendente';
        pendente.textContent = 'A divulgar';
        tdFlag.appendChild(pendente);
      }
      tr.appendChild(tdFlag);

      tbody.appendChild(tr);
    });

    if (agenda.fonte) montarLink($('agenda-fonte'), agenda.fonte.url, agenda.fonte.nome);
  }

  /* ---------- 3. Projeção da CCEE ---------- */
  function renderProjecao(projecao) {
    var secao = $('titulo-projecao').closest('.cartao');
    if (!projecao || !projecao.resumo) {
      secao.hidden = true;
      return;
    }

    var rotuloMes = projecao.mes ? rotuloLongo(projecao.mes).toLowerCase() : '';
    $('projecao-edicao').textContent =
      projecao.edicao + (rotuloMes ? ' · ' + rotuloMes : '');

    $('projecao-texto').textContent = projecao.resumo;

    var ul = $('projecao-destaques');
    ul.textContent = '';
    (projecao.destaques || []).forEach(function (texto) {
      var li = document.createElement('li');
      li.textContent = texto;
      ul.appendChild(li);
    });

    var aviso = $('projecao-aviso');
    if (projecao.resumoEdicao && projecao.resumoEdicao !== projecao.edicao) {
      aviso.hidden = false;
      aviso.textContent = 'O resumo abaixo é da edição ' + projecao.resumoEdicao +
        '. A CCEE já publicou a edição ' + projecao.edicao +
        '; consulte o documento oficial para a projeção mais recente.';
    } else {
      aviso.hidden = true;
      aviso.textContent = '';
    }

    var link = $('projecao-fonte');
    if (projecao.url) {
      var href = projecao.url;
      if (projecao.pagina && href.indexOf('#') === -1) href += '#page=' + projecao.pagina;
      link.setAttribute('href', href);
    }
    link.textContent = 'CCEE — ' + projecao.edicao;
    var span = document.createElement('span');
    span.className = 'externo';
    span.textContent = ' (PDF, site externo)';
    link.appendChild(span);

    var atualizado = $('projecao-atualizado');
    atualizado.setAttribute('datetime', projecao.atualizadoEm || '');
    atualizado.textContent = dataLonga(projecao.atualizadoEm);
  }

  /* ---------- 4. Gráfico ---------- */
  var G = { W: 760, H: 420, top: 20, right: 48, bottom: 44, left: 124 };

  function geometria() {
    G.plotW = G.W - G.left - G.right;
    G.plotH = G.H - G.top - G.bottom;
    G.stepX = G.plotW / 12;
    G.bandH = G.plotH / 5;
    G.baseY = G.top + G.plotH;
  }

  function xMes(i) { return G.left + (i + 0.5) * G.stepX; }
  function ySev(s) { return G.baseY - (s + 0.5) * G.bandH; }

  function opacidadeBase(i, total) {
    if (total <= 1) return 0.8;
    return (0.35 + 0.45 * (i / (total - 1))).toFixed(2);
  }

  function renderGrafico(dados) {
    geometria();
    var svg = $('grafico');
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    svg.setAttribute('aria-label',
      'Gráfico de linhas: bandeira tarifária aplicada em cada mês de ' +
      rotuloCurto(dados.meses[0].competencia) + ' até ' +
      rotuloCurto(dados.vigente.competencia) +
      ', com uma linha por ano. Os mesmos dados estão na tabela deste cartão.');

    /* Faixas de severidade */
    dados.bandeiras.forEach(function (b) {
      var y = G.baseY - (b.severidade + 1) * G.bandH;
      svg.appendChild(svgEl('rect', {
        x: 0, y: y, width: G.W, height: G.bandH,
        class: 'faixa faixa-' + b.chave,
        style: 'fill: var(--faixa-' + b.chave + ')'
      }));
      var rotulo = svgEl('text', {
        x: G.left - 10, y: ySev(b.severidade),
        class: 'faixa-rotulo rotulo-' + b.chave
      });
      rotulo.textContent = b.nome;
      svg.appendChild(rotulo);
    });

    /* Grade vertical (meses) */
    for (var i = 0; i <= 12; i++) {
      svg.appendChild(svgEl('line', {
        x1: G.left + i * G.stepX, y1: G.top,
        x2: G.left + i * G.stepX, y2: G.baseY,
        class: 'grade'
      }));
    }

    /* Eixo inferior */
    svg.appendChild(svgEl('line', {
      x1: G.left, y1: G.baseY, x2: G.left + G.plotW, y2: G.baseY, class: 'eixo'
    }));

    /* Rótulos dos meses */
    for (var m = 0; m < 12; m++) {
      var t = svgEl('text', { x: xMes(m), y: G.baseY + 26, class: 'rotulo-mes' });
      t.textContent = MESES_CURTOS[m];
      svg.appendChild(t);
    }

    /* Séries por ano */
    var porAno = {};
    dados.meses.forEach(function (mes) {
      var ano = mes.competencia.slice(0, 4);
      if (!porAno[ano]) porAno[ano] = [];
      porAno[ano].push(mes);
    });
    anos = Object.keys(porAno).sort();

    var fimRotulos = [];

    anos.forEach(function (ano, idx) {
      var lista = porAno[ano].slice().sort(function (a, b) {
        return partes(a.competencia).mes - partes(b.competencia).mes;
      });
      var pontos = lista.map(function (mes) {
        return {
          x: xMes(partes(mes.competencia).mes - 1),
          y: ySev(mes.severidade),
          mes: mes
        };
      });

      var d = 'M' + pontos.map(function (p) { return p.x + ' ' + p.y; }).join(' L');
      var op = opacidadeBase(idx, anos.length);

      var linha = svgEl('path', { d: d, class: 'linha-ano' });
      linha.style.opacity = op;
      svg.appendChild(linha);
      refs.linhas[ano] = linha;

      refs.pontos[ano] = pontos.map(function (p) {
        var c = svgEl('circle', {
          cx: p.x, cy: p.y, r: 3.5, class: 'ponto',
          'data-rotulo': rotuloLongo(p.mes.competencia),
          'data-bandeira': p.mes.bandeira,
          'data-valor': textoAdicionalCurto(p.mes)
        });
        c.style.opacity = op;
        svg.appendChild(c);
        return c;
      });

      var ultimo = pontos[pontos.length - 1];
      fimRotulos.push({ ano: ano, x: ultimo.x + 9, y: ultimo.y });
    });

    /* Evita sobreposição dos rótulos de ano na margem direita */
    fimRotulos.sort(function (a, b) { return a.y - b.y; });
    for (var r = 1; r < fimRotulos.length; r++) {
      if (fimRotulos[r].y - fimRotulos[r - 1].y < 14) {
        fimRotulos[r].y = fimRotulos[r - 1].y + 14;
      }
    }
    var excedente = fimRotulos.length ? fimRotulos[fimRotulos.length - 1].y - (G.H - 8) : 0;
    if (excedente > 0) {
      fimRotulos.forEach(function (rot) { rot.y -= excedente; });
    }

    fimRotulos.forEach(function (rot) {
      var t = svgEl('text', { x: rot.x, y: rot.y, class: 'rotulo-ano' });
      t.textContent = rot.ano;
      svg.appendChild(t);
      refs.rotulos[rot.ano] = t;
    });

    montarChips();
    anoSelecionado = anos[anos.length - 1];
    atualizarChips();
    aplicarDestaque();

    /* Nota sobre o ano corrente */
    var v = dados.vigente;
    var p = partes(v.competencia);
    var incompleto = v.competencia.slice(0, 4) === String(p.ano) &&
      porAno[String(p.ano)].length < 12;
    $('nota-grafico').textContent = dados.meses.length + ' meses entre ' +
      rotuloCurto(dados.meses[0].competencia) + ' e ' + rotuloCurto(v.competencia) +
      (incompleto
        ? '. O ano de ' + p.ano + ' vai até ' + MESES_LONGOS[p.mes - 1] +
          ', último mês publicado pela ANEEL.'
        : '.');

    ligarInteracao();
  }

  function aplicarDestaque() {
    anos.forEach(function (ano, i) {
      var sel = anoSelecionado !== null && anoSelecionado === ano;
      var op = sel ? '1'
        : (anoSelecionado === null ? opacidadeBase(i, anos.length) : '0.16');

      var linha = refs.linhas[ano];
      linha.style.opacity = op;
      linha.classList.toggle('destacado', sel);

      refs.pontos[ano].forEach(function (c) {
        c.style.opacity = op;
        c.classList.toggle('destacado', sel);
        c.setAttribute('r', sel ? 5 : 3.5);
      });

      var rot = refs.rotulos[ano];
      if (rot) {
        rot.style.opacity = sel ? '1' : (anoSelecionado === null ? '1' : '0.35');
        rot.classList.toggle('destacado', sel);
      }
    });
  }

  function montarChips() {
    var cont = $('chips');
    while (cont.firstChild) cont.removeChild(cont.firstChild);
    refs.chips = [];

    anos.forEach(function (ano) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = ano;
      b.addEventListener('click', function () {
        anoSelecionado = (anoSelecionado === ano) ? null : ano;
        atualizarChips();
        aplicarDestaque();
        anunciar();
      });
      cont.appendChild(b);
      refs.chips.push({ ano: ano, botao: b });
    });

    var todos = document.createElement('button');
    todos.type = 'button';
    todos.className = 'chip';
    todos.textContent = 'Todos';
    todos.addEventListener('click', function () {
      anoSelecionado = null;
      atualizarChips();
      aplicarDestaque();
      anunciar();
    });
    cont.appendChild(todos);
    refs.chipTodos = todos;
  }

  function atualizarChips() {
    refs.chips.forEach(function (c) {
      c.botao.setAttribute('aria-pressed', String(anoSelecionado === c.ano));
    });
    refs.chipTodos.setAttribute('aria-pressed', String(anoSelecionado === null));
  }

  function anunciar() {
    var el = $('anuncio-grafico');
    if (anoSelecionado === null) {
      el.textContent = 'Destaque removido. Todos os anos estão visíveis no gráfico.';
      return;
    }
    var contagens = resumoAno[anoSelecionado] || {};
    var partesTxt = [];
    if (dadosAtuais) {
      dadosAtuais.bandeiras.forEach(function (b) {
        var n = contagens[b.chave] || 0;
        partesTxt.push(b.nome + ': ' + n + (n === 1 ? ' mês' : ' meses'));
      });
    }
    el.textContent = 'Ano ' + anoSelecionado + ' destacado no gráfico. ' +
      partesTxt.join('; ') + '.';
  }

  function ligarInteracao() {
    var svg = $('grafico');
    var area = svg.parentNode;
    var rolagem = area.parentNode;

    if (svg.dataset.interacao === 'sim') return;
    svg.dataset.interacao = 'sim';

    svg.addEventListener('pointerover', function (e) {
      var t = e.target;
      if (t && t.classList && t.classList.contains('ponto')) mostrarDica(t);
    });
    svg.addEventListener('pointerout', function (e) {
      var t = e.target;
      if (t && t.classList && t.classList.contains('ponto')) esconderDica();
    });
    rolagem.addEventListener('scroll', esconderDica);
  }

  function mostrarDica(ponto) {
    var dica = $('dica');
    while (dica.firstChild) dica.removeChild(dica.firstChild);

    var strong = document.createElement('strong');
    strong.textContent = ponto.getAttribute('data-rotulo');
    dica.appendChild(strong);
    dica.appendChild(document.createElement('br'));
    dica.appendChild(document.createTextNode(ponto.getAttribute('data-bandeira')));
    dica.appendChild(document.createElement('br'));
    dica.appendChild(document.createTextNode(ponto.getAttribute('data-valor')));
    dica.hidden = false;

    var area = dica.parentNode;
    var ar = area.getBoundingClientRect();
    var pr = ponto.getBoundingClientRect();
    var left = pr.left - ar.left + pr.width / 2;

    var metade = dica.offsetWidth / 2;
    if (left - metade < 4) left = metade + 4;
    if (left + metade > ar.width - 4) left = ar.width - metade - 4;

    dica.style.left = left + 'px';
    dica.style.top = (pr.top - ar.top) + 'px';
  }

  function esconderDica() {
    $('dica').hidden = true;
  }

  /* ---------- 5. Resumo por ano ---------- */
  function renderResumo(dados) {
    resumoAno = {};
    dados.meses.forEach(function (mes) {
      var ano = mes.competencia.slice(0, 4);
      if (!resumoAno[ano]) {
        resumoAno[ano] = { total: 0 };
        dados.bandeiras.forEach(function (b) { resumoAno[ano][b.chave] = 0; });
      }
      resumoAno[ano][mes.chave]++;
      resumoAno[ano].total++;
    });

    var tbody = $('corpo-resumo');
    tbody.textContent = '';

    Object.keys(resumoAno).sort().forEach(function (ano) {
      var c = resumoAno[ano];
      var tr = document.createElement('tr');

      var th = document.createElement('th');
      th.setAttribute('scope', 'row');
      th.textContent = ano;
      tr.appendChild(th);

      dados.bandeiras.forEach(function (b) {
        var td = document.createElement('td');
        td.textContent = c[b.chave];
        tr.appendChild(td);
      });

      var tdTotal = document.createElement('td');
      tdTotal.textContent = c.total;
      tdTotal.className = 'valor-celula';
      tr.appendChild(tdTotal);

      tbody.appendChild(tr);
    });

    var v = dados.vigente;
    var ultimoAno = v.competencia.slice(0, 4);
    var nota = $('resumo-nota');
    if (resumoAno[ultimoAno] && resumoAno[ultimoAno].total < 12) {
      nota.hidden = false;
      nota.textContent = 'O ano de ' + ultimoAno + ' tem dados até ' +
        MESES_LONGOS[partes(v.competencia).mes - 1] + '.';
    } else {
      nota.hidden = true;
      nota.textContent = '';
    }
  }

  /* ---------- 6. Tabela mês a mês ---------- */
  function renderTabelaMeses(dados) {
    var tbody = $('corpo-meses');
    tbody.textContent = '';

    dados.meses.forEach(function (mes) {
      var tr = document.createElement('tr');

      var th = document.createElement('th');
      th.setAttribute('scope', 'row');
      th.textContent = rotuloCurto(mes.competencia);
      tr.appendChild(th);

      var td1 = document.createElement('td');
      var selo = document.createElement('span');
      selo.className = 'selo selo-' + mes.chave;
      selo.textContent = mes.bandeira;
      td1.appendChild(selo);
      tr.appendChild(td1);

      var td2 = document.createElement('td');
      td2.textContent = textoAdicionalCurto(mes);
      tr.appendChild(td2);

      tbody.appendChild(tr);
    });
  }

  /* ---------- 7. Dicionário ---------- */
  function renderLista(dados) {
    var ul = $('lista-bandeiras');
    ul.textContent = '';

    dados.bandeiras.forEach(function (b) {
      var li = document.createElement('li');

      var selo = document.createElement('span');
      selo.className = 'selo selo-' + b.chave;
      selo.textContent = b.nome;
      li.appendChild(selo);

      var desc = document.createElement('span');
      desc.className = 'desc';
      desc.textContent = b.descricao;
      li.appendChild(desc);

      ul.appendChild(li);
    });
  }

  /* ---------- Rodapé ---------- */
  function renderRodape(dados) {
    var t = $('rodape-atualizado');
    t.setAttribute('datetime', dados.fonte.atualizadoEm);
    t.textContent = dataLonga(dados.fonte.atualizadoEm);
  }

  /* ---------- Inicialização ---------- */
  function render(dados, agenda, projecao) {
    if (!dados || !dados.meses || !dados.meses.length || !dados.vigente) {
      throw new Error('JSON de dados incompleto');
    }
    dadosAtuais = dados;
    renderVigente(dados);
    renderAgenda(dados, agenda);
    renderProjecao(projecao);
    renderResumo(dados);
    renderGrafico(dados);
    renderTabelaMeses(dados);
    renderLista(dados);
    renderRodape(dados);
  }

  function lerFallback() {
    return JSON.parse($('dados-fallback').textContent);
  }

  function lerAgendaFallback() {
    var el = $('agenda-fallback');
    if (!el) throw new Error('Agenda sem fallback');
    return JSON.parse(el.textContent);
  }

  function lerProjecaoFallback() {
    var el = $('projecao-fallback');
    if (!el) throw new Error('Projeção sem fallback');
    return JSON.parse(el.textContent);
  }

  function carregar() {
    if (location.protocol === 'file:') {
      return Promise.resolve(lerFallback());
    }
    return fetch('data/bandeiras.json', { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .catch(function () { return lerFallback(); });
  }

  function carregarAgenda() {
    if (location.protocol === 'file:') {
      return Promise.resolve(lerAgendaFallback());
    }
    return fetch('data/agenda.json', { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .catch(function () { return lerAgendaFallback(); });
  }

  function carregarProjecao() {
    if (location.protocol === 'file:') {
      return Promise.resolve(lerProjecaoFallback());
    }
    return fetch('data/projecao.json', { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .catch(function () { return lerProjecaoFallback(); });
  }

  function iniciar() {
    Promise.all([
      carregar(),
      carregarAgenda().catch(function () { return null; }),
      carregarProjecao().catch(function () { return null; })
    ])
      .then(function (res) { render(res[0], res[1], res[2]); })
      .catch(function (erro) {
        if (window.console) console.error(erro);
        $('erro-carga').hidden = false;
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
