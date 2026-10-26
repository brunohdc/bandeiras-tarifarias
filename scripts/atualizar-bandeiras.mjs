/* ============================================================
   Atualiza data/bandeiras.json a partir do CSV da ANEEL
   (recurso "Bandeira Tarifária - Acionamento")
   e sincroniza o fallback embutido em index.html.

   Uso: node scripts/atualizar-bandeiras.mjs
   ============================================================ */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const URL_CSV =
  'https://dadosabertos.aneel.gov.br/datastore/dump/0591b8f6-fe54-437b-b72b-1aa2efd46e42?bom=True';
const URL_CONJUNTO = 'https://dadosabertos.aneel.gov.br/dataset/bandeiras-tarifarias';
const URL_RECURSO =
  'https://dadosabertos.aneel.gov.br/dataset/bandeiras-tarifarias/resource/0591b8f6-fe54-437b-b72b-1aa2efd46e42';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Ordem = ordem crescente de severidade no gráfico */
const BANDEIRAS = [
  {
    chave: 'verde',
    nome: 'Verde',
    severidade: 0,
    descricao: 'Condições favoráveis de geração de energia. A tarifa não sofre nenhum acréscimo.'
  },
  {
    chave: 'amarela',
    nome: 'Amarela',
    severidade: 1,
    descricao: 'Condições de geração menos favoráveis.'
  },
  {
    chave: 'vermelha-p1',
    nome: 'Vermelha P1',
    severidade: 2,
    descricao: 'Vermelha, patamar 1: condições mais custosas de geração.'
  },
  {
    chave: 'vermelha-p2',
    nome: 'Vermelha P2',
    severidade: 3,
    descricao: 'Vermelha, patamar 2: condições ainda mais custosas de geração.'
  },
  {
    chave: 'escassez-hidrica',
    nome: 'Escassez Hídrica',
    severidade: 4,
    descricao:
      'Bandeira criada para a seca de 2021, vigente de setembro de 2021 a abril de 2022.'
  }
];

function bandeiraDe(nome) {
  const l = String(nome || '').trim().toLowerCase();
  if (l.includes('escassez')) return BANDEIRAS[4];
  if (l.includes('verde')) return BANDEIRAS[0];
  if (l.includes('amarela')) return BANDEIRAS[1];
  if (l.includes('p2') || l.includes('patamar 2')) return BANDEIRAS[3];
  if (l.includes('vermelha')) return BANDEIRAS[2];
  throw new Error('Bandeira desconhecida no CSV: ' + nome);
}

/* Vírgula decimal do CSV; zero vem como ",00" */
function parseValor(txt) {
  const t = String(txt || '').trim();
  if (!t) return 0;
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(n)) throw new Error('Valor inválido: ' + txt);
  return n;
}

function parseCSV(texto) {
  const linhas = [];
  let linha = [];
  let campo = '';
  let entreAspas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          entreAspas = false;
        }
      } else {
        campo += c;
      }
    } else if (c === '"') {
      entreAspas = true;
    } else if (c === ',') {
      linha.push(campo);
      campo = '';
    } else if (c === '\n') {
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else if (c !== '\r') {
      campo += c;
    }
  }
  if (campo !== '' || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas;
}

