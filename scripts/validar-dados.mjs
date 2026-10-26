/* ============================================================
   Validação dos dados usados pelo site.
   Executado pelo gerador da página estática e pelos workflows.
   Falha fechado: se algo estiver inválido, não gera nem publica.
   ============================================================ */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHAVES = new Set(['verde', 'amarela', 'vermelha-p1', 'vermelha-p2', 'escassez-hidrica']);

function falhar(mensagem) {
  throw new Error(mensagem);
}

function isoData(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  return !isNaN(new Date(valor + 'T00:00:00Z').getTime());
}

function competencia(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}$/.test(valor)) return false;
  const mes = Number(valor.slice(5, 7));
  return mes >= 1 && mes <= 12;
}

function urlHttps(valor) {
  try {
    return new URL(valor).protocol === 'https:';
  } catch (e) {
    return false;
  }
}

function urlCcee(valor) {
  try {
    const url = new URL(valor);
    if (url.protocol !== 'https:') return false;
    if (url.hostname !== 'www.ccee.org.br' && url.hostname !== 'ccee.org.br') return false;
    return decodeURIComponent(url.pathname).toLowerCase().includes('.pdf');
  } catch (e) {
    return false;
  }
}

export function validarDados(dados, agenda, projecao) {
  if (!dados || !Array.isArray(dados.meses) || !dados.meses.length) {
    falhar('bandeiras: lista de meses vazia');
  }
  if (!Array.isArray(dados.bandeiras) || !dados.bandeiras.length) {
    falhar('bandeiras: definições de bandeiras vazias');
  }
  if (!dados.vigente || !competencia(dados.vigente.competencia)) {
    falhar('bandeiras: vigente inválido');
  }
  if (!urlHttps(dados.fonte && dados.fonte.url)) {
    falhar('bandeiras: fonte.url deve ser https');
  }
  if (!urlHttps(dados.fonte && dados.fonte.recurso)) {
    falhar('bandeiras: fonte.recurso deve ser https');
  }
  if (!isoData(dados.fonte && dados.fonte.atualizadoEm)) {
    falhar('bandeiras: fonte.atualizadoEm inválido');
  }

  const chaves = new Set();
  dados.bandeiras.forEach((bandeira) => {
    if (!bandeira || !CHAVES.has(bandeira.chave)) {
      falhar('bandeiras: chave desconhecida ' + (bandeira && bandeira.chave));
    }
    if (chaves.has(bandeira.chave)) {
      falhar('bandeiras: chave duplicada ' + bandeira.chave);
    }
    chaves.add(bandeira.chave);
    if (typeof bandeira.nome !== 'string' || !bandeira.nome.trim()) {
      falhar('bandeiras: nome ausente em ' + bandeira.chave);
    }
  });

  let anterior = null;
  dados.meses.forEach((mes) => {
    if (!competencia(mes.competencia)) {
      falhar('bandeiras: competência inválida ' + mes.competencia);
    }
    if (!CHAVES.has(mes.chave)) {
      falhar('bandeiras: chave inválida em ' + mes.competencia);
    }
    if (typeof mes.adicionalMwh !== 'number' || !isFinite(mes.adicionalMwh) || mes.adicionalMwh < 0) {
      falhar('bandeiras: adicional inválido em ' + mes.competencia);
    }
    if (anterior) {
      const [anoAnterior, mesAnterior] = anterior.split('-').map(Number);
      const esperado = mesAnterior === 12
        ? (anoAnterior + 1) + '-01'
        : anoAnterior + '-' + String(mesAnterior + 1).padStart(2, '0');
      if (mes.competencia !== esperado) {
        falhar('bandeiras: lacuna entre ' + anterior + ' e ' + mes.competencia);
      }
    }
    anterior = mes.competencia;
  });

  const ultimo = dados.meses[dados.meses.length - 1];
  if (dados.vigente.competencia !== ultimo.competencia) {
    falhar('bandeiras: vigente não corresponde ao último mês');
  }
  if (dados.vigente.chave !== ultimo.chave) {
    falhar('bandeiras: chave do vigente não corresponde ao último mês');
  }

  if (!agenda || !Array.isArray(agenda.divulgacoes) || !agenda.divulgacoes.length) {
    falhar('agenda: lista de divulgações vazia');
  }
  if (!Number.isInteger(agenda.ano)) {
    falhar('agenda: ano inválido');
  }
  if (!urlHttps(agenda.fonte && agenda.fonte.url)) {
    falhar('agenda: fonte.url deve ser https');
  }

  let dataAnterior = '';
  agenda.divulgacoes.forEach((item) => {
    if (!isoData(item.data)) {
      falhar('agenda: data inválida ' + item.data);
    }
    if (!competencia(item.competencia)) {
      falhar('agenda: competência inválida ' + item.competencia);
    }
    if (dataAnterior && item.data <= dataAnterior) {
      falhar('agenda: datas fora de ordem ou duplicadas');
    }
    dataAnterior = item.data;
  });

  if (!projecao || typeof projecao.resumo !== 'string' || !projecao.resumo.trim()) {
    falhar('projecao: resumo vazio');
  }
  if (typeof projecao.edicao !== 'string' || !/^\d+º Encontro do PLD$/.test(projecao.edicao)) {
    falhar('projecao: edição inválida');
  }
  if (!competencia(projecao.mes)) {
    falhar('projecao: mês inválido');
  }
  if (!urlCcee(projecao.url)) {
    falhar('projecao: url deve ser https://www.ccee.org.br e apontar para um PDF');
  }
  if (projecao.pagina != null && (!Number.isInteger(projecao.pagina) || projecao.pagina < 1)) {
    falhar('projecao: página inválida');
  }
  if (projecao.resumoEdicao != null && typeof projecao.resumoEdicao !== 'string') {
    falhar('projecao: resumoEdicao inválido');
  }
  if (!Array.isArray(projecao.destaques) || projecao.destaques.some((d) => typeof d !== 'string')) {
    falhar('projecao: destaques inválidos');
  }
  if (typeof projecao.ressalva !== 'string' || !projecao.ressalva.trim()) {
    falhar('projecao: ressalva vazia');
  }
  if (!isoData(projecao.atualizadoEm)) {
    falhar('projecao: atualizadoEm inválido');
  }
}

export async function carregarEValidar() {
  const ler = (nome) => readFile(join(RAIZ, 'data', nome), 'utf8').then((txt) => JSON.parse(txt));
  const dados = await ler('bandeiras.json');
  const agenda = await ler('agenda.json');
  const projecao = await ler('projecao.json');
  validarDados(dados, agenda, projecao);
  return { dados, agenda, projecao };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  carregarEValidar()
    .then(() => console.log('OK — dados válidos.'))
    .catch((erro) => {
      console.error('Falha: ' + erro.message);
      process.exitCode = 1;
    });
}
