/* ============================================================
   Gera dados.html e sitemap.xml a partir dos JSONs de dados.
   Página estática (sem JavaScript) para leitores e agentes.

   Uso: node scripts/gerar-dados-estaticos.mjs
   Executar após atualizar bandeiras.json, agenda.json ou projecao.json.
   ============================================================ */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://brunohdc.github.io/bandeiras-tarifarias/';
const CSS_V = '8';

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
                      'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
                      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const R100 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const RKWH = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 5, maximumFractionDigits: 5 });
const DATA_LONGA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC'
});
const DATA_COM_DIA = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC'
});

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function esc(valor) {
  return String(valor == null ? '' : valor).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}
function pad(n) { return (n < 10 ? '0' : '') + n; }
function partes(comp) { return { ano: +comp.slice(0, 4), mes: +comp.slice(5, 7) }; }
function primeiraMaiuscula(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function rotuloCurto(comp) {
  const p = partes(comp);
  return MESES_CURTOS[p.mes - 1] + '/' + p.ano;
}
function rotuloLongo(comp) {
  const p = partes(comp);
  return primeiraMaiuscula(MESES_LONGOS[p.mes - 1]) + ' de ' + p.ano;
}
function dataCurta(iso) {
  if (!iso) return '—';
  return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
}
function dataLonga(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00Z');
  return isNaN(d.getTime()) ? '—' : DATA_LONGA.format(d);
}
function dataComDia(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00Z');
  return isNaN(d.getTime()) ? '—' : primeiraMaiuscula(DATA_COM_DIA.format(d));
}
function vigenciaMes(comp) {
  const p = partes(comp);
  const ultimo = new Date(Date.UTC(p.ano, p.mes, 0)).getUTCDate();
  return '01/' + pad(p.mes) + '/' + p.ano + ' a ' +
         pad(ultimo) + '/' + pad(p.mes) + '/' + p.ano;
}
function hojeISO() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function textoAdicionalCurto(mes) {
  if (!mes.adicionalMwh) return 'Sem acréscimo';
  return 'R$ ' + R100.format(mes.adicionalMwh / 10) + ' / 100 kWh';
}
function textoAdicionalLongo(mes) {
  if (!mes.adicionalMwh) return 'R$ 0,00 a cada 100 kWh (sem acréscimo)';
  return 'R$ ' + R100.format(mes.adicionalMwh / 10) + ' a cada 100 kWh (' +
         RKWH.format(mes.adicionalKwh) + '/kWh)';
}

function lerJson(nome) {
  return readFile(join(RAIZ, 'data', nome), 'utf8').then((txt) => JSON.parse(txt));
}

async function salvar(caminho, conteudo) {
  let atual = null;
  try {
    atual = await readFile(caminho, 'utf8');
  } catch (e) {}
  if (atual !== conteudo) await writeFile(caminho, conteudo, 'utf8');
}

function blocoVigente(dados) {
  const v = dados.vigente;
  const def = dados.bandeiras.find((b) => b.chave === v.chave);

  return `
<section class="cartao bandeira-${esc(v.chave)}-bloco" aria-labelledby="titulo-vigente">
  <h2 id="titulo-vigente">Bandeira vigente</h2>
  <p class="bandeira">
    <span class="bandeira-icone bandeira-${esc(v.chave)}" aria-hidden="true"></span>
    <span class="bandeira-nome">Bandeira <strong>${esc(v.bandeira)}</strong></span>
  </p>
  <p class="bandeira-descricao">${esc(def ? def.descricao : '')}</p>
  <dl class="detalhes">
    <div>
      <dt>Mês de referência</dt>
      <dd>${esc(rotuloLongo(v.competencia))}</dd>
    </div>
    <div>
      <dt>Vigência</dt>
      <dd>${esc(vigenciaMes(v.competencia))}</dd>
    </div>
    <div>
      <dt>Adicional da bandeira</dt>
      <dd>${esc(textoAdicionalLongo(v))}</dd>
    </div>
    <div>
      <dt>Dados da ANEEL atualizados em</dt>
      <dd>${esc(dataLonga(dados.fonte.atualizadoEm))}</dd>
    </div>
  </dl>
  <p class="fonte">
    Fonte: <a href="${esc(dados.fonte.url)}" rel="noopener" target="_blank">${esc(dados.fonte.nome)}<span class="externo"> (site externo)</span></a>
  </p>
</section>`.trim();
}

function blocoAgenda(dados, agenda) {
  const porCompetencia = Object.fromEntries(
    dados.meses.map((m) => [m.competencia, m])
  );
  const hoje = hojeISO();
  const lista = agenda.divulgacoes.slice().sort((a, b) => (a.data < b.data ? -1 : 1));
  const proxima = lista.find((item) => item.data >= hoje) || null;
  const anoAtual = String(new Date().getFullYear());

  let nota = '';
  if (String(agenda.ano) < anoAtual) {
    nota = '  <p class="aviso-suave">Este é o calendário de ' + esc(agenda.ano) +
      '. Consulte o calendário oficial para as datas de ' + esc(anoAtual) + '.</p>';
  }

  let proximaHtml = '';
  if (proxima) {
    const mes = porCompetencia[proxima.competencia];
    proximaHtml = `
  <div class="agenda-proxima">
    <p class="agenda-proxima-rotulo">Próxima divulgação</p>
    <p class="agenda-proxima-data"><time datetime="${esc(proxima.data)}">${esc(dataComDia(proxima.data))}</time></p>
    <p class="agenda-proxima-detalhe">Bandeira de ${esc(rotuloLongo(proxima.competencia).toLowerCase())} · ${mes ? esc(mes.bandeira) : 'a divulgar'}</p>
  </div>`;
  }

  const linhas = lista.map((item) => {
    const mes = porCompetencia[item.competencia];
    const classe = proxima && item.data === proxima.data ? ' class="linha-proxima"' : '';
    const bandeira = mes
      ? `<span class="selo selo-${esc(mes.chave)}">${esc(mes.bandeira)}</span>`
      : '<span class="pendente">A divulgar</span>';
    return `      <tr${classe}><td><time datetime="${esc(item.data)}">${esc(dataCurta(item.data))}</time></td><td>${esc(rotuloLongo(item.competencia))}</td><td>${bandeira}</td></tr>`;
  }).join('\n');

  return `
<section class="cartao" aria-labelledby="titulo-agenda">
  <h2 id="titulo-agenda">Agenda de divulgação <span class="agenda-ano">· ${esc(agenda.ano)}</span></h2>
  <p class="instrucao">
    A ANEEL divulga a bandeira de cada mês no fim do mês anterior, em data definida no
    calendário oficial. A cor passa a valer no primeiro dia do mês de referência.
  </p>
${proximaHtml}
  <div class="tabela-rolagem" tabindex="0" role="region" aria-labelledby="titulo-agenda">
    <table class="tabela tabela-agenda">
      <caption class="sr-only">Calendário de divulgação das bandeiras tarifárias: data do anúncio, mês de vigência e bandeira divulgada</caption>
      <thead>
        <tr><th scope="col">Divulgação</th><th scope="col">Mês de vigência</th><th scope="col">Bandeira</th></tr>
      </thead>
      <tbody>
${linhas}
      </tbody>
    </table>
  </div>
${nota}
  <p class="fonte">
    Fonte: <a href="${esc(agenda.fonte.url)}" rel="noopener" target="_blank">${esc(agenda.fonte.nome)}<span class="externo"> (site externo)</span></a>
  </p>
</section>`.replace(/\n{3,}/g, '\n\n').trim();
}

function blocoProjecao(projecao) {
  const destaques = (projecao.destaques || [])
    .map((item) => `      <li>${esc(item)}</li>`)
    .join('\n');
  const mesLabel = projecao.mes ? rotuloLongo(projecao.mes).toLowerCase() : '';
  const stale = projecao.resumoEdicao && projecao.resumoEdicao !== projecao.edicao
    ? `  <p class="projecao-aviso">O resumo abaixo é da edição ${esc(projecao.resumoEdicao)}. A CCEE já publicou a edição ${esc(projecao.edicao)}; consulte o documento oficial para a projeção mais recente.</p>`
    : '';

  let href = projecao.url || '';
  if (projecao.pagina && href.indexOf('#') === -1) href += '#page=' + projecao.pagina;

  return `
<section class="cartao" aria-labelledby="titulo-projecao">
  <h2 id="titulo-projecao">Projeção da CCEE</h2>
  <p class="instrucao">
    A CCEE apresenta no Encontro do PLD uma projeção da bandeira tarifária para os meses
    seguintes. Resumo da última edição disponível:
  </p>
  <div class="projecao-resumo">
    <p class="projecao-edicao">${esc(projecao.edicao)}${mesLabel ? ' · ' + esc(mesLabel) : ''}</p>
    <p class="projecao-texto">${esc(projecao.resumo)}</p>
    <ul class="projecao-destaques">
${destaques}
    </ul>
    <p class="projecao-ressalva">${esc(projecao.ressalva || '')}</p>
  </div>
${stale}
  <p class="fonte">
    Fonte: <a href="${esc(href)}" rel="noopener" target="_blank">CCEE — ${esc(projecao.edicao)} (PDF, site externo)</a>
    · Resumo atualizado em ${esc(dataLonga(projecao.atualizadoEm))}
  </p>
</section>`.replace(/\n{3,}/g, '\n\n').trim();
}

function blocoMeses(dados) {
  const linhas = dados.meses.map((mes) => {
    return `      <tr><th scope="row">${esc(rotuloCurto(mes.competencia))}</th><td><span class="selo selo-${esc(mes.chave)}">${esc(mes.bandeira)}</span></td><td>${esc(textoAdicionalCurto(mes))}</td></tr>`;
  }).join('\n');

  const primeiro = dados.meses[0];
  const ultimo = dados.meses[dados.meses.length - 1];

  return `
<section class="cartao" aria-labelledby="titulo-meses">
  <h2 id="titulo-meses">Bandeiras mês a mês</h2>
  <p class="instrucao">
    Bandeira tarifária e adicional de cada mês, de
    ${esc(rotuloLongo(primeiro.competencia).toLowerCase())} a
    ${esc(rotuloLongo(ultimo.competencia).toLowerCase())}.
  </p>
  <div class="tabela-rolagem" tabindex="0" role="region" aria-labelledby="titulo-meses">
    <table class="tabela">
      <caption class="sr-only">Bandeira tarifária e adicional de cada mês desde janeiro de 2015</caption>
      <thead>
        <tr><th scope="col">Mês</th><th scope="col">Bandeira</th><th scope="col">Adicional (R$ / 100 kWh)</th></tr>
      </thead>
      <tbody>
${linhas}
      </tbody>
    </table>
  </div>
  <p class="fonte">
    Fonte: <a href="${esc(dados.fonte.recurso)}" rel="noopener" target="_blank">${esc(dados.fonte.nome)} — Bandeira Tarifária - Acionamento<span class="externo"> (site externo)</span></a>
  </p>
</section>`.trim();
}

function blocoResumo(dados) {
  const resumo = {};
  dados.meses.forEach((mes) => {
    const ano = mes.competencia.slice(0, 4);
    if (!resumo[ano]) {
      resumo[ano] = { total: 0 };
      dados.bandeiras.forEach((b) => { resumo[ano][b.chave] = 0; });
    }
    resumo[ano][mes.chave]++;
    resumo[ano].total++;
  });

  const linhas = Object.keys(resumo).sort().map((ano) => {
    const c = resumo[ano];
    const celulas = dados.bandeiras.map((b) => `<td>${c[b.chave]}</td>`).join('');
    return `      <tr><th scope="row">${esc(ano)}</th>${celulas}<td class="valor-celula">${c.total}</td></tr>`;
  }).join('\n');

  const v = dados.vigente;
  const ultimoAno = v.competencia.slice(0, 4);
  let nota = '';
  if (resumo[ultimoAno] && resumo[ultimoAno].total < 12) {
    nota = '  <p class="aviso-suave">O ano de ' + esc(ultimoAno) + ' tem dados até ' +
      esc(MESES_LONGOS[partes(v.competencia).mes - 1]) + '.</p>';
  }

  const cabecalhos = dados.bandeiras
    .map((b) => `<th scope="col">${esc(b.nome)}</th>`)
    .join('');

  return `
<section class="cartao" aria-labelledby="titulo-resumo">
  <h2 id="titulo-resumo">Resumo por ano</h2>
  <p class="instrucao">Quantidade de meses em cada bandeira, ano a ano.</p>
  <div class="tabela-rolagem" tabindex="0" role="region" aria-labelledby="titulo-resumo">
    <table class="tabela tabela-resumo">
      <caption class="sr-only">Meses por bandeira tarifária em cada ano</caption>
      <thead>
        <tr><th scope="col">Ano</th>${cabecalhos}<th scope="col">Meses</th></tr>
      </thead>
      <tbody>
${linhas}
      </tbody>
    </table>
  </div>
${nota}
</section>`.replace(/\n{3,}/g, '\n\n').trim();
}

function blocoDicionario(dados) {
  const itens = dados.bandeiras.map((b) => {
    return `    <li><span class="selo selo-${esc(b.chave)}">${esc(b.nome)}</span> <span class="desc">${esc(b.descricao)}</span></li>`;
  }).join('\n');

  return `
<section class="cartao" aria-labelledby="titulo-dicionario">
  <h2 id="titulo-dicionario">O que é cada bandeira</h2>
  <ul class="lista-bandeiras">
${itens}
  </ul>
</section>`.trim();
}

function blocoAvisos() {
  return `
<section class="cartao cartao-aviso" aria-labelledby="titulo-avisos">
  <h2 id="titulo-avisos">Como ler estes dados</h2>
  <ul class="lista-avisos">
    <li>A bandeira tarifária é um <strong>adicional</strong> cobrado por kWh consumido. Ela não substitui a tarifa: é somada a ela.</li>
    <li>Unidades com consumo igual ou inferior a <strong>30 kWh</strong> no mês de referência são isentas do adicional da bandeira (Resolução ANEEL nº 1.000/2021).</li>
    <li>Os valores exibidos são os <strong>sem tributos</strong>. ICMS, PIS/COFINS, taxa de iluminação pública e outros encargos aparecem separadamente na conta.</li>
    <li>A série começa em <strong>janeiro de 2015</strong>, quando o sistema de bandeiras entrou em vigor, e cobre consumidores do Sistema Interligado Nacional. A bandeira <strong>Escassez Hídrica</strong> foi uma criação excepcional para a seca de 2021 (set/2021 a abr/2022).</li>
  </ul>
</section>`.trim();
}

async function main() {
  const dados = await lerJson('bandeiras.json');
  const agenda = await lerJson('agenda.json');
  const projecao = await lerJson('projecao.json');
  const template = await readFile(join(RAIZ, 'scripts', 'dados.template.html'), 'utf8');

  const html = template
    .replaceAll('{{CSS_V}}', CSS_V)
    .replaceAll('<!--{{VIGENTE}}-->', blocoVigente(dados))
    .replaceAll('<!--{{AGENDA}}-->', blocoAgenda(dados, agenda))
    .replaceAll('<!--{{PROJECAO}}-->', blocoProjecao(projecao))
    .replaceAll('<!--{{MESES}}-->', blocoMeses(dados))
    .replaceAll('<!--{{RESUMO}}-->', blocoResumo(dados))
    .replaceAll('<!--{{DICIONARIO}}-->', blocoDicionario(dados))
    .replaceAll('<!--{{AVISOS}}-->', blocoAvisos())
    .replaceAll('{{DATA_ANEEL_ISO}}', esc(dados.fonte.atualizadoEm || ''))
    .replaceAll('{{DATA_ANEEL}}', esc(dataLonga(dados.fonte.atualizadoEm)));

  await salvar(join(RAIZ, 'dados.html'), html);

  const datas = [
    dados.fonte.atualizadoEm,
    projecao.atualizadoEm,
    agenda.fonte && agenda.fonte.publicadoEm,
  ].filter(Boolean).sort();
  const ultimaAtualizacao = datas[datas.length - 1] || '';

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${BASE}</loc>
    <lastmod>${ultimaAtualizacao}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${BASE}dados.html</loc>
    <lastmod>${ultimaAtualizacao}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>
`;
  await salvar(join(RAIZ, 'sitemap.xml'), sitemap);

  console.log('OK — dados.html (' + dados.meses.length + ' meses) e sitemap.xml gerados.');
}

main().catch((erro) => {
  console.error('Falha:', erro.message);
  process.exitCode = 1;
});