function normalizar(texto) {
  const linhas = parseCSV(texto.replace(/^\uFEFF/, ''));
  if (linhas.length < 2) throw new Error('CSV vazio');

  const cabecalho = linhas[0];
  const idx = {};
  cabecalho.forEach((nome, i) => {
    idx[nome.trim()] = i;
  });
  for (const campo of ['DatGeracaoConjuntoDados', 'DatCompetencia', 'NomBandeiraAcionada', 'VlrAdicionalBandeira']) {
    if (idx[campo] === undefined) throw new Error('Coluna ausente: ' + campo);
  }

  const meses = [];
  let atualizadoEm = '';

  for (const linha of linhas.slice(1)) {
    if (!linha[idx.DatCompetencia]) continue;
    if (!atualizadoEm) atualizadoEm = linha[idx.DatGeracaoConjuntoDados].trim();

    const iso = linha[idx.DatCompetencia].trim();
    const competencia = iso.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(competencia)) throw new Error('Competência inválida: ' + iso);

    const b = bandeiraDe(linha[idx.NomBandeiraAcionada]);
    const adicionalMwh = parseValor(linha[idx.VlrAdicionalBandeira]);

    meses.push({
      competencia,
      bandeira: b.nome,
      chave: b.chave,
      severidade: b.severidade,
      adicionalMwh,
      adicionalKwh: Number((adicionalMwh / 1000).toFixed(6))
    });
  }

  meses.sort((a, b) => (a.competencia < b.competencia ? -1 : 1));

  /* Sem lacunas na série mensal */
  for (let i = 1; i < meses.length; i++) {
    const [an, mn] = meses[i - 1].competencia.split('-').map(Number);
    const esperado = mn === 12 ? an + 1 + '-01' : an + '-' + String(mn + 1).padStart(2, '0');
    if (meses[i].competencia !== esperado) {
      throw new Error(
        'Lacuna na série: após ' + meses[i - 1].competencia + ' veio ' + meses[i].competencia
      );
    }
  }

  return {
    fonte: {
      nome: 'ANEEL — Dados Abertos: Bandeiras Tarifárias',
      url: URL_CONJUNTO,
      recurso: URL_RECURSO,
      licenca: 'ODbL (Open Data Commons Open Database License)',
      atualizadoEm
    },
    unidade: 'adicionalMwh em R$/MWh (como publicado pela ANEEL); adicionalKwh = adicionalMwh / 1000',
    bandeiras: BANDEIRAS,
    vigente: meses[meses.length - 1],
    meses
  };
}

async function atualizarFallbackHTML(json) {
  const caminho = join(RAIZ, 'index.html');
  const html = await readFile(caminho, 'utf8');
  const marca =
    /(<script type="application\/json" id="dados-fallback">)[\s\S]*?(<\/script>)/;
  if (!marca.test(html)) throw new Error('Fallback dados-fallback não encontrado em index.html');
  const novo = html.replace(marca, '$1\n' + json.trim() + '\n$2');
  if (novo !== html) await writeFile(caminho, novo, 'utf8');
}

async function atualizarSitemap() {
  const caminho = join(RAIZ, 'sitemap.xml');
  let xml;
  try {
    xml = await readFile(caminho, 'utf8');
  } catch {
    return;
  }
  const hoje = new Date().toISOString().slice(0, 10);
  const novo = xml.replace(/<lastmod>[^<]*<\/lastmod>/, '<lastmod>' + hoje + '</lastmod>');
  if (novo !== xml) await writeFile(caminho, novo, 'utf8');
}

async function main() {
  console.log('Baixando CSV da ANEEL...');
  const resposta = await fetch(URL_CSV);
  if (!resposta.ok) throw new Error('HTTP ' + resposta.status + ' ao baixar o CSV');
  const texto = await resposta.text();

  const dados = normalizar(texto);
  const json = JSON.stringify(dados, null, 2) + '\n';

  await writeFile(join(RAIZ, 'data', 'bandeiras.json'), json, 'utf8');
  await atualizarFallbackHTML(json);
  await atualizarSitemap();

  const v = dados.vigente;
  console.log('OK — ' + dados.meses.length + ' meses (' +
    dados.meses[0].competencia + ' a ' + v.competencia + ')');
  console.log('Vigente: ' + v.competencia + ' = ' + v.bandeira +
    ' (R$ ' + v.adicionalMwh.toFixed(2) + '/MWh)');
  console.log('Dados gerados em: ' + dados.fonte.atualizadoEm);
}

main().catch((erro) => {
  console.error('Falha:', erro.message);
  process.exitCode = 1;
});
