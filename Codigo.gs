/**
 * RELATÓRIOS DE AVALIAÇÃO - ATM (Apps Script)
 * Arquivo único: cole tudo isto em Código.gs (apague o que já existir lá).
 * Os outros dois arquivos do projeto são o Index.html e o appsscript.json.
 */

// ==================================================================== Util.gs
/**
 * UTIL: funções puras usadas em todo o projeto.
 * Datas são sempre textos ISO "aaaa-mm-dd" (evita problemas de fuso); só horários de envio usam Date.
 */
const TZ = 'America/Recife';
const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

class ErroDados extends Error {}   // erro com mensagem pronta para mostrar ao usuário

function norm(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').toLowerCase().trim();
}
function slug(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function uniq(arr) { return arr.filter((x, i) => arr.indexOf(x) === i); }
function stripChars(s, chars) {
  let i = 0, j = s.length;
  while (i < j && chars.indexOf(s[i]) >= 0) i++;
  while (j > i && chars.indexOf(s[j - 1]) >= 0) j--;
  return s.slice(i, j);
}
function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

// ---------------------------------------------------------------- datas ISO
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function isoDeUtc(t) { return t.getUTCFullYear() + '-' + pad2(t.getUTCMonth() + 1) + '-' + pad2(t.getUTCDate()); }
function dataValida(y, m, d) {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
function isoDe(y, m, d) { return y + '-' + pad2(m) + '-' + pad2(d); }
function partesIso(iso) { const p = iso.split('-').map(Number); return { y: p[0], m: p[1], d: p[2] }; }
function addDias(iso, n) { const p = partesIso(iso); return isoDeUtc(new Date(Date.UTC(p.y, p.m - 1, p.d + n))); }
function diaSemana(iso) {            // 0 = segunda ... 6 = domingo
  const p = partesIso(iso);
  return (new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() + 6) % 7;
}
function segundaDe(iso) { return addDias(iso, -diaSemana(iso)); }
function fmtData(iso) { const p = partesIso(iso); return pad2(p.d) + '/' + pad2(p.m) + '/' + p.y; }
function textoDatas(isos) {
  const t = isos.slice().sort().map(fmtData);
  return t.length <= 1 ? t.join('') : t.slice(0, -1).join(', ') + ' e ' + t[t.length - 1];
}
function fmtHora(d) { return d ? Utilities.formatDate(d, TZ, 'dd/MM/yyyy HH:mm') : ''; }
function hojeIso() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
/** Dia útil anterior: seg -> sexta; sáb -> sexta; dom -> sexta; demais -> ontem. */
function diaUtilAnterior(iso) {
  const w = diaSemana(iso);
  return addDias(iso, w === 0 ? -3 : w === 6 ? -2 : -1);
}

/** Valor de célula -> data ISO ou null (aceita Date, texto dd/mm/aaaa, aaaa-mm-dd e número serial). */
function paraIso(v, tz) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? null : Utilities.formatDate(v, tz || TZ, 'yyyy-MM-dd');
  if (typeof v === 'number') {
    return v > 30000 ? isoDeUtc(new Date(Date.UTC(1899, 11, 30) + Math.round(v * 86400000))) : null;
  }
  const s = String(v).trim().split(/[ T]/)[0];
  let m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s);
  if (m) return dataValida(+m[3], +m[2], +m[1]) ? isoDe(+m[3], +m[2], +m[1]) : null;
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return dataValida(+m[1], +m[2], +m[3]) ? isoDe(+m[1], +m[2], +m[3]) : null;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(s);
  if (m) return dataValida(2000 + +m[3], +m[2], +m[1]) ? isoDe(2000 + +m[3], +m[2], +m[1]) : null;
  return null;
}
/** Valor de célula -> Date (instante) ou null. Texto "dd/mm/aaaa hh:mm[:ss]" é lido no fuso TZ. */
function paraDataHora(v, tz) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  const s = String(v).trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (m) return Utilities.parseDate(`${pad2(+m[1])}/${pad2(+m[2])}/${m[3]} ${pad2(+m[4])}:${m[5]}:${m[6] || '00'}`, tz || TZ, 'dd/MM/yyyy HH:mm:ss');
  m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (m) return Utilities.parseDate(`${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6] || '00'}`, tz || TZ, 'yyyy-MM-dd HH:mm:ss');
  const iso = paraIso(s, tz);
  return iso ? Utilities.parseDate(iso + ' 00:00:00', tz || TZ, 'yyyy-MM-dd HH:mm:ss') : null;
}
function isoParaDate(iso, tz) { return Utilities.parseDate(iso + ' 00:00:00', tz || TZ, 'yyyy-MM-dd HH:mm:ss'); }

// ---------------------------------------------------------------- e-mails
function separarEmails(texto) {
  const validos = [], invalidos = [];
  String(texto || '').split(/[;,\s]+/).filter(Boolean).forEach(e => {
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { if (!validos.some(x => x.toLowerCase() === e.toLowerCase())) validos.push(e); }
    else invalidos.push(e);
  });
  return { validos, invalidos };
}

// ---------------------------------------------------------------- municípios (lista oficial, IBGE)
const MUNICIPIOS_PE = ["Abreu e Lima", "Afogados da Ingazeira", "Afrânio", "Agrestina", "Água Preta", "Águas Belas", "Alagoinha", "Aliança", "Altinho", "Amaraji", "Angelim", "Araçoiaba", "Araripina", "Arcoverde", "Barra de Guabiraba", "Barreiros", "Belém de Maria", "Belém do São Francisco", "Belo Jardim", "Betânia", "Bezerros", "Bodocó", "Bom Conselho", "Bom Jardim", "Bonito", "Brejão", "Brejinho", "Brejo da Madre de Deus", "Buenos Aires", "Buíque", "Cabo de Santo Agostinho", "Cabrobó", "Cachoeirinha", "Caetés", "Calçado", "Calumbi", "Camaragibe", "Camocim de São Félix", "Camutanga", "Canhotinho", "Capoeiras", "Carnaíba", "Carnaubeira da Penha", "Carpina", "Caruaru", "Casinhas", "Catende", "Cedro", "Chã de Alegria", "Chã Grande", "Condado", "Correntes", "Cortês", "Cumaru", "Cupira", "Custódia", "Dormentes", "Escada", "Exu", "Feira Nova", "Fernando de Noronha", "Ferreiros", "Flores", "Floresta", "Frei Miguelinho", "Gameleira", "Garanhuns", "Glória do Goitá", "Goiana", "Granito", "Gravatá", "Iati", "Ibimirim", "Ibirajuba", "Igarassu", "Iguaracy", "Ilha de Itamaracá", "Inajá", "Ingazeira", "Ipojuca", "Ipubi", "Itacuruba", "Itaíba", "Itambé", "Itapetim", "Itapissuma", "Itaquitinga", "Jaboatão dos Guararapes", "Jaqueira", "Jataúba", "Jatobá", "João Alfredo", "Joaquim Nabuco", "Jucati", "Jupi", "Jurema", "Lagoa de Itaenga", "Lagoa do Carro", "Lagoa do Ouro", "Lagoa dos Gatos", "Lagoa Grande", "Lajedo", "Limoeiro", "Macaparana", "Machados", "Manari", "Maraial", "Mirandiba", "Moreilândia", "Moreno", "Nazaré da Mata", "Olinda", "Orobó", "Orocó", "Ouricuri", "Palmares", "Palmeirina", "Panelas", "Paranatama", "Parnamirim", "Passira", "Paudalho", "Paulista", "Pedra", "Pesqueira", "Petrolândia", "Petrolina", "Poção", "Pombos", "Primavera", "Quipapá", "Quixaba", "Recife", "Riacho das Almas", "Ribeirão", "Rio Formoso", "Sairé", "Salgadinho", "Salgueiro", "Saloá", "Sanharó", "Santa Cruz", "Santa Cruz da Baixa Verde", "Santa Cruz do Capibaribe", "Santa Filomena", "Santa Maria da Boa Vista", "Santa Maria do Cambucá", "Santa Terezinha", "São Benedito do Sul", "São Bento do Una", "São Caitano", "São João", "São Joaquim do Monte", "São José da Coroa Grande", "São José do Belmonte", "São José do Egito", "São Lourenço da Mata", "São Vicente Férrer", "Serra Talhada", "Serrita", "Sertânia", "Sirinhaém", "Solidão", "Surubim", "Tabira", "Tacaimbó", "Tacaratu", "Tamandaré", "Taquaritinga do Norte", "Terezinha", "Terra Nova", "Timbaúba", "Toritama", "Tracunhaém", "Trindade", "Triunfo", "Tupanatinga", "Tuparetama", "Venturosa", "Verdejante", "Vertente do Lério", "Vertentes", "Vicência", "Vitória de Santo Antão", "Xexéu"];

// ==================================================================== Logos.gs
/** Imagem do rodapé do relatório (recortada do papel timbrado), em base64. */
const LOGO_RODAPE_B64 = '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';

// ==================================================================== Calendario.gs
/**
 * CALENDÁRIO: lê as abas mensais do calendário (planilha online) e devolve uma linha por ATM/município;
 * SYNC: mescla essas linhas com as atividades guardadas no CONTROLE (novo / alterado / removido / ajuste manual).
 *
 * Layout esperado (igual ao da planilha SEASS 2026):
 *  - uma aba por mês (JANEIRO ... DEZEMBRO); cada dia ocupa um bloco de colunas: Dom=C, Seg=E, Ter=H, Qua=K, Qui=N, Sex=Q, Sáb=T
 *  - o número do dia fica na linha de cabeçalho da semana
 *  - faixas por dia: "ATMs PRESENCIAIS" -> Presencial ; "ATMs REMOTOS" -> Remoto ; "AÇÕES" encerra
 *  - a atividade fica na 2ª coluna do bloco; o nº do processo na 1ª; a linha "Informes" (coluna D) encerra a área com datas
 */
const GERENCIAS_VALIDAS = ['GEBEN', 'GEPSB', 'GEPMC', 'GEFEAS', 'VSA', 'CAD', 'GETEP', 'GEPAC'];
const APELIDOS_GER = { GFEAS: 'GEFEAS', GEFAS: 'GEFEAS', GEPBS: 'GEPSB' };     // erros de digitação conhecidos
const GVINF_EXPANDE_PARA = ['CAD', 'VSA'];                    // GVINF vira CAD e VSA (exceto GVINF/CAD, GVINF/VSA)
const MODALIDADES = ['Presencial', 'Remoto'];
const LIMITE_SEMELHANCA = 0.84;                               // corrige grafias: "Garanhus" -> "Garanhuns"
const APELIDOS_MUNICIPIOS = { 'Jaboatão': 'Jaboatão dos Guararapes' };
const MESES = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
const COLS_DIA = [2, 4, 7, 10, 13, 16, 19];                   // índices 0-based de C, E, H, K, N, Q, T
const COL_INFORMES = 3;                                       // coluna D
const STOP = ['ao', 'a', 'o', 'de', 'do', 'da', 'dos', 'das', 'no', 'na', 'em', 'municipio', 'municipios'];

// listas derivadas, criadas na primeira vez que são usadas (evita depender da ordem de carga dos arquivos)
let _mun = null;
function municipios_() {
  if (!_mun) {
    const porNorm = {};
    MUNICIPIOS_PE.forEach(n => { porNorm[norm(n)] = n; });
    _mun = { porNorm, ordenados: Object.keys(porNorm).sort((a, b) => b.length - a.length) };   // nomes longos primeiro
  }
  return _mun;
}
function municipioOficial(nome) { return municipios_().porNorm[norm(nome)] || null; }
function listaMunicipios() { return MUNICIPIOS_PE.slice().sort((a, b) => cmp(a.toLowerCase(), b.toLowerCase())); }
function reToken_(flags) {
  return new RegExp('(?<![A-Za-zÀ-ÿ])(' + GERENCIAS_VALIDAS.concat(Object.keys(APELIDOS_GER), ['GVINF']).join('|') + ')(?![A-Za-zÀ-ÿ])', flags);
}

// ---------------------------------------------------------------- semelhança de textos (equivale ao difflib do Python)
function casados_(a, alo, ahi, b, blo, bhi) {
  if (alo >= ahi || blo >= bhi) return 0;
  let bi = 0, bj = 0, bk = 0, prev = {};
  for (let i = alo; i < ahi; i++) {
    const cur = {};
    for (let j = blo; j < bhi; j++) {
      if (a[i] === b[j]) {
        const k = (prev[j - 1] || 0) + 1;
        cur[j] = k;
        if (k > bk) { bk = k; bi = i - k + 1; bj = j - k + 1; }
      }
    }
    prev = cur;
  }
  if (!bk) return 0;
  return bk + casados_(a, alo, bi, b, blo, bj) + casados_(a, bi + bk, ahi, b, bj + bk, bhi);
}
function razao(a, b) { return a.length + b.length ? 2.0 * casados_(a, 0, a.length, b, 0, b.length) / (a.length + b.length) : 1; }
function maisParecido(palavra, candidatos, corte) {
  let melhor = null;
  candidatos.forEach(x => {
    const r = razao(x, palavra);
    if (r >= corte && (!melhor || r > melhor.r || (r === melhor.r && x > melhor.x))) melhor = { r, x };
  });
  return melhor ? melhor.x : null;
}

// ---------------------------------------------------------------- interpretação do texto de cada célula
function letraColuna(n) {   // 1 -> A
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
function numDia(v) {
  const s = String(v == null ? '' : v).trim();
  if (!/^\d+(\.0+)?$/.test(s)) return null;
  const n = Math.floor(Number(s));
  return n >= 1 && n <= 31 ? n : null;
}

function resolverMunicipios(texto) {
  let t = String(texto || '').replace(/\([^)]*\)/g, ' ');
  t = t.replace(/\b\d{1,2}\s*(?:h|hs|hrs?)\s*\d{0,2}\b|\b\d{1,2}:\d{2}\b/gi, ' ');
  let resto = norm(t);
  const M = municipios_(), achados = [];
  M.ordenados.forEach(nn => {
    const re = new RegExp('(?<![a-z0-9])' + escRe(nn) + '(?![a-z0-9])');
    let m;
    while ((m = re.exec(resto))) {
      achados.push([m.index, M.porNorm[nn]]);
      resto = resto.slice(0, m.index) + ' '.repeat(m[0].length) + resto.slice(m.index + m[0].length);
    }
  });
  achados.sort((a, b) => a[0] - b[0]);
  const muns = [];
  achados.forEach(a => { if (muns.indexOf(a[1]) < 0) muns.push(a[1]); });

  const obs = [], pend = [], apelidos = {};
  Object.keys(APELIDOS_MUNICIPIOS).forEach(k => { apelidos[norm(k)] = APELIDOS_MUNICIPIOS[k]; });
  resto.split(/,|;|\/|\s-\s|\be\b/).forEach(peca0 => {
    const toks = peca0.split(/\s+/).filter(Boolean);
    while (toks.length && STOP.indexOf(toks[0]) >= 0) toks.shift();
    while (toks.length && STOP.indexOf(toks[toks.length - 1]) >= 0) toks.pop();
    const peca = toks.join(' ');
    if (peca.length < 3 || !/[a-z]/.test(peca)) return;
    const cand = maisParecido(peca, Object.keys(M.porNorm), LIMITE_SEMELHANCA);
    const apelido = apelidos[peca];
    if (apelido || cand) {
      const oficial = apelido || M.porNorm[cand];
      if (muns.indexOf(oficial) < 0) muns.push(oficial);
      obs.push("grafia corrigida: '" + peca + "' → '" + oficial + "'");
    } else pend.push(peca);
  });
  return { muns, obs, pend, ok: muns.length > 0 && pend.length === 0 };
}

/** Só as gerências válidas do texto, aplicando apelidos e a regra do GVINF. Devolve "A, B". */
function extrairGerencias(texto) {
  texto = String(texto || '');
  const out = [], re = reToken_('gi');
  let m;
  while ((m = re.exec(texto))) {
    let tok = m[1].toUpperCase();
    tok = APELIDOS_GER[tok] || tok;
    let novos;
    if (tok === 'GVINF') {
      if (/^\s*[/(]\s*(?:CAD|VSA)(?![A-Za-zÀ-ÿ])/i.test(texto.slice(m.index + m[0].length))) continue;   // GVINF/CAD: vale só o que foi escrito
      novos = GVINF_EXPANDE_PARA;
    } else novos = [tok];
    novos.forEach(n => { if (out.indexOf(n) < 0) out.push(n); });
  }
  return out.join(', ');
}

/** Quebra o texto da célula em [município, gerências, observações]. */
function interpretar(texto) {
  const linhas = String(texto).replace(/\r/g, '').split('\n').map(l => l.trim()).filter(l => l);
  let i0 = linhas.findIndex(l => /^ATM/i.test(l));
  if (i0 < 0) i0 = 0;
  const obs = linhas.slice(0, i0), ls = linhas.slice(i0);        // ex.: "(Será Remarcado)" antes do ATM
  let mun = '', resto = [];
  const primeira = ls[0] || '';
  const m = /munic[ií]pio\s+de\b\s*(.*)$/i.exec(primeira) || /munic[ií]pio\s+(?!de\b)(.+)$/i.exec(primeira) || /ATM\s+em\s+(.+)$/i.exec(primeira);
  if (m && m[1].trim()) { mun = m[1].trim(); resto = ls.slice(1); }
  else if (ls.length > 1) { mun = ls[1]; resto = ls.slice(2); }

  const gerTxt = [], tk = reToken_('i').exec(mun);                // gerência escrita na mesma linha do município
  if (tk && tk.index > 0) { gerTxt.push(mun.slice(tk.index)); mun = mun.slice(0, tk.index); }
  mun = stripChars(mun, ' -–/,;');
  resto.forEach(l => {
    if (/^CONFIRMA[ÇC][ÃA]O$/i.test(l)) obs.push('CONFIRMAÇÃO');
    else if (/^\(.*\)$/.test(l) || /remarcad/i.test(l)) obs.push(stripChars(l, '()'));
    else gerTxt.push(l);
  });
  return [mun, gerTxt.join(' '), obs.join('; ')];
}

/**
 * Oficina: o texto da célula (na faixa AÇÕES) é
 *   "Oficina: Nome da oficina" / "Município" / "GEPAC e GEPSB"   (município e gerências podem vir na mesma linha)
 * Devolve [nome, município, gerências, observações].
 */
function interpretarOficina(texto) {
  const linhas = String(texto).replace(/\r/g, '').split('\n').map(l => l.trim()).filter(l => l);
  const i0 = linhas.findIndex(l => /^Oficina\s*:/i.test(l));
  const obs = linhas.slice(0, Math.max(i0, 0)).map(l => stripChars(l, '()'));
  const ls = linhas.slice(Math.max(i0, 0));
  const nome = (ls[0] || '').replace(/^Oficina\s*:\s*/i, '').trim();
  const resto = [];
  ls.slice(1).forEach(l => {
    if (/^CONFIRMA[ÇC][ÃA]O$/i.test(l)) obs.push('CONFIRMAÇÃO');
    else if (/^\(.*\)$/.test(l) || /remarcad/i.test(l)) obs.push(stripChars(l, '()'));
    else resto.push(l);
  });
  let mun = resto[0] || '';
  const gerTxt = resto.slice(1);
  const tk = reToken_('i').exec(mun);                             // gerência escrita na mesma linha do município
  if (tk && tk.index > 0) { gerTxt.unshift(mun.slice(tk.index)); mun = mun.slice(0, tk.index); }
  mun = stripChars(mun, ' -–/,;');
  return [nome, mun, gerTxt.join(' '), obs.join('; ')];
}

// ---------------------------------------------------------------- extração
/** vals = matriz de valores de uma aba. Devolve {linhas, avisos}. inicio/fim (ISO) limitam a janela. */
function extrairDeMatriz(nomeAba, mes, vals, inicio, fim, ano) {
  const linhas = [], avisos = [], nL = vals.length;
  const cel = (r, c) => (r < nL && c < vals[r].length && vals[r][c] !== null && vals[r][c] !== undefined) ? vals[r][c] : '';

  const cab = {};                                                 // 1) cabeçalhos de semana (linhas com o número dos dias)
  for (let r = 0; r < nL; r++) {
    const dias = {};
    COLS_DIA.forEach(c => { const d = numDia(cel(r, c)); if (d) dias[c] = d; });
    if (!Object.keys(dias).length) continue;
    const prox = r + 1 < nL ? vals[r + 1] : [];
    if (r <= 5 || prox.some(v => /^ATMs/i.test(String(v || '').trim()))) cab[r] = dias;
  }
  const ordem = Object.keys(cab).map(Number).sort((a, b) => a - b);

  let limite = nL;                                                // 2) tudo abaixo de "Informes" fica de fora
  for (let r = 0; r < nL; r++) if (String(cel(r, COL_INFORMES)).trim().toLowerCase() === 'informes') { limite = r; break; }

  const capturadas = {}, area = {};
  ordem.forEach((r0, i) => {
    const r1 = Math.min(i + 1 < ordem.length ? ordem[i + 1] : limite, limite);
    COLS_DIA.forEach((c, idxCol) => {
      const dia = cab[r0][c];
      if (!dia) return;
      if (!dataValida(ano, mes, dia)) { avisos.push(`${nomeAba}: dia inválido ${dia} em ${letraColuna(c + 1)}${r0 + 1}`); return; }
      const data = isoDe(ano, mes, dia);
      if (new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay() !== idxCol)
        avisos.push(`${nomeAba}: ${pad2(dia)}/${pad2(mes)} não bate com a coluna ${letraColuna(c + 1)}${r0 + 1}`);
      if ((inicio && data < inicio) || (fim && data > fim)) return;   // fora da janela pedida
      let faixa = null;
      for (let r = r0 + 1; r < r1; r++) {
        area[r + ',' + (c + 1)] = [r, c + 1];
        const sec = cel(r, c);
        if (typeof sec === 'string') {
          const s = sec.trim().toUpperCase();
          if (s.startsWith('ATMS PRESENCIAIS')) faixa = 'Presencial';
          else if (s.startsWith('ATMS REMOTOS')) faixa = 'Remoto';
          else if (s === 'AÇÕES' || s === 'AÇOES') faixa = null;
        }
        const v = cel(r, c + 1);
        if (typeof v === 'string' && /^\s*Oficina\s*:/i.test(v)) {                          // oficinas ficam na faixa AÇÕES
          const [nomeOf, munOf, gerOf, obsOf] = interpretarOficina(v);
          const gerO = extrairGerencias(gerOf), resO = resolverMunicipios(munOf);
          const revisarO = !resO.ok || !gerO || !nomeOf;
          const extrasO = obsOf ? [obsOf] : [];
          resO.obs.forEach(o => extrasO.push(o));
          if (resO.pend.length) extrasO.push('trecho não reconhecido: ' + resO.pend.join(' / '));
          if (revisarO) extrasO.push('texto original: ' + v.replace(/\s+/g, ' ').trim().slice(0, 90));
          (resO.muns.length ? resO.muns : [munOf]).forEach(mun => {
            linhas.push({ data, ger: gerO, modalidade: '', tipo: 'Oficina', oficina: nomeOf, proc: String(cel(r, c)).trim(), obs: extrasO.join('; '),
                          mes: nomeAba, celula: letraColuna(c + 2) + (r + 1), revisar: revisarO ? 'SIM' : '', mun });
          });
          capturadas[r + ',' + (c + 1)] = true;
          continue;
        }
        if (!(typeof v === 'string' && /^\s*ATM/i.test(v)) || faixa === null) continue;   // só ATMs dentro das duas faixas
        const [munTxt, gerTxt, obs] = interpretar(v);
        const ger = extrairGerencias(gerTxt);
        const res = resolverMunicipios(munTxt);
        const proc = cel(r, c);
        const revisar = !res.ok || !ger;
        const extras = obs ? [obs] : [];
        res.obs.forEach(o => extras.push(o));
        if (res.pend.length) extras.push('trecho não reconhecido: ' + res.pend.join(' / '));
        if (revisar) extras.push('texto original: ' + v.replace(/\s+/g, ' ').trim().slice(0, 90));
        (res.muns.length ? res.muns : [munTxt]).forEach(mun => {
          linhas.push({ data, ger, modalidade: faixa, tipo: 'ATM', oficina: '', proc: String(proc).trim(), obs: extras.join('; '), mes: nomeAba,
                        celula: letraColuna(c + 2) + (r + 1), revisar: revisar ? 'SIM' : '', mun });
        });
        capturadas[r + ',' + (c + 1)] = true;
      }
    });
  });

  // 3) varredura de segurança: "ATM" na área lida que não foi capturado (ex.: digitado fora das faixas)
  const celulas = [];
  if (!inicio && !fim) { for (let r = 0; r < Math.min(limite, nL); r++) for (let c = 0; c < vals[r].length; c++) celulas.push([r, c]); }
  else Object.keys(area).forEach(k => celulas.push(area[k]));
  celulas.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  celulas.forEach(([r, c]) => {
    const v = cel(r, c);
    if (typeof v === 'string' && /^\s*ATM(?!s\s)/i.test(v) && !capturadas[r + ',' + c])
      avisos.push(`${nomeAba}!${letraColuna(c + 1)}${r + 1} tem 'ATM' mas não foi capturada (fora das faixas?): '${v.slice(0, 50)}'`);
  });
  return { linhas, avisos };
}

/** lerAba(nome) devolve a matriz da aba (ou null se não existir). inicio/fim: ISO. */
function extrairCalendario(lerAba, inicio, fim, ano) {
  let linhas = [], avisos = [];
  MESES.forEach((nome, i) => {
    const mes = i + 1;
    const primeiro = isoDe(ano, mes, 1), ultimo = isoDe(ano, mes, new Date(Date.UTC(ano, mes, 0)).getUTCDate());
    if ((inicio && ultimo < inicio) || (fim && primeiro > fim)) return;     // mês fora da janela: nem lê
    const vals = lerAba(nome);
    if (!vals) { if (inicio || fim) avisos.push(`aba ${nome} não encontrada na planilha (o nome da aba mudou?)`); return; }
    const r = extrairDeMatriz(nome, mes, vals, inicio, fim, ano);
    linhas = linhas.concat(r.linhas);
    avisos = avisos.concat(r.avisos);
  });
  const cont = {};
  linhas.forEach(l => {                                                     // chave única: data | processo | município
    const base = l.data + '|' + (l.tipo === 'Oficina' ? 'OF-' + slug(l.oficina) : l.proc) + '|' + norm(l.mun);
    cont[base] = (cont[base] || 0) + 1;
    l.chave = cont[base] === 1 ? base : base + '#' + cont[base];
  });
  linhas.sort((a, b) => cmp(a.data, b.data) || cmp(a.modalidade !== 'Presencial', b.modalidade !== 'Presencial') || cmp(a.mun, b.mun));
  return { linhas, avisos };
}

// ---------------------------------------------------------------- sincronização com as atividades do CONTROLE
const CAMPOS_SYNC = [['mun', 'Município'], ['ger', 'Gerências'], ['modalidade', 'Modalidade'], ['tipo', 'Tipo'], ['oficina', 'Oficina'], ['obs', 'Observação'], ['origem', 'Origem']];
const FRACAO_MINIMA = 0.5;     // leitura com menos que isso dos ATMs ativos da janela é tratada como suspeita

function assinatura_(l) { return [l.mun, l.ger, l.modalidade, l.tipo || 'ATM', l.oficina || '', l.obs, l.revisar].join('|'); }
function dataDaChave(a) { return /^\d{4}-\d{2}-\d{2}/.test(a.chave) ? a.chave.slice(0, 10) : a.data; }

function novaAtividade(l, agora) {
  return { data: l.data, mun: l.mun, modalidade: l.modalidade, tipo: l.tipo || 'ATM', oficina: l.oficina || '', ger: l.ger, proc: l.proc, obs: l.obs, revisar: l.revisar === 'SIM',
           nao_auto: false, status: '', n: null, enviado_em: null, tipo_envio: '', motivo: '', link: '', situacao: 'Ativo',
           origem: l.mes + ' ' + l.celula, assinatura: assinatura_(l), manual: false, chave: l.chave, atualizado: agora };
}

/** Altera 'atividades' no lugar. Devolve eventos [[evento, município, data, detalhe]]. */
function mesclar(atividades, linhas, ini, fim, agora, forcar) {
  const ev = [];
  const naJanela = d => d && ini <= d && d <= fim;
  const ativos = atividades.filter(a => a.situacao === 'Ativo' && naJanela(dataDaChave(a)));
  const suspeito = (ativos.length && !linhas.length) || (ativos.length >= 4 && linhas.length < ativos.length * FRACAO_MINIMA);
  if (suspeito && !forcar) {
    return [['ABORTADO', '', null, `Leitura suspeita (${linhas.length} ATMs lidos contra ${ativos.length} já cadastrados na semana). Nada foi alterado.`]];
  }
  const porChave = {};
  atividades.forEach(a => { porChave[a.chave] = a; });
  const vistas = {};
  linhas.forEach(l => {
    vistas[l.chave] = true;
    let a = porChave[l.chave];
    if (!a) {
      a = novaAtividade(l, agora);
      atividades.push(a);
      porChave[a.chave] = a;
      ev.push(['NOVO', a.mun, a.data, a.tipo === 'Oficina' ? `Oficina: ${a.oficina} — ${a.ger}` : `${a.ger} (${a.modalidade})`]);
      return;
    }
    const reativado = a.situacao !== 'Ativo';
    a.situacao = 'Ativo';
    const nova = assinatura_(l);
    const difs = reativado ? ['voltou ao calendário'] : [];
    if (!(a.manual && a.assinatura === nova)) {                              // ajuste manual preservado se nada mudou
      const novos = { mun: l.mun, ger: l.ger, modalidade: l.modalidade, tipo: l.tipo || 'ATM', oficina: l.oficina || '', obs: l.obs, origem: l.mes + ' ' + l.celula };
      CAMPOS_SYNC.forEach(([k, rotulo]) => {
        if (String(a[k] || '') !== novos[k]) { difs.push(`${rotulo}: "${a[k] || ''}" → "${novos[k]}"`); a[k] = novos[k]; }
      });
      a.revisar = l.revisar === 'SIM';
      a.assinatura = nova;
      a.manual = false;
    }
    if (difs.length) { a.atualizado = agora; ev.push([reativado ? 'REATIVADO' : 'ALTERADO', a.mun, a.data, difs.join(' | ')]); }
  });
  ativos.forEach(a => {
    if (!vistas[a.chave]) {
      a.situacao = 'Removido do calendário';
      a.atualizado = agora;
      ev.push(['REMOVIDO', a.mun, a.data, 'não está mais no calendário']);
    }
  });
  return ev;
}

function ordenarAtividades(atividades) {
  atividades.sort((a, b) => cmp(a.data || '9999', b.data || '9999') || cmp(a.modalidade !== 'Presencial', b.modalidade !== 'Presencial') || cmp(norm(a.mun), norm(b.mun)));
}

// ==================================================================== Dados.gs
/**
 * DADOS: planilha de controle (esta planilha) e respostas do formulário.
 * Abas do controle: Atividades, Gerências, Configurações, Log, Mudanças do calendário.
 */
const COLUNAS = [   // [campo, título, largura]
  ['data', 'Data', 12], ['mun', 'Município', 28], ['modalidade', 'Modalidade', 12], ['ger', 'Gerências', 26],
  ['proc', 'Nº do processo', 14], ['obs', 'Observação', 40], ['revisar', 'Revisar', 9],
  ['nao_auto', 'Não enviar automático', 12], ['status', 'Status do envio', 15], ['n', 'Nº de avaliações', 11],
  ['enviado_em', 'Enviado/verificado em', 18], ['tipo_envio', 'Tipo do envio', 13], ['motivo', 'Motivo (automático)', 40],
  ['link', 'Link da pasta (PDF e Word)', 30], ['situacao', 'Situação no calendário', 22], ['origem', 'Origem (aba/célula)', 18],
  ['assinatura', 'Leitura do calendário', 20], ['manual', 'Ajuste manual', 10], ['chave', 'Chave', 30], ['atualizado', 'Atualizado em', 18],
  ['tipo', 'Tipo (ATM/Oficina)', 12], ['oficina', 'Nome da oficina', 34]];
const SIM_NAO = ['revisar', 'nao_auto', 'manual'];
const FORMATOS_COL = { data: 'dd/MM/yyyy', proc: '@', enviado_em: 'dd/MM/yyyy HH:mm', atualizado: 'dd/MM/yyyy HH:mm', n: '0' };
const ENVIADO = 'Enviado', SEM_AVALIACOES = 'Sem avaliações', PARCIAL = 'Parcial';

/** Chave de uma atividade (ATM ou oficina): data|município[|nome da oficina]. Usada na tela e na aba Envios por gerência. */
function gkeyDe_(a) { return a.data + '|' + a.mun + (a.tipo === 'Oficina' ? '|' + (a.oficina || '') : ''); }
function partesGkey_(k) {
  const p = String(k).split('|');
  return { data: p[0], municipio: p[1], oficina: p.slice(2).join('|') };
}
/** Valor especial de "gerência" para o relatório geral: todas as avaliações da atividade, sem dividir por gerência. */
const GER_TODAS = 'TODAS';
const normGer_ = g => { const t = String(g || '').trim().toUpperCase(); return APELIDOS_GER[t] || t; };

// ---- aba "Unidades x Gerências": de qual gerência é cada Unidade/Setor do formulário (pode ser editada na planilha)
const ABA_UNIDADES = 'Unidades x Gerências';
const UNIDADES_PADRAO = [   // [Unidade/Setor (igual ao formulário), Gerência primária, Gerência secundária]
  ['Primeira Infância', 'GEPSB', 'GEPMC'], ['Cadastro Único', 'CAD', 'VSA'], ['Serviço de Acolhimento', 'GEPAC', 'GEPMC'],
  ['CRAS', 'GEPSB', 'GEPMC'], ['Serviço de Convivência e Fortalecimento de Vínculos (SCFV)', 'GEPSB', 'GEPMC'], ['CREAS', 'GEPMC', 'GEPAC'],
  ['Gestão Municipal (Secretários, Secretários Executivos, Gerentes e Assessores)', 'GEFEAS', 'VSA'],
  ['Vigilância Socioassistencial', 'VSA', 'GETEP'], ['Benefício de Prestação Continuada na Escola (BPC na Escola)', 'GEBEN', 'GEPSB'],
  ['Benefícios Eventuais', 'GEBEN', 'GEPSB'], ['ACESSUAS - Trabalho', 'GEPSB', 'GEPMC'], ['Programa Família Acolhedora', 'GEPAC', 'GEPMC'],
  ['Gestão de Trabalho', 'GETEP', 'VSA'], ['Serviço de Abordagem Social (SAS)', 'GEPMC', 'GEPAC'],
  ['Programa de Erradicação do Trabalho Infantil (PETI)', 'GEPMC', 'GEPAC'], ['Centro POP', 'GEPMC', 'GEPAC'],
  ['Medida Socioeducativa (MSE)', 'GEPMC', 'GEPAC'], ['Programa Mães de Pernambuco', 'GEBEN', 'GEPSB'],
  ['Benefício de Prestação Continuada (BPC)', 'GEBEN', 'GEPSB'], ['Serviço Família Acolhedora', 'GEPAC', 'GEPMC'],
  ['Benefício Eventual Emergencial', 'GEBEN', 'GEPSB'], ['Cuidados em Família Extensa', 'GEPAC', 'GEPMC']];

const COL_ENVIOS = [   // [campo, título, largura]  -- uma linha por atividade + gerência
  ['gkey', 'Chave da atividade', 34], ['data', 'Data', 12], ['mun', 'Município', 26], ['tipo', 'Tipo', 10], ['oficina', 'Oficina', 30],
  ['ger', 'Gerência', 12], ['status', 'Status', 15], ['n', 'Nº de avaliações', 11], ['enviado_em', 'Enviado/verificado em', 18],
  ['tipo_envio', 'Tipo do envio', 14], ['motivo', 'Motivo', 40], ['pdf', 'Link do PDF', 30], ['docx', 'Link do Word', 30]];
const FORMATOS_ENVIOS = { data: 'dd/MM/yyyy', enviado_em: 'dd/MM/yyyy HH:mm', n: '0' };

const ABAS_EXTRAS = {
  'Log': ['Execução', 'Origem', 'Município', 'Datas dos apoios', 'Nº de avaliações', 'Nº de destinatários', 'Status', 'Remetente usado', 'Link do PDF', 'Observação', 'Gerência'],
  'Mudanças do calendário': ['Data/hora', 'Evento', 'Município', 'Data do ATM', 'Detalhe'],
};
const CALENDARIO_PADRAO = 'https://docs.google.com/spreadsheets/d/1U1yoaMT9x51nDpjt-i1mJFOacDv7bibond7A6hB3E3E/edit?usp=sharing';
const CONFIG_PADRAO = [   // [chave, valor, descrição]
  ['CALENDARIO_URL', CALENDARIO_PADRAO, 'Link do calendário online (Google Planilhas). Esta conta precisa conseguir abri-lo.'],
  ['RESPOSTAS_PLANILHA', '1Gf-QH1DkZW0erw54qyORay_Frgm94eA8Dyf3ww7T_RA', 'Link ou ID da planilha de respostas do formulário de avaliação.'],
  ['RESPOSTAS_ABA', 'Sheet1', 'Nome da aba das respostas. Se não existir, usa o GID abaixo e, por fim, a primeira aba.'],
  ['RESPOSTAS_GID', '0', 'GID da aba das respostas (número depois de gid= no link).'],
  ['INCLUIR_DIA_SEGUINTE', 'Sim', 'Sim = respostas datadas do dia seguinte também entram, se o município não tiver outra atividade nesse dia.'],
  ['CAMPO_DATA_BUSCA', 'data_apoio', 'data_apoio (pergunta "data do apoio") ou carimbo (data/hora em que a resposta foi enviada).'],
  ['MODELO_RELATORIO', '11Eoo8_xnEu9rzsOFOJ7CgDkVaIw3Ik70G1POwD7Hd1A', 'Link ou ID do Google Docs usado como modelo do relatório (marcadores {{MUNICIPIO}}, {{DATAS}}, {{MODALIDADE}}, {{EMAIL}} ou {{GERENCIAS}}, {{CONTEUDO}}). Vazio = PDF simples.'],
  ['MODELO_RELATORIO_OFICINA', '1npMS_utFpPJauKD0wDMFrwFn9DFI09kBnM19EEw_HQk', 'Link ou ID do Google Docs usado como modelo do relatório de OFICINA (marcadores {{OFICINA}}, {{MUNICIPIO}}, {{DATAS}}, {{EMAIL}} ou {{GERENCIAS}}, {{CONTEUDO}}). Vazio = PDF simples.'],
  ['AUTOMATICO', 'Não', 'Sim/Não. Também se liga e desliga na página (aba Automático).'],
  ['HORA_AUTOMATICO', '17', 'Hora do envio automático (0 a 23). O Google pode atrasar uns 15 minutos.'],
  ['MINUTO_AUTOMATICO', '0', 'Minuto aproximado do envio automático (0 a 59).'],
  ['MODO_TESTE', 'Sim', 'Sim = o automático envia SÓ para EMAIL_TESTE e não marca nada como enviado. Não = envia de verdade.'],
  ['EMAIL_TESTE', '', 'E-mail que recebe os envios de teste (vazio = a conta que hospeda o script).'],
  ['REMETENTE', 'atm@sas.pe.gov.br', 'Endereço preferido para enviar. Só funciona se estiver em "Enviar e-mail como" no Gmail da conta; senão usa a própria conta.'],
  ['NOME_REMETENTE', 'NATM', 'Nome que aparece como remetente.'],
  ['EMAIL_PARA', 'atm@sas.pe.gov.br', 'Destinatário fixo (campo Para). As gerências vão sempre em cópia oculta (CCO).'],
  ['USUARIOS_PERMITIDOS', '', 'Opcional: e-mails (separados por vírgula) que podem usar a página. Vazio = todo o domínio.'],
  ['ASSUNTO_RELATORIO', '', 'Assunto do e-mail com relatório do ATM. Marcadores: {{MUNICIPIO}}, {{DATA}}, {{GERENCIA}}. Vazio = padrão.'],
  ['CORPO_RELATORIO', '', 'Texto do e-mail com relatório do ATM. Mesmos marcadores. Vazio = padrão.'],
  ['ASSUNTO_RELATORIO_OFICINA', '', 'Assunto do e-mail com relatório de oficina. Marcadores: {{OFICINA}}, {{MUNICIPIO}}, {{DATA}}, {{GERENCIA}}. Vazio = padrão.'],
  ['CORPO_RELATORIO_OFICINA', '', 'Texto do e-mail com relatório de oficina. Mesmos marcadores. Vazio = padrão.'],
  ['ASSUNTO_SEM_RESPOSTAS', '', 'Assunto do aviso manual "sem avaliações" (ATM). Vazio = padrão.'],
  ['CORPO_SEM_RESPOSTAS', '', 'Texto do aviso manual "sem avaliações". Vazio = padrão.'],
];

// ---------------------------------------------------------------- planilha de controle
let _ss = null;
function planilhaControle() {
  if (!_ss) _ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!_ss) throw new ErroDados('Este script precisa estar vinculado à planilha de controle (Extensões > Apps Script, dentro da planilha).');
  return _ss;
}

function estilizarCabecalho_(sh, titulos, larguras) {
  const r = sh.getRange(1, 1, 1, titulos.length);
  r.setValues([titulos]).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#1F3864').setHorizontalAlignment('center');
  if (larguras) larguras.forEach((w, i) => sh.setColumnWidth(i + 1, w * 7));
  sh.setFrozenRows(1);
}

/** Cria o que faltar (abas, cabeçalhos, chaves de configuração). Seguro para chamar sempre. */
function garantirEstrutura() {
  const ss = planilhaControle();
  let sh = ss.getSheetByName('Atividades');
  if (!sh) {
    sh = ss.getSheets().length === 1 && !ss.getSheets()[0].getLastRow() ? ss.getSheets()[0].setName('Atividades') : ss.insertSheet('Atividades');
    estilizarCabecalho_(sh, COLUNAS.map(c => c[1]), COLUNAS.map(c => c[2]));
  } else sincronizarCabecalho_(sh, COLUNAS.map(c => c[1]), COLUNAS.map(c => c[2]), true);
  if (!ss.getSheetByName(ABA_UNIDADES)) {
    const u = ss.insertSheet(ABA_UNIDADES);
    estilizarCabecalho_(u, ['Unidade/Setor (igual ao formulário)', 'Gerência Primária', 'Gerência Secundária'], [70, 18, 18]);
    u.getRange(2, 1, UNIDADES_PADRAO.length, 3).setNumberFormat('@').setValues(UNIDADES_PADRAO);
  }
  if (!ss.getSheetByName('Envios por gerência')) estilizarCabecalho_(ss.insertSheet('Envios por gerência'), COL_ENVIOS.map(c => c[1]), COL_ENVIOS.map(c => c[2]));
  if (!ss.getSheetByName('Gerências')) {
    const g = ss.insertSheet('Gerências');
    estilizarCabecalho_(g, ['Gerência', 'Gerente', 'E-mail corporativo', 'Ativa'], [16, 22, 40, 8]);
    g.getRange(2, 1, GERENCIAS_VALIDAS.length, 4).setValues(GERENCIAS_VALIDAS.map(n => [n, '', '', 'Sim']));
  }
  const cf = ss.getSheetByName('Configurações') || ss.insertSheet('Configurações');
  if (cf.getLastRow() < 1) estilizarCabecalho_(cf, ['Chave', 'Valor', 'Descrição'], [26, 60, 90]);
  const existentes = cf.getRange(2, 1, Math.max(cf.getLastRow() - 1, 1), 1).getValues().map(r => String(r[0]).trim());
  const faltam = CONFIG_PADRAO.filter(c => existentes.indexOf(c[0]) < 0);
  if (faltam.length) {
    const ini = cf.getLastRow() + 1;
    cf.getRange(ini, 2, faltam.length, 1).setNumberFormat('@');
    cf.getRange(ini, 1, faltam.length, 3).setValues(faltam);
  }
  Object.keys(ABAS_EXTRAS).forEach(nome => {
    const larg = [18, 14, 28, 22, 13, 13, 14, 26, 40, 60, 12];
    if (!ss.getSheetByName(nome)) estilizarCabecalho_(ss.insertSheet(nome), ABAS_EXTRAS[nome], larg);
    else sincronizarCabecalho_(ss.getSheetByName(nome), ABAS_EXTRAS[nome], larg, false);
  });
}

/** Garante que o cabeçalho tenha todas as colunas (planilhas criadas por versões anteriores ganham as novas no fim). */
function sincronizarCabecalho_(sh, titulos, larguras, sobrescrever) {
  const atual = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), titulos.length)).getValues()[0];
  let mudou = false;
  const novo = titulos.map((t, i) => { const v = String(atual[i] || ''); if (!v || (sobrescrever && v !== t)) { mudou = true; return t; } return v; });
  if (mudou) estilizarCabecalho_(sh, novo, larguras);
}

function textoCel_(v) { return v === null || v === undefined ? '' : String(v).trim(); }

function lerControle() {
  garantirEstrutura();
  const ss = planilhaControle();
  const ctrl = { atividades: [], gerencias: {}, config: {}, envios: {}, unidades: {}, avisosUnidades: [] };
  const campos = COLUNAS.map(c => c[0]);
  const dados = ss.getSheetByName('Atividades').getDataRange().getValues();
  for (let i = 1; i < dados.length; i++) {
    const a = {};
    campos.forEach((k, j) => { a[k] = dados[i][j]; });
    a.data = paraIso(a.data, TZ);
    if (!a.data || !textoCel_(a.mun)) continue;
    SIM_NAO.forEach(k => { a[k] = norm(a[k]) === 'sim'; });
    ['mun', 'modalidade', 'ger', 'proc', 'obs', 'status', 'tipo_envio', 'motivo', 'link', 'situacao', 'origem', 'assinatura', 'chave', 'tipo', 'oficina'].forEach(k => { a[k] = textoCel_(a[k]); });
    a.tipo = a.tipo === 'Oficina' ? 'Oficina' : 'ATM';
    a.situacao = a.situacao || 'Ativo';
    a.n = a.n === '' || a.n === null || isNaN(Number(a.n)) ? null : Number(a.n);
    a.enviado_em = paraDataHora(a.enviado_em, TZ);
    a.atualizado = paraDataHora(a.atualizado, TZ);
    ctrl.atividades.push(a);
  }
  ss.getSheetByName('Gerências').getDataRange().getValues().slice(1).forEach(r => {
    if (textoCel_(r[0])) ctrl.gerencias[textoCel_(r[0])] = { gerente: textoCel_(r[1]), email: textoCel_(r[2]), ativa: norm(r[3] || 'Sim') !== 'nao' };
  });
  ss.getSheetByName('Configurações').getDataRange().getValues().slice(1).forEach(r => {
    if (textoCel_(r[0])) ctrl.config[textoCel_(r[0])] = textoCel_(r[1]);
  });
  CONFIG_PADRAO.forEach(c => { if (!(c[0] in ctrl.config)) ctrl.config[c[0]] = c[1]; });
  ss.getSheetByName(ABA_UNIDADES).getDataRange().getValues().slice(1).forEach(r => {
    const un = textoCel_(r[0]);
    if (!un) return;
    const prim = normGer_(r[1]), sec = normGer_(r[2]);
    [prim, sec].forEach(g => { if (g && GERENCIAS_VALIDAS.indexOf(g) < 0) ctrl.avisosUnidades.push(`Aba "${ABA_UNIDADES}": gerência '${g}' (unidade '${un}') não é uma gerência conhecida.`); });
    ctrl.unidades[norm(un)] = { unidade: un, prim, sec };
  });
  const campE = COL_ENVIOS.map(c => c[0]);
  ss.getSheetByName('Envios por gerência').getDataRange().getValues().slice(1).forEach(row => {
    const e = {};
    campE.forEach((k, j) => { e[k] = row[j]; });
    ['gkey', 'mun', 'tipo', 'oficina', 'ger', 'status', 'tipo_envio', 'motivo', 'pdf', 'docx'].forEach(k => { e[k] = textoCel_(e[k]); });
    if (!e.gkey || !e.ger) return;
    e.data = paraIso(e.data, TZ);
    e.n = e.n === '' || e.n === null || isNaN(Number(e.n)) ? null : Number(e.n);
    e.enviado_em = paraDataHora(e.enviado_em, TZ);
    ctrl.envios[envioChave_(e.gkey, e.ger)] = e;
  });
  return ctrl;
}

function salvarAtividades(atividades) {
  const ss = planilhaControle(), sh = ss.getSheetByName('Atividades');
  ordenarAtividades(atividades);
  const ult = sh.getLastRow();
  if (ult > 1) sh.getRange(2, 1, ult - 1, COLUNAS.length).clear();
  if (!atividades.length) return;
  const nl = atividades.length, nc = COLUNAS.length;
  const formatos = atividades.map(() => COLUNAS.map(c => FORMATOS_COL[c[0]] || '@'));
  sh.getRange(2, 1, nl, nc).setNumberFormats(formatos);          // antes dos valores: o nº do processo fica como texto
  const valores = atividades.map(a => COLUNAS.map(([k]) => {
    if (SIM_NAO.indexOf(k) >= 0) return a[k] ? 'SIM' : '';
    if (k === 'data') return isoParaDate(a.data, TZ);
    if (k === 'n') return a.n === null || a.n === undefined ? '' : a.n;
    if (k === 'enviado_em' || k === 'atualizado') return a[k] || '';
    return a[k] === null || a[k] === undefined ? '' : a[k];
  }));
  sh.getRange(2, 1, nl, nc).setValues(valores);
  sh.getRange(2, 1, nl, nc).setBackgrounds(atividades.map(a => COLUNAS.map(() => a.revisar ? '#FFF2CC' : '#FFFFFF')));
}

const envioChave_ = (gkey, ger) => gkey + '#' + ger;
/** Grava (cria ou substitui) os registros de envio por gerência. envios: lista de objetos no formato de COL_ENVIOS. */
function salvarEnvios(ctrl, novos) {
  novos.forEach(e => { ctrl.envios[envioChave_(e.gkey, e.ger)] = e; });
  const sh = planilhaControle().getSheetByName('Envios por gerência'), lista = Object.keys(ctrl.envios).map(k => ctrl.envios[k]);
  lista.sort((a, b) => cmp(a.data || '', b.data || '') || cmp(norm(a.mun), norm(b.mun)) || cmp(a.ger, b.ger));
  const ult = sh.getLastRow();
  if (ult > 1) sh.getRange(2, 1, ult - 1, COL_ENVIOS.length).clear();
  if (!lista.length) return;
  const nl = lista.length, nc = COL_ENVIOS.length;
  sh.getRange(2, 1, nl, nc).setNumberFormats(lista.map(() => COL_ENVIOS.map(c => FORMATOS_ENVIOS[c[0]] || '@')));
  sh.getRange(2, 1, nl, nc).setValues(lista.map(e => COL_ENVIOS.map(([k]) => {
    if (k === 'data') return e.data ? isoParaDate(e.data, TZ) : '';
    if (k === 'n') return e.n === null || e.n === undefined ? '' : e.n;
    if (k === 'enviado_em') return e.enviado_em || '';
    return e[k] === null || e[k] === undefined ? '' : e[k];
  })));
}

function anexar_(nomeAba, linhas, formatos) {
  if (!linhas.length) return;
  const sh = planilhaControle().getSheetByName(nomeAba);
  const ini = sh.getLastRow() + 1;
  if (formatos) sh.getRange(ini, 1, linhas.length, linhas[0].length).setNumberFormats(linhas.map(() => formatos));
  sh.getRange(ini, 1, linhas.length, linhas[0].length).setValues(linhas);
}
function registrarMudancas(eventos) {
  const agora = new Date();
  anexar_('Mudanças do calendário', eventos.map(e => [agora, e[0], e[1], e[2] ? isoParaDate(e[2], TZ) : '', e[3]]),
          ['dd/MM/yyyy HH:mm', '@', '@', 'dd/MM/yyyy', '@']);
}
/** logs: [{origem, municipio, datas, n, destinatarios, status, remetente, link, obs, ger}] */
function registrarLog(logs) {
  const agora = new Date();
  anexar_('Log', logs.map(l => [agora, l.origem || '', l.municipio || '', l.datas || '', l.n === undefined ? '' : l.n,
                                l.destinatarios === undefined ? '' : l.destinatarios, l.status || '', l.remetente || '', l.link || '', l.obs || '', l.ger || '']),
          ['dd/MM/yyyy HH:mm', '@', '@', '@', '0', '0', '@', '@', '@', '@', '@']);
}
function salvarConfig(chave, valor) {
  garantirEstrutura();
  const sh = planilhaControle().getSheetByName('Configurações');
  const chaves = sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map(r => String(r[0]).trim());
  let linha = chaves.indexOf(chave) + 1;
  if (linha <= 0) { linha = sh.getLastRow() + 1; sh.getRange(linha, 1).setValue(chave); }
  sh.getRange(linha, 2).setNumberFormat('@').setValue(String(valor));
}

// ---------------------------------------------------------------- respostas do formulário
function abrirPlanilhaPorRef_(ref, rotulo) {
  const s = String(ref || '').trim();
  if (!s) throw new ErroDados(`${rotulo}: link não informado (aba Configurações).`);
  const m = /\/spreadsheets\/d\/([A-Za-z0-9_-]+)/.exec(s) || /^([A-Za-z0-9_-]{25,})$/.exec(s);
  if (!m) throw new ErroDados(`${rotulo}: não consegui entender o link/ID "${s.slice(0, 60)}".`);
  try { return SpreadsheetApp.openById(m[1]); }
  catch (e) { throw new ErroDados(`${rotulo}: esta conta não conseguiu abrir a planilha (${e.message}). Confira o compartilhamento.`); }
}

function lerTabelaRespostas(cfg) {
  const ss = abrirPlanilhaPorRef_(cfg.RESPOSTAS_PLANILHA, 'Respostas do formulário');
  const avisos = [];
  let sh = cfg.RESPOSTAS_ABA ? ss.getSheetByName(cfg.RESPOSTAS_ABA) : null;
  if (!sh) {
    if (cfg.RESPOSTAS_ABA) avisos.push(`Aba "${cfg.RESPOSTAS_ABA}" não encontrada na planilha de respostas; usando o GID/primeira aba.`);
    sh = ss.getSheets().filter(s => String(s.getSheetId()) === String(cfg.RESPOSTAS_GID))[0] || ss.getSheets()[0];
  }
  return { linhas: sh.getDataRange().getValues(), avisos, tz: ss.getSpreadsheetTimeZone() || TZ };
}

const REGRAS_COLUNAS = [
  ['carimbo', ['carimbo']], ['carimbo', ['hora de inicio']], ['municipio', ['nome do municipio']], ['data_apoio', ['data do apoio']],
  ['setor', ['unidade', 'setor']], ['esclareceu', ['esclareceu']], ['esclareceu', ['esclarecer']], ['formato', ['formato do apoio']],
  ['tempo', ['tempo de duracao']], ['explicar', ['forma de explicar']], ['geral', ['no geral']], ['comentario_geral', ['comentarios, elogios']]];
const OBRIGATORIOS = ['municipio', 'data_apoio', 'esclareceu', 'formato', 'tempo', 'explicar', 'geral'];
const ABERTAS = ['comentario_esclareceu', 'comentario_formato', 'comentario_explicar'];

/** Localiza cada pergunta pelo título. Devolve {mapa, avisos}. */
function mapearColunas(cabecalho) {
  const mapa = {}, avisos = [];
  let abertas = [];
  cabecalho.forEach((h, j) => {
    const t = norm(h);
    if (!t) return;
    if (t.indexOf('caso tenha respondido') >= 0 || t.indexOf('por gentileza') >= 0) { abertas.push(j); return; }
    for (const [campo, palavras] of REGRAS_COLUNAS) {
      if (!(campo in mapa) && palavras.every(p => t.indexOf(p) >= 0)) { mapa[campo] = j; break; }
    }
  });
  if (abertas.length >= 4) {      // ignora o comentário da pergunta que não entra no relatório ("atenção para ouvir as necessidades")
    let extra = abertas.find(j => norm(cabecalho[j]).indexOf('necessidades') >= 0);
    if (extra === undefined) extra = abertas[2];
    abertas = abertas.filter(j => j !== extra).slice(0, 3);
  }
  ABERTAS.forEach((campo, i) => { if (i < abertas.length) mapa[campo] = abertas[i]; });
  if (abertas.length < 3) avisos.push("Menos de 3 colunas de comentário 'Caso tenha respondido...' foram encontradas.");
  const faltando = OBRIGATORIOS.filter(c => !(c in mapa));
  if (faltando.length) throw new ErroDados('Não encontrei no formulário as colunas: ' + faltando.join(', ') + '. Confira os títulos das perguntas.');
  ['setor', 'carimbo'].forEach(o => { if (!(o in mapa)) avisos.push('Coluna opcional não encontrada: ' + o + '.'); });
  return { mapa, avisos };
}

/** Devolve {respostas, avisos}. data_apoio = ISO; carimbo = Date. */
function carregarRespostas(cfg) {
  const t = lerTabelaRespostas(cfg);
  let avisos = t.avisos.slice();
  if (!t.linhas.length) return { respostas: [], avisos };
  const mm = mapearColunas(t.linhas[0]);
  avisos = avisos.concat(mm.avisos);
  const mapa = mm.mapa, respostas = [];
  const cel = (row, campo) => { const j = mapa[campo]; return j === undefined || j >= row.length ? null : row[j]; };
  const txt = (row, campo) => { const v = cel(row, campo); return v === null || v === undefined ? '' : String(v).trim(); };
  t.linhas.slice(1).forEach(row => {
    const mun = txt(row, 'municipio');
    if (!mun) return;
    const r = { municipio: mun, data_apoio: paraIso(cel(row, 'data_apoio'), t.tz), carimbo: paraDataHora(cel(row, 'carimbo'), t.tz), setor: txt(row, 'setor') };
    ['esclareceu', 'formato', 'tempo', 'explicar', 'geral', 'comentario_esclareceu', 'comentario_formato', 'comentario_explicar', 'comentario_geral']
      .forEach(c => { r[c] = txt(row, c); });
    respostas.push(r);
  });
  return { respostas, avisos };
}

/** Respostas do município na data (ISO) e, opcionalmente, no dia seguinte (se não houver outra atividade nele). */
function selecionarRespostas(respostas, municipio, data, datasCadastradas, incluirSeguinte, campo) {
  const m = norm(municipio), seguinte = addDias(data, 1), exatas = [], segs = [];
  respostas.forEach(r => {
    if (norm(r.municipio) !== m) return;
    const d = campo === 'carimbo' ? (r.carimbo ? Utilities.formatDate(r.carimbo, TZ, 'yyyy-MM-dd') : null) : r.data_apoio;
    if (!d) return;
    if (d === data) exatas.push(r);
    else if (incluirSeguinte && d === seguinte && datasCadastradas.indexOf(seguinte) < 0) segs.push(r);
  });
  return { exatas, segs };
}


/**
 * Distribui as respostas pelas gerências participantes, usando a aba "Unidades x Gerências":
 *  - se a gerência primária da unidade participou, a resposta vai só para ela;
 *  - senão, se a secundária participou, vai só para ela;
 *  - senão (ou unidade fora da tabela), vai para TODAS as gerências participantes.
 * Devolve {porGer: {GER: [respostas]}, semUnidade: [unidades não encontradas na tabela]}.
 */
function atribuirPorGerencia(respostas, participantes, unidades) {
  const porGer = {}, semTabela = {};
  participantes.forEach(g => { porGer[g] = []; });
  respostas.forEach(r => {
    const u = unidades[norm(r.setor)];
    let alvo = null;
    if (u) alvo = participantes.indexOf(u.prim) >= 0 ? [u.prim] : participantes.indexOf(u.sec) >= 0 ? [u.sec] : null;
    else semTabela[r.setor || '(vazio)'] = true;
    (alvo || participantes).forEach(g => { porGer[g].push(r); });
  });
  return { porGer, semUnidade: Object.keys(semTabela) };
}
// ==================================================================== Relatorio.gs
/**
 * RELATÓRIO: contagens por pergunta e PDF (HTML convertido em PDF pelo Apps Script).
 * Gráficos são barras desenhadas com tabelas (funcionam bem na conversão para PDF).
 */
const COR_BARRA = '#2F5FA7', COR_TITULO = '#1F3864', COR_TEXTO = '#1F2937', COR_SUAVE = '#6B7280';
const ESCALA_SIM = ['Sim, totalmente', 'Parcialmente', 'Não atendeu'];
const ORDENS = {
  esclareceu: ESCALA_SIM, formato: ESCALA_SIM, tempo: ['Curto demais', 'Adequado', 'Longo demais'], explicar: ESCALA_SIM,
  geral: ['Excelente', 'Bom', 'Regular', 'Precisa melhorar'],
};
const CATEGORIAS = [   // [título, enunciado, campo fechado, campo do comentário]
  ['Esclarecimentos', 'O Apoio Técnico esclareceu o que o município precisava?', 'esclareceu', 'comentario_esclareceu'],
  ['Formato', 'O formato do Apoio Técnico atendeu as expectativas do município?', 'formato', 'comentario_formato'],
  ['Tempo de duração', 'Como você avalia o tempo de duração do Apoio Técnico?', 'tempo', null],
  ['Forma de explicar', 'A forma de explicar (exemplos, linguagem usada e material usado) auxiliou na compreensão?', 'explicar', 'comentario_explicar'],
];
const GERAL = ['Avaliação geral', 'No geral, como você avalia o Apoio Técnico recebido?', 'geral', 'comentario_geral'];

// ---------------------------------------------------------------- cálculo
function contar(respostas, campo) {
  const ordem = ORDENS[campo], porNorm = {}, c = {};
  ordem.forEach(o => { porNorm[norm(o)] = o; });
  respostas.forEach(r => {
    const v = r[campo] || '';
    if (!v) return;
    const k = porNorm[norm(v)] || 'Outras respostas';
    c[k] = (c[k] || 0) + 1;
  });
  const saida = ordem.map(o => [o, c[o] || 0]);
  if (c['Outras respostas']) saida.push(['Outras respostas', c['Outras respostas']]);
  return saida;
}
function comentarios(respostas, campoComentario, campoFechado) {
  const itens = [];
  respostas.forEach(r => { const t = (r[campoComentario] || '').trim(); if (t) itens.push([r[campoFechado] || '-', t]); });
  return itens;
}
function calcular(respostas) {
  const cont = {};
  respostas.forEach(r => { const s = r.setor || '(não informado)'; cont[s] = (cont[s] || 0) + 1; });
  const setores = Object.keys(cont).map(k => [k, cont[k]]).sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]));
  const blocos = CATEGORIAS.concat([GERAL]).map(([titulo, enunciado, campo, campoCom]) => ({
    titulo, enunciado, campo, contagem: contar(respostas, campo), comentarios: campoCom ? comentarios(respostas, campoCom, campo) : [] }));
  return { n: respostas.length, setores, blocos };
}

// ---------------------------------------------------------------- HTML
function barrasHtml(contagem) {
  const total = contagem.reduce((s, c) => s + c[1], 0), max = Math.max(1, ...contagem.map(c => c[1]));
  const linhas = contagem.map(([rot, n]) => {
    const pct = total ? Math.round(100 * n / total) : 0, w = n > 0 ? Math.max(3, Math.round(100 * n / max)) : 0;
    const barra = w ? `<table width="${w}%" cellpadding="0" cellspacing="0"><tr><td bgcolor="${COR_BARRA}" height="14" style="font-size:2px;line-height:2px">&nbsp;</td></tr></table>` : '&nbsp;';
    return `<tr><td width="34%" style="font-size:10px;padding:3px 8px 3px 0">${escHtml(rot)}</td><td width="48%">${barra}</td>` +
           `<td width="18%" style="font-size:10px;padding-left:6px">${n} (${pct}%)</td></tr>`;
  });
  return `<table width="100%" cellpadding="0" cellspacing="0">${linhas.join('')}</table>`;
}
function tabelaComentarios(itens) {
  const l = itens.map((i, k) => `<tr bgcolor="${k % 2 ? '#F3F4F6' : '#FFFFFF'}"><td valign="top" width="24%" style="font-size:9.5px">${escHtml(i[0])}</td>` +
    `<td valign="top" style="font-size:9.5px">${escHtml(i[1]).replace(/\n/g, '<br>')}</td></tr>`).join('');
  return `<table width="100%" border="1" cellspacing="0" cellpadding="4" style="border-color:#BFBFBF;border-collapse:collapse">` +
         `<tr bgcolor="${COR_TITULO}"><td style="color:#FFFFFF;font-size:9.5px"><b>Resposta</b></td><td style="color:#FFFFFF;font-size:9.5px"><b>Comentário</b></td></tr>${l}</table>`;
}
const h2_ = t => `<p style="font-size:13px;font-weight:bold;color:${COR_TITULO};margin:16px 0 4px 0">${escHtml(t)}</p>`;
const h3_ = t => `<p style="font-size:11px;font-weight:bold;color:${COR_TEXTO};margin:12px 0 2px 0">${escHtml(t)}</p>`;
const perg_ = t => `<p style="font-size:9.5px;color:${COR_SUAVE};margin:0 0 4px 0">${escHtml(t)}</p>`;

const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ehOficina_ = ctx => !!(ctx && ctx.tipo === 'Oficina');
/** Título de cada seção (uma por data). ctx = {tipo, oficina}. */
function tituloSecao_(s, secoes, ctx) {
  if (ehOficina_(ctx)) return 'Oficina de ' + fmtData(s.data);
  let t = 'Apoio Técnico de ' + fmtData(s.data);
  if (secoes.length > 1 && (s.modalidades || []).length) t += ' - ' + s.modalidades.join(' e ');
  return t;
}

/** secoes: [{data, respostas, modalidades}]; ctx = {tipo: 'ATM'|'Oficina', oficina} */
function htmlRelatorio(municipio, secoes, gerencias, geradoEm, ctx) {
  const datas = secoes.map(s => s.data);
  const modalidades = uniq([].concat(...secoes.map(s => s.modalidades || [])));
  const h = [];
  h.push(`<html><head><meta charset="utf-8"></head><body style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${COR_TEXTO}">`);
  if (ehOficina_(ctx)) {
    h.push(`<p style="font-size:16px;font-weight:bold;text-align:center;color:#000000;margin:6px 0 16px 0">RELATÓRIO DE AVALIAÇÃO DE OFICINA</p>`);
    h.push(`<p style="margin:2px 0"><b>Evento:</b> ${escHtml(ctx.oficina || '-')}</p>`);
    h.push(`<p style="font-size:14px;font-weight:bold;color:#000000;margin:0 0 6px 0">Município: ${escHtml(municipio)}</p>`);
    h.push(`<p style="margin:2px 0"><b>Data da Oficina:</b> ${escHtml(textoDatas(datas))}</p>`);
  } else {
    h.push(`<p style="font-size:16px;font-weight:bold;text-align:center;color:#000000;margin:6px 0 16px 0">RELATÓRIO DE AVALIAÇÕES DO APOIO TÉCNICO</p>`);
    h.push(`<p style="font-size:14px;font-weight:bold;color:#000000;margin:0 0 6px 0">Município: ${escHtml(municipio)}</p>`);
    h.push(`<p style="margin:2px 0"><b>Data do Apoio Técnico:</b> ${escHtml(textoDatas(datas))}</p>`);
    h.push(`<p style="margin:2px 0"><b>Modalidade:</b> ${escHtml(modalidades.join(' e ') || '-')}</p>`);
  }
  h.push(`<p style="margin:2px 0"><b>Gerências Participantes:</b> ${escHtml(gerencias.join(', ') || '-')}</p><hr>`);
  secoes.forEach((s, i) => {
    if (i > 0) h.push('<div style="page-break-before:always"></div>');
    const titulo = tituloSecao_(s, secoes, ctx);
    const r = s.respostas;
    if (!r.length) {
      h.push(h2_(titulo), `<p style="color:${COR_SUAVE}">Não houve avaliações recebidas para esta data.</p>`);
      return;
    }
    const c = calcular(r);
    h.push(h2_(`${titulo} (${c.n} ${c.n === 1 ? 'resposta' : 'respostas'})`));
    h.push(h3_('Distribuição por setor'), barrasHtml(c.setores));
    h.push(h2_('Avaliação por categoria'));
    c.blocos.forEach((b, k) => {
      const ultimo = k === c.blocos.length - 1;
      h.push(h3_(ultimo ? 'Avaliação geral' : b.titulo), perg_(b.enunciado), barrasHtml(b.contagem));
      if (b.comentarios.length) {
        h.push(h3_(ultimo ? `Comentários, elogios e sugestões (${b.comentarios.length})` : `Comentários (${b.comentarios.length})`), tabelaComentarios(b.comentarios));
      }
    });
  });
  h.push(`<p style="font-size:9px;color:${COR_SUAVE};text-align:right;margin:18px 0 6px 0">Gerado em ${escHtml(geradoEm)}  |  Avaliações anônimas</p>`);
  if (typeof LOGO_RODAPE_B64 !== 'undefined') h.push(`<img src="data:image/jpeg;base64,${LOGO_RODAPE_B64}" width="100%">`);
  h.push('</body></html>');
  return h.join('\n');
}

/** Alternativa simples (HTML -> PDF), usada se o modelo do Google Docs não estiver disponível. */
function gerarPdfHtml_(nomeArquivo, municipio, secoes, gerencias, ctx) {
  const html = htmlRelatorio(municipio, secoes, gerencias, Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm'), ctx);
  return Utilities.newBlob(html, 'text/html', nomeArquivo + '.html').getAs('application/pdf').setName(nomeArquivo + '.pdf');
}

// ---------------------------------------------------------------- PDF a partir do modelo do Google Docs
/**
 * Devolve {blob, docx, aviso}. Usa o modelo do Google Docs (MODELO_RELATORIO para ATM, MODELO_RELATORIO_OFICINA para oficina);
 * se não houver modelo ou der erro, usa o PDF simples (sem Word) e devolve um aviso explicando.
 * ctx = {tipo: 'ATM'|'Oficina', oficina}.
 */
function gerarPdfRelatorio(cfg, nomeArquivo, municipio, secoes, gerencias, ctx) {
  const ref = String((cfg && (ehOficina_(ctx) ? cfg.MODELO_RELATORIO_OFICINA : cfg.MODELO_RELATORIO)) || '').trim();
  if (ref) {
    try { const r = gerarPdfDocs_(ref, nomeArquivo, municipio, secoes, gerencias, ctx); return { blob: r.pdf, docx: r.docx, aviso: r.aviso }; }
    catch (e) { return { blob: gerarPdfHtml_(nomeArquivo, municipio, secoes, gerencias, ctx), docx: null, aviso: 'Modelo do Docs indisponível (' + e.message + '); usei o PDF simples, sem Word.' }; }
  }
  return { blob: gerarPdfHtml_(nomeArquivo, municipio, secoes, gerencias, ctx), docx: null, aviso: 'Sem modelo do Docs configurado: PDF simples, sem Word.' };
}

/** Exporta um Google Docs para Word (.docx). Pede o arquivo ao próprio Google com o token do script. */
function exportarDocx_(docId, nome) {
  const token = ScriptApp.getOAuthToken();
  const urls = ['https://docs.google.com/document/d/' + docId + '/export?format=docx',
                'https://www.googleapis.com/drive/v3/files/' + docId + '/export?mimeType=' + encodeURIComponent(MIME_DOCX)];
  let ultimo = '';
  for (let i = 0; i < urls.length; i++) {
    const r = UrlFetchApp.fetch(urls[i], { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
    if (r.getResponseCode() === 200) return r.getBlob().setContentType(MIME_DOCX).setName(nome + '.docx');
    ultimo = 'HTTP ' + r.getResponseCode();
  }
  throw new Error('exportação do Word falhou (' + ultimo + ')');
}

function idDocumento_(ref) {
  const m = /\/document\/d\/([A-Za-z0-9_-]+)/.exec(ref) || /^([A-Za-z0-9_-]{25,})$/.exec(ref);
  if (!m) throw new ErroDados('link do modelo não reconhecido');
  return m[1];
}

/**
 * Página (pontos): A4 = 595 x 842. As margens ficam acima/abaixo da arte do timbrado (rodapé começa ~107 pt da borda inferior).
 * As alturas são ESTIMATIVAS usadas só para decidir onde quebrar a página; se errarem, o texto apenas segue para a página seguinte.
 */
const PAG = { altura: 842, margemTopo: 100, margemBase: 125, folga: 15, cabecalhoModelo: 200, largura: 425 };
const UTIL_PAG = PAG.altura - PAG.margemTopo - PAG.margemBase - PAG.folga;     // altura útil por página

/** Tamanho (px) do gráfico, pensado para entrar a 425 pt de largura (escala ~0,76): fonte 14 px vira ~10,6 pt. */
function dimsGrafico_(n, horizontal) {
  return horizontal ? { larg: 560, alt: Math.min(760, Math.max(170, 46 * n + 30)) } : { larg: 560, alt: 270 };
}
function alturaPt_(d) { return Math.round(PAG.largura * d.alt / d.larg); }
function alturaTabela_(itens) {
  let h = 22;
  itens.forEach(i => { h += Math.max(1, Math.ceil(String(i[1]).length / 68)) * 11.5 + 10; });
  return h;
}

/** Gráfico de barras (imagem PNG) via serviço de gráficos do Google. */
function imagemGrafico_(contagem, horizontal) {
  const total = contagem.reduce((s, c) => s + c[1], 0), d = dimsGrafico_(contagem.length, horizontal);
  const t = Charts.newDataTable().addColumn(Charts.ColumnType.STRING, 'Resposta').addColumn(Charts.ColumnType.NUMBER, 'Respostas');
  contagem.forEach(c => t.addRow([`${c[0]} - ${c[1]} (${total ? Math.round(100 * c[1] / total) : 0}%)`, c[1]]));
  const b = (horizontal ? Charts.newBarChart() : Charts.newColumnChart()).setDataTable(t.build()).setDimensions(d.larg, d.alt)
    .setColors([COR_BARRA]).setLegendPosition(Charts.Position.NONE);
  const val = horizontal ? 'hAxis' : 'vAxis', cat = horizontal ? 'vAxis' : 'hAxis';
  b.setOption(val + '.minValue', 0).setOption(val + '.textPosition', 'none').setOption(val + '.gridlines.color', '#FFFFFF')   // eixo dos valores oculto: o rótulo já traz n e %
   .setOption(cat + '.textStyle.fontSize', 14).setOption('bar.groupWidth', '65%');
  if (horizontal) b.setOption('chartArea.left', 250).setOption('chartArea.width', '40%').setOption('chartArea.top', 8).setOption('chartArea.height', '92%');
  else b.setOption('chartArea.left', 10).setOption('chartArea.width', '96%').setOption('chartArea.top', 12).setOption('chartArea.height', '58%');
  return { blob: b.build().getBlob().setName('grafico.png'), largura: d.larg, altura: d.alt };
}

/** Gera o PDF copiando o modelo, trocando os marcadores e inserindo o conteúdo no lugar de {{CONTEUDO}}. */
function gerarPdfDocs_(ref, nomeArquivo, municipio, secoes, gerencias, ctx) {
  const modeloId = idDocumento_(ref);
  const copia = DriveApp.getFileById(modeloId).makeCopy('tmp_' + nomeArquivo);
  try {
    const doc = DocumentApp.openById(copia.getId()), body = doc.getBody();
    body.setMarginTop(PAG.margemTopo).setMarginBottom(PAG.margemBase);          // folga acima e, principalmente, abaixo (rodapé do timbrado)
    const datas = secoes.map(s => s.data), mods = uniq([].concat(...secoes.map(s => s.modalidades || [])));
    const valores = { MUNICIPIO: municipio, OFICINA: (ctx && ctx.oficina) || '', DATAS: textoDatas(datas), MODALIDADE: mods.join(' e ') || '-',
                      GERENCIAS: gerencias.join(', ') || '-', EMAIL: gerencias.join(', ') || '-',      // {{EMAIL}}: nome usado no modelo atual para "Gerências Participantes"
                      GERADO_EM: Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm') };
    const temModalidade = !!body.findText('\\{\\{MODALIDADE\\}\\}');
    const achouDatas = body.findText('\\{\\{DATAS\\}\\}');
    const parDatas = achouDatas ? achouDatas.getElement().getParent() : null;
    [body, doc.getHeader(), doc.getFooter()].forEach(parte => {
      if (parte) Object.keys(valores).forEach(k => parte.replaceText('\\{\\{' + k + '\\}\\}', valores[k]));
    });
    if (!temModalidade && parDatas && !ehOficina_(ctx)) {                           // modelo sem a linha "Modalidade": acrescenta logo abaixo das datas
      const p = body.insertParagraph(body.getChildIndex(parDatas) + 1, 'Modalidade: ' + valores.MODALIDADE);
      p.editAsText().setFontFamily('Arial').setFontSize(10).setBold(false);
      p.editAsText().setBold(0, 'Modalidade:'.length - 1, true);
      p.setSpacingBefore(0).setSpacingAfter(0);
    }
    const achou = body.findText('\\{\\{CONTEUDO\\}\\}');
    if (!achou) throw new ErroDados('o modelo não tem o marcador {{CONTEUDO}}');
    const ph = achou.getElement().getParent();
    if (ph.getType() !== DocumentApp.ElementType.PARAGRAPH) throw new ErroDados('{{CONTEUDO}} precisa estar num parágrafo comum');
    montarConteudoDocs_(body, ph.asParagraph(), secoes, ctx);
    doc.saveAndClose();
    const pdf = DriveApp.getFileById(copia.getId()).getAs('application/pdf').setName(nomeArquivo + '.pdf');
    let docx = null, aviso = '';
    try { docx = exportarDocx_(copia.getId(), nomeArquivo); }
    catch (e) { aviso = 'O PDF foi gerado, mas não consegui gerar o Word (' + e.message + ').'; }
    return { pdf, docx, aviso };
  } finally {
    try { copia.setTrashed(true); } catch (e) { /* ignora */ }
  }
}

const AZUL_DOC = '#1F3864', CINZA_DOC = '#6B7280';
function montarConteudoDocs_(body, ph, secoes, ctx) {
  const onde = () => body.getChildIndex(ph);                     // sempre insere logo antes do marcador
  let usado = PAG.cabecalhoModelo;                               // altura já ocupada na página atual (a 1ª tem o cabeçalho do modelo)
  const quebrarSe = h => { if (usado > 0 && usado + h > UTIL_PAG) { body.insertPageBreak(onde()); usado = 0; } };
  const par = (texto, o) => {
    o = o || {};
    const p = body.insertParagraph(onde(), texto || '');
    if (texto) p.editAsText().setFontFamily('Arial').setFontSize(o.tam || 10).setBold(!!o.neg).setItalic(false).setForegroundColor(o.cor || '#000000');
    p.setSpacingBefore(o.antes || 0).setSpacingAfter(o.depois === undefined ? 4 : o.depois);
    p.setAlignment(o.direita ? DocumentApp.HorizontalAlignment.RIGHT : DocumentApp.HorizontalAlignment.LEFT);
    return p;
  };
  const imagem = (contagem, horizontal) => {
    const g = imagemGrafico_(contagem, horizontal), p = par('', { depois: 2 });
    p.appendInlineImage(g.blob).setWidth(PAG.largura).setHeight(Math.round(PAG.largura * g.altura / g.largura));
  };
  const comentarios = itens => {
    const t = body.insertTable(onde(), [['Resposta', 'Comentário']].concat(itens.map(i => [i[0], i[1]])));
    t.setBorderColor('#BFBFBF').setBorderWidth(0.5).setColumnWidth(0, 96).setColumnWidth(1, 329);
    t.editAsText().setFontFamily('Arial').setFontSize(9).setBold(false).setForegroundColor('#000000');
    for (let r = 0; r < t.getNumRows(); r++) for (let c = 0; c < 2; c++) {
      const cel = t.getRow(r).getCell(c);
      if (r === 0) { cel.setBackgroundColor(AZUL_DOC); cel.editAsText().setBold(true).setForegroundColor('#FFFFFF'); }
      else cel.setBackgroundColor(r % 2 === 0 ? '#F3F4F6' : '#FFFFFF');
    }
    par('', { tam: 4, depois: 2 });
  };

  secoes.forEach((s, i) => {
    if (i > 0) { body.insertPageBreak(onde()); usado = 0; }       // cada data começa em página nova
    const r = s.respostas;
    const titulo = tituloSecao_(s, secoes, ctx);
    if (!r.length) {
      par(titulo, { tam: 13, neg: true, cor: AZUL_DOC, antes: 10, depois: 6 });
      par('Não houve avaliações recebidas para esta data.', { cor: CINZA_DOC });
      usado += 60;
      return;
    }
    const c = calcular(r);
    const hSetor = alturaPt_(dimsGrafico_(c.setores.length, true));
    quebrarSe(34 + 24 + hSetor);                                   // título + subtítulo + gráfico ficam juntos
    par(`${titulo} (${c.n} ${c.n === 1 ? 'resposta' : 'respostas'})`, { tam: 13, neg: true, cor: AZUL_DOC, antes: 10, depois: 6 });
    par('Distribuição por setor', { tam: 11, neg: true, antes: 6, depois: 2 });
    imagem(c.setores, true);
    usado += 34 + 24 + hSetor + 10;

    const hCat = alturaPt_(dimsGrafico_(4, false));
    c.blocos.forEach((b, k) => {
      const ultimo = k === c.blocos.length - 1;
      const fixo = 22 + 16 + hCat + 10;                            // título + enunciado + gráfico
      const tab = b.comentarios.length ? alturaTabela_(b.comentarios) : 0;
      const primeiraLinhas = b.comentarios.length ? 26 + Math.min(tab, 90) : 0;   // com comentários: gráfico + início da tabela na mesma página
      quebrarSe((k === 0 ? 38 : 0) + fixo + primeiraLinhas);
      if (k === 0) { par('Avaliação por categoria', { tam: 13, neg: true, cor: AZUL_DOC, antes: 6, depois: 4 }); usado += 38; }
      par(ultimo ? 'Avaliação geral' : b.titulo, { tam: 11, neg: true, antes: 8, depois: 1 });
      par(b.enunciado, { tam: 9, cor: CINZA_DOC, depois: 3 });
      imagem(b.contagem, false);
      usado += fixo;
      if (b.comentarios.length) {
        par(ultimo ? `Comentários, elogios e sugestões (${b.comentarios.length})` : `Comentários (${b.comentarios.length})`, { tam: 10, neg: true, antes: 4, depois: 3 });
        comentarios(b.comentarios);
        usado += 26 + tab;
        while (usado > UTIL_PAG) usado -= UTIL_PAG;                // a tabela pode atravessar páginas
      }
    });
  });
  par('Gerado em ' + Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm') + '  |  Avaliações anônimas', { tam: 8, cor: CINZA_DOC, antes: 10, direita: true });
  try { ph.removeFromParent(); } catch (e) { ph.clear(); }          // tira o marcador (se for o último parágrafo, só esvazia)
}

// ==================================================================== Fluxo.gs
/**
 * FLUXO: semana (calendário + respostas), revisão, preparo e envio de e-mails (manual) e envio automático.
 */
const ASSUNTO_RELATORIO_PADRAO = 'Relatório de Avaliações do Apoio Técnico - {{MUNICIPIO}} - {{GERENCIA}}';
const CORPO_RELATORIO_PADRAO = 'Prezados(as),\n\nSegue em anexo o relatório de avaliações do Apoio Técnico realizado em {{MUNICIPIO}} ({{DATA}}), referente à gerência {{GERENCIA}}.\n\nAtenciosamente.';
const ASSUNTO_SEM_PADRAO = 'Apoio Técnico - {{MUNICIPIO}} - {{GERENCIA}} - sem avaliações recebidas';
const CORPO_SEM_PADRAO = 'Prezados(as),\n\nInformamos que não foram recebidas avaliações do Apoio Técnico realizado em {{MUNICIPIO}} ({{DATA}}) para a gerência {{GERENCIA}}.\n\nAtenciosamente.';
const ASSUNTO_OFICINA_PADRAO = 'Relatório de Avaliação da Oficina - {{OFICINA}} - {{MUNICIPIO}} - {{GERENCIA}}';
const CORPO_OFICINA_PADRAO = 'Prezados(as),\n\nSegue em anexo o relatório de avaliação da oficina "{{OFICINA}}", realizada em {{MUNICIPIO}} ({{DATA}}), referente à gerência {{GERENCIA}}.\n\nAtenciosamente.';
const ASSUNTO_SEM_OFICINA = 'Oficina - {{OFICINA}} - {{MUNICIPIO}} - {{GERENCIA}} - sem avaliações recebidas';
const CORPO_SEM_OFICINA = 'Prezados(as),\n\nInformamos que não foram recebidas avaliações da oficina "{{OFICINA}}", realizada em {{MUNICIPIO}} ({{DATA}}), para a gerência {{GERENCIA}}.\n\nAtenciosamente.';
const NAO_ENVIADO = 'Não enviado';
const LIMITE_AUTO_MS = 4.5 * 60 * 1000;    // o Apps Script para a execução em 6 min: deixa folga e continua na próxima rodada
const GATILHO = 'gatilhoAutomatico';

function comTrava_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new ErroDados('Outra operação está em andamento. Tente de novo em instantes.');
  try { return fn(); } finally { lock.releaseLock(); }
}
const ativas = ctrl => ctrl.atividades.filter(a => a.situacao === 'Ativo');
const lista_ = t => String(t || '').split(/[;,]+/).map(s => s.trim()).filter(Boolean);
const simNao_ = v => norm(v) === 'sim';

// ---------------------------------------------------------------- agrupamento (mesmo município no mesmo dia = uma atividade)
/** Agrupa as linhas do calendário em atividades: ATM = município + data; oficina = município + data + nome da oficina. */
function agrupar(atividades) {
  const grupos = {};
  atividades.forEach(a => {
    const of = a.tipo === 'Oficina';
    const k = (of ? 'O|' : 'A|') + norm(a.mun) + '|' + a.data + (of ? '|' + norm(a.oficina) : '');
    const g = grupos[k] = grupos[k] || { tipo: of ? 'Oficina' : 'ATM', oficina: of ? a.oficina : '', municipio: a.mun, data: a.data, gerencias: [], modalidades: [], linhas: [] };
    g.gerencias = uniq(g.gerencias.concat(lista_(a.ger).map(normGer_)));
    if (a.modalidade) g.modalidades = uniq(g.modalidades.concat([a.modalidade]));
    g.linhas.push(a);
  });
  return Object.keys(grupos).map(k => {
    const g = grupos[k];
    g.nao_auto = g.linhas.some(a => a.nao_auto);
    g.gkey = gkeyDe_({ data: g.data, mun: g.municipio, tipo: g.tipo, oficina: g.oficina });
    g.pasta = g.linhas.map(a => a.link).filter(Boolean)[0] || '';
    return g;
  }).sort((a, b) => cmp(a.data, b.data) || cmp(norm(a.municipio), norm(b.municipio)) || cmp(norm(a.oficina), norm(b.oficina)));
}

/** Situação de envio de cada gerência participante da atividade (lida da aba "Envios por gerência"). */
function estadoGerencias_(g, ctrl) {
  const algum = g.gerencias.some(x => ctrl.envios[envioChave_(g.gkey, x)]);
  const legado = !algum ? g.linhas.filter(a => a.status === ENVIADO)[0] : null;      // envio feito antes desta versão (um relatório só)
  return g.gerencias.map(ger => {
    const e = ctrl.envios[envioChave_(g.gkey, ger)];
    if (e) return { ger, status: e.status, n: e.n, enviado_em: e.enviado_em, tipo_envio: e.tipo_envio, motivo: e.motivo, pdf: e.pdf, docx: e.docx };
    if (legado) return { ger, status: ENVIADO, n: legado.n, enviado_em: legado.enviado_em, tipo_envio: legado.tipo_envio || 'Anterior', motivo: '', pdf: legado.link, docx: '' };
    return { ger, status: '', n: null, enviado_em: null, tipo_envio: '', motivo: g.linhas.map(a => a.motivo).filter(Boolean)[0] || '', pdf: '', docx: '' };
  });
}
const feito_ = e => e.status === ENVIADO || e.status === SEM_AVALIACOES;

/** Resume nas linhas da aba Atividades o andamento dos envios da atividade (a aba Envios por gerência é a fonte). extra: {n, link}. */
function atualizarResumo_(ctrl, gkey, extra) {
  const g = agrupar(ativas(ctrl).filter(a => !a.revisar && gkeyDe_(a) === gkey))[0];
  if (!g) return;
  const est = estadoGerencias_(g, ctrl), feitos = est.filter(feito_);
  const status = !feitos.length ? '' : feitos.length === est.length ? (est.some(e => e.status === ENVIADO) ? ENVIADO : SEM_AVALIACOES) : PARCIAL;
  const datas = feitos.map(e => e.enviado_em).filter(Boolean);
  const ultimo = datas.length ? new Date(Math.max.apply(null, datas.map(d => d.getTime()))) : null;
  const motivos = est.filter(e => !feito_(e) && e.motivo).map(e => e.ger + ': ' + e.motivo).join(' | ');
  g.linhas.forEach(a => {
    Object.assign(a, { status, enviado_em: ultimo, tipo_envio: feitos.length ? feitos[feitos.length - 1].tipo_envio : '', motivo: motivos });
    if (extra && extra.n !== undefined && extra.n !== null) a.n = extra.n;
    if (extra && extra.link) a.link = extra.link;
  });
}

/** Respostas da atividade (município + data, e dia seguinte se aplicável) e sua distribuição entre as gerências participantes. */
function respostasDoGrupo_(ctrl, respostas, g, incluirSeguinte) {
  const cfg = ctrl.config, datasCad = datasPorMunicipio_(ctrl)[norm(g.municipio)] || [];
  const s = selecionarRespostas(respostas, g.municipio, g.data, datasCad, incluirSeguinte, cfg.CAMPO_DATA_BUSCA);
  const todas = s.exatas.concat(s.segs), at = atribuirPorGerencia(todas, g.gerencias, ctrl.unidades);
  return { todas, porGer: at.porGer, semUnidade: at.semUnidade };
}
function datasPorMunicipio_(ctrl) {
  const d = {};
  ativas(ctrl).forEach(a => { const k = norm(a.mun); d[k] = d[k] || []; if (d[k].indexOf(a.data) < 0) d[k].push(a.data); });
  return d;
}
function emailsDasGerencias(ctrl, nomes) {
  const emails = [], avisos = [];
  nomes.forEach(nome => {
    const g = ctrl.gerencias[nome];
    if (!g) avisos.push(`Gerência '${nome}' não está cadastrada na aba Gerências.`);
    else if (!g.ativa) avisos.push(`Gerência '${nome}' está marcada como inativa.`);
    else {
      const v = separarEmails(g.email).validos;
      if (!v.length) avisos.push(`Gerência '${nome}' está sem e-mail válido.`);
      v.forEach(e => { if (!emails.some(x => x.toLowerCase() === e.toLowerCase())) emails.push(e); });
    }
  });
  return { emails, avisos };
}

// ---------------------------------------------------------------- semana
function atualizarCalendario_(cfg, ctrl, ini, aceitar) {
  const ss = abrirPlanilhaPorRef_(cfg.CALENDARIO_URL, 'Calendário');
  const lerAba = nome => { const s = ss.getSheetByName(nome); return s ? s.getDataRange().getValues() : null; };
  const fim = addDias(ini, 4);
  const r = extrairCalendario(lerAba, ini, addDias(ini, 6), partesIso(ini).y);
  const avisos = r.avisos.slice();
  r.linhas.filter(l => diaSemana(l.data) >= 5).forEach(l => avisos.push(`ATM em fim de semana ignorado: ${l.mun} em ${fmtData(l.data)}.`));
  const linhas = r.linhas.filter(l => diaSemana(l.data) < 5);
  const eventos = mesclar(ctrl.atividades, linhas, ini, fim, new Date(), aceitar);
  const abortado = eventos.length > 0 && eventos[0][0] === 'ABORTADO';
  if (eventos.length && !abortado) { salvarAtividades(ctrl.atividades); registrarMudancas(eventos); }
  return { avisos, eventos, abortado };
}

/** Atualiza calendário e respostas (online) e devolve tudo que a tela da semana precisa. */
function carregarSemana(ini, aceitar) {
  return comTrava_(() => {
    const ctrl = lerControle(), cfg = ctrl.config, fim = addDias(ini, 4);
    const ctx = { ini, fim, erros: [], avisos: [], mudancas: [], abortado: false, respostas: null };
    try {
      const r = atualizarCalendario_(cfg, ctrl, ini, aceitar);
      ctx.avisos = ctx.avisos.concat(r.avisos);
      if (r.abortado) { ctx.abortado = true; ctx.erros.push(r.eventos[0][3]); } else ctx.mudancas = r.eventos;
    } catch (e) { ctx.erros.push(`Calendário online indisponível (${e.message}). Mostrando os últimos dados salvos.`); }
    try {
      const r = carregarRespostas(cfg);
      ctx.respostas = r.respostas;
      ctx.avisos = ctx.avisos.concat(r.avisos);
    } catch (e) { ctx.erros.push(`Respostas do formulário indisponíveis: ${e.message}`); }

    const ativ = ativas(ctrl);
    ctx.n_revisar = ativ.filter(a => a.revisar).length;
    ctx.n_revisar_semana = ativ.filter(a => a.revisar && a.data >= ini && a.data <= fim).length;
    ctx.grupos = agrupar(ativ.filter(a => !a.revisar && a.data >= ini && a.data <= fim));
    const inc = simNao_(cfg.INCLUIR_DIA_SEGUINTE), semUnidade = {};
    ctx.grupos.forEach(g => {
      g.total = null;
      const est = estadoGerencias_(g, ctrl);
      if (ctx.respostas) {
        const r = respostasDoGrupo_(ctrl, ctx.respostas, g, inc);
        g.total = r.todas.length;
        est.forEach(e => { e.nAtual = r.porGer[e.ger].length; });
        r.semUnidade.forEach(u => { semUnidade[u] = true; });
      }
      g.est = est;
      g.geral = ctrl.envios[envioChave_(g.gkey, GER_TODAS)] || null;     // envio do relatório geral (todas as gerências), se houver
    });
    ctx.semUnidade = Object.keys(semUnidade);
    ctx.itens_revisao = avisosDaSemana(cfg, ctrl, ctx);
    ctx.incluirSeguinte = inc;
    PropertiesService.getScriptProperties().setProperty('AVISOS_SEMANA', JSON.stringify({ ini, itens: ctx.itens_revisao }));
    return ctx;
  });
}

/** Itens só de leitura para a aba Revisão. */
function avisosDaSemana(cfg, ctrl, ctx) {
  const ini = ctx.ini, fim = ctx.fim, hoje = hojeIso(), inc = simNao_(cfg.INCLUIR_DIA_SEGUINTE), campo = cfg.CAMPO_DATA_BUSCA;
  const itens = ctx.avisos.map(a => ({ tipo: 'Calendário', municipio: '', data: null, detalhe: a }));
  (ctrl.avisosUnidades || []).forEach(a => itens.push({ tipo: 'Tabela de unidades', municipio: '', data: null, detalhe: a }));
  (ctx.semUnidade || []).forEach(u => itens.push({ tipo: 'Unidade fora da tabela', municipio: '', data: null,
    detalhe: `A unidade/setor '${u}' não está na aba "${ABA_UNIDADES}": essas respostas entram nos relatórios de todas as gerências participantes.` }));
  const cad = {};
  ativas(ctrl).forEach(a => { const k = norm(a.mun); cad[k] = cad[k] || {}; cad[k][a.data] = a; });
  const sem = {}, vistos = {};
  (ctx.respostas || []).forEach(r => {
    const d = campo === 'carimbo' ? (r.carimbo ? Utilities.formatDate(r.carimbo, TZ, 'yyyy-MM-dd') : null) : r.data_apoio;
    if (!d || d < ini || d > addDias(fim, 2)) return;
    const dias = cad[norm(r.municipio)] || {};
    const alvo = dias[d] || (inc && !dias[d] ? dias[addDias(d, -1)] : null);
    if (!alvo) {
      if (d < hoje) { const k = r.municipio + '|' + d; sem[k] = (sem[k] || 0) + 1; }
    } else if ((alvo.status === ENVIADO || alvo.status === PARCIAL) && alvo.enviado_em && r.carimbo && r.carimbo.getTime() > alvo.enviado_em.getTime()) {
      const k = alvo.chave + '|' + r.carimbo.getTime();
      if (!vistos[k]) {
        vistos[k] = true;
        itens.push({ tipo: 'Avaliação com atraso', municipio: alvo.mun, data: alvo.data,
                     detalhe: `Avaliação recebida em ${fmtHora(r.carimbo)}, depois do envio (${fmtHora(alvo.enviado_em)}).` });
      }
    }
  });
  Object.keys(sem).forEach(k => {
    const [mun, d] = k.split('|');
    itens.push({ tipo: 'Avaliação sem atividade', municipio: mun, data: d, detalhe: `${sem[k]} resposta(s) de ${mun} em ${fmtData(d)} sem atividade correspondente no calendário.` });
  });
  const porDia = {};
  ctx.grupos.forEach(g => { const k = norm(g.municipio) + '|' + g.data; (porDia[k] = porDia[k] || []).push(g); });
  Object.keys(porDia).filter(k => porDia[k].length > 1).forEach(k => {
    const gs = porDia[k];
    itens.push({ tipo: 'Mais de uma atividade no dia', municipio: gs[0].municipio, data: gs[0].data,
      detalhe: 'O formulário não diferencia ATM de oficina: as avaliações desse município e dia entram nos relatórios de todas as atividades (' + gs.map(g => g.tipo === 'Oficina' ? 'Oficina ' + g.oficina : 'ATM').join(', ') + ').' });
  });
  ctx.grupos.forEach(g => {
    const pend = g.est.filter(e => !feito_(e)).map(e => e.ger);
    if (pend.length) emailsDasGerencias(ctrl, pend).avisos.forEach(av => itens.push({ tipo: 'Gerência sem e-mail', municipio: g.municipio, data: g.data, detalhe: av }));
  });
  return itens;
}

// ---------------------------------------------------------------- revisão manual
function confirmarRevisao(chave, data, municipio, modalidade, gerencias, oficina) {
  const oficial = municipioOficial(municipio);
  if (!oficial) throw new ErroDados(`'${municipio}' não está na lista oficial de municípios de Pernambuco.`);
  if (!data || diaSemana(data) >= 5) throw new ErroDados('Informe uma data de segunda a sexta.');
  const ger = GERENCIAS_VALIDAS.filter(g => (gerencias || []).indexOf(g) >= 0);
  if (!ger.length) throw new ErroDados('Marque ao menos uma gerência.');
  return comTrava_(() => {
    const ctrl = lerControle(), a = ctrl.atividades.filter(x => x.chave === chave)[0];
    if (!a) throw new ErroDados('Atividade não encontrada (a planilha mudou?). Recarregue a página.');
    if (a.tipo === 'Oficina') {
      if (!String(oficina || '').trim()) throw new ErroDados('Informe o nome da oficina.');
      a.oficina = String(oficina).trim(); modalidade = '';
    } else if (MODALIDADES.indexOf(modalidade) < 0) throw new ErroDados('Escolha a modalidade (Presencial ou Remoto).');
    Object.assign(a, { data, mun: oficial, modalidade, ger: ger.join(', '), revisar: false, manual: true, motivo: '', atualizado: new Date() });
    salvarAtividades(ctrl.atividades);
    registrarMudancas([['CONFIRMADO', oficial, data, a.tipo === 'Oficina' ? `Oficina: ${a.oficina} — ${ger.join(', ')}` : `${ger.join(', ')} (${modalidade})`]]);
  });
}

function definirNaoAuto(gkeys, valor) {
  return comTrava_(() => {
    const ctrl = lerControle(), chaves = {};
    gkeys.forEach(k => { chaves[k] = true; });
    ativas(ctrl).forEach(a => { if (chaves[gkeyDe_(a)]) a.nao_auto = !!valor; });
    salvarAtividades(ctrl.atividades);
  });
}

// ---------------------------------------------------------------- PDF + e-mail
/** extra: {ger, oficina}. Marcadores: {{MUNICIPIO}}, {{DATA}}, {{GERENCIA}}, {{OFICINA}}. */
function preencher_(modelo, municipio, datas, extra) {
  extra = extra || {};
  if (extra.plural) modelo = modelo.replace(/à gerência \{\{GERENCIA\}\}/g, 'às gerências {{GERENCIA}}').replace(/a gerência \{\{GERENCIA\}\}/g, 'as gerências {{GERENCIA}}');
  return modelo.replace(/\{\{MUNICIPIO\}\}/g, municipio).replace(/\{\{DATA\}\}/g, textoDatas(datas))
    .replace(/\{\{GERENCIA\}\}/g, extra.ger || '').replace(/\{\{OFICINA\}\}/g, extra.oficina || '');
}

function pastaPdfs_() {
  const props = PropertiesService.getScriptProperties(), id = props.getProperty('PASTA_PDFS_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* pasta apagada: cria outra */ } }
  const pasta = DriveApp.createFolder('Relatórios ATM - PDFs');
  props.setProperty('PASTA_PDFS_ID', pasta.getId());
  return pasta;
}
/** Subpasta da atividade dentro de "Relatórios ATM - PDFs": guarda o PDF e o Word de cada gerência. */
function pastaAtividade_(g) {
  const raiz = pastaPdfs_();
  const nome = (g.data + ' - ' + g.municipio + (g.tipo === 'Oficina' ? ' - Oficina ' + g.oficina : '')).replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 120);
  const it = raiz.getFoldersByName(nome);
  let pasta = it.hasNext() ? it.next() : null;
  if (!pasta) {
    pasta = raiz.createFolder(nome);
    try { pasta.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* política do domínio pode bloquear */ }
  }
  return { pasta, url: pasta.getUrl() };
}
function salvarArquivo_(pasta, blob) {
  const antigos = pasta.getFilesByName(blob.getName());
  while (antigos.hasNext()) antigos.next().setTrashed(true);            // reenvio substitui o arquivo anterior
  const f = pasta.createFile(blob);
  try { f.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* política do domínio pode bloquear */ }
  return { id: f.getId(), url: f.getUrl() };
}
function nomeArquivo_(g, ger) {
  return 'Relatorio_' + (g.tipo === 'Oficina' ? 'Oficina_' + slug(g.oficina).slice(0, 40) + '_' : '') + slug(g.municipio) + '_' + g.data + '_' + (ger === GER_TODAS ? 'Geral' : ger);
}

/**
 * Calcula as avaliações de UMA gerência numa atividade e gera o PDF e o Word dela (sem enviar). gkey: data|município[|oficina].
 * Com ger = GER_TODAS gera o relatório geral: todas as avaliações da atividade, sem dividir por gerência, listando todas as participantes.
 */
function prepararEnvio(ctrl, respostas, gkey, ger, incluirSeguinte, semPdf) {
  const cfg = ctrl.config;
  const g = agrupar(ativas(ctrl).filter(a => !a.revisar && gkeyDe_(a) === gkey))[0];
  if (!g) throw new ErroDados('Atividade não encontrada. Recarregue a página da semana.');
  const geral = ger === GER_TODAS;
  if (!geral && g.gerencias.indexOf(ger) < 0) throw new ErroDados(`A gerência ${ger} não participa desta atividade.`);
  const r = respostasDoGrupo_(ctrl, respostas, g, incluirSeguinte), minhas = geral ? r.todas : r.porGer[ger];
  const gersRel = geral ? g.gerencias : [ger];                   // gerências que constam no relatório e que recebem o e-mail
  const ctxR = { tipo: g.tipo, oficina: g.oficina }, oficina = g.tipo === 'Oficina';
  const em = emailsDasGerencias(ctrl, gersRel);
  let pdf = null, docx = null, pastaUrl = '';
  const avisosPdf = [];
  if (minhas.length && !semPdf) {
    const gr = gerarPdfRelatorio(cfg, nomeArquivo_(g, ger), g.municipio, [{ data: g.data, respostas: minhas, modalidades: g.modalidades }], gersRel, ctxR);
    if (gr.aviso) avisosPdf.push(gr.aviso);
    const pa = pastaAtividade_(g);
    pdf = salvarArquivo_(pa.pasta, gr.blob);
    if (gr.docx) docx = salvarArquivo_(pa.pasta, gr.docx);
    pastaUrl = pa.url;
  }
  const conta = Session.getEffectiveUser().getEmail(), extra = { ger: gersRel.join(', '), oficina: g.oficina, plural: gersRel.length > 1 };
  const modelos = minhas.length
    ? (oficina ? [cfg.ASSUNTO_RELATORIO_OFICINA || ASSUNTO_OFICINA_PADRAO, cfg.CORPO_RELATORIO_OFICINA || CORPO_OFICINA_PADRAO]
               : [cfg.ASSUNTO_RELATORIO || ASSUNTO_RELATORIO_PADRAO, cfg.CORPO_RELATORIO || CORPO_RELATORIO_PADRAO])
    : (oficina ? [ASSUNTO_SEM_OFICINA, CORPO_SEM_OFICINA] : [cfg.ASSUNTO_SEM_RESPOSTAS || ASSUNTO_SEM_PADRAO, cfg.CORPO_SEM_RESPOSTAS || CORPO_SEM_PADRAO]);
  return {
    gkey, ger, geral, tipo: g.tipo, oficina: g.oficina, municipio: g.municipio, data: g.data, datas: [g.data], gerencias: gersRel, modalidades: g.modalidades,
    incluirSeguinte, total: minhas.length, totalAtividade: r.todas.length,
    pdfId: pdf ? pdf.id : '', pdfUrl: pdf ? pdf.url : '', docxUrl: docx ? docx.url : '', pastaUrl, avisos: em.avisos.concat(avisosPdf),
    remetente: cfg.REMETENTE || conta, nome: cfg.NOME_REMETENTE || 'NATM', para: cfg.EMAIL_PARA || conta, cc: '', cco: em.emails.join(', '),
    assunto: preencher_(modelos[0], g.municipio, [g.data], extra), corpo: preencher_(modelos[1], g.municipio, [g.data], extra),
  };
}

/** Envia pela conta preferida (REMETENTE) se estiver cadastrada em "Enviar e-mail como"; senão pela própria conta. */
function enviarEmail_(cfg, m) {
  const conta = Session.getEffectiveUser().getEmail(), pref = String(cfg.REMETENTE || '').trim();
  const opts = { name: m.nome || cfg.NOME_REMETENTE || 'NATM' };
  if (m.cc) opts.cc = m.cc;
  if (m.cco) opts.bcc = m.cco;
  if (m.pdfId) opts.attachments = [DriveApp.getFileById(m.pdfId).getBlob()];
  let usado = conta, nota = '';
  if (pref && pref.toLowerCase() !== conta.toLowerCase()) {
    if (GmailApp.getAliases().map(a => a.toLowerCase()).indexOf(pref.toLowerCase()) >= 0) { opts.from = pref; opts.replyTo = pref; usado = pref; }
    else nota = `Remetente ${pref} indisponível (não está em "Enviar e-mail como" no Gmail); enviado por ${conta}.`;
  }
  GmailApp.sendEmail(m.para || usado, m.assunto, m.corpo, opts);
  return { usado, nota };
}

function registrarEnvio_(ctrl, prep, tipo, nDest, usado, nota) {
  const agora = new Date();
  salvarEnvios(ctrl, [{ gkey: prep.gkey, data: prep.data, mun: prep.municipio, tipo: prep.tipo, oficina: prep.oficina || '', ger: prep.ger,
                        status: ENVIADO, n: prep.total, enviado_em: agora, tipo_envio: tipo, motivo: '', pdf: prep.pdfUrl || '', docx: prep.docxUrl || '' }]);
  atualizarResumo_(ctrl, prep.gkey, { n: prep.totalAtividade, link: prep.pastaUrl });
  salvarAtividades(ctrl.atividades);
  registrarLog([{ origem: tipo, municipio: prep.municipio + (prep.tipo === 'Oficina' ? ' (Oficina: ' + prep.oficina + ')' : ''), datas: fmtData(prep.data), n: prep.total,
                  destinatarios: nDest, status: ENVIADO, remetente: usado, link: prep.pdfUrl, obs: nota, ger: prep.ger === GER_TODAS ? 'Todas (relatório geral)' : prep.ger }]);
}

/** Envio manual: 'd' é o rascunho (editado na tela). */
function enviarManual(d) {
  return comTrava_(() => {
    const ctrl = lerControle(), cfg = ctrl.config;
    const para = separarEmails(d.para), cc = separarEmails(d.cc), cco = separarEmails(d.cco);
    const inval = para.invalidos.concat(cc.invalidos, cco.invalidos);
    if (inval.length) throw new ErroDados('E-mails inválidos: ' + inval.join(', '));
    if (!para.validos.length && !cco.validos.length) throw new ErroDados('Informe ao menos um destinatário.');
    if (d.pdfId) { try { DriveApp.getFileById(d.pdfId); } catch (e) { throw new ErroDados('O PDF não foi encontrado no Drive. Prepare o envio de novo.'); } }
    const r = enviarEmail_(cfg, { para: para.validos.join(','), cc: cc.validos.join(','), cco: cco.validos.join(','), assunto: d.assunto, corpo: d.corpo, pdfId: d.pdfId, nome: d.nome });
    let aviso = r.nota;
    try { registrarEnvio_(ctrl, d, 'Manual', para.validos.length + cc.validos.length + cco.validos.length, r.usado, r.nota); }
    catch (e) { aviso = (aviso ? aviso + ' ' : '') + `E-mail enviado, mas não foi possível atualizar a planilha: ${e.message}`; }
    return { ok: true, usado: r.usado, aviso };
  });
}

function criarRascunho(d) {
  const para = separarEmails(d.para).validos.join(','), cc = separarEmails(d.cc).validos.join(','), cco = separarEmails(d.cco).validos.join(',');
  const opts = { name: d.nome || 'NATM' };
  if (cc) opts.cc = cc;
  if (cco) opts.bcc = cco;
  if (d.pdfId) opts.attachments = [DriveApp.getFileById(d.pdfId).getBlob()];
  GmailApp.createDraft(para || Session.getEffectiveUser().getEmail(), d.assunto, d.corpo, opts);
  return { ok: true };
}

// ---------------------------------------------------------------- automático
/**
 * Trata as atividades (ATM e oficinas) do dia útil anterior (segunda trata as de sexta), uma gerência por vez.
 * Envia para a gerência só se: a atividade não está em revisão, não é "Não enviar automático", a gerência ainda não recebeu
 * e ela tem ao menos 1 avaliação atribuída e e-mail válido.
 * opts: {origem, simular, alvo}
 */
function rodarAutomatico_(opts) {
  return comTrava_(() => {
    const t0 = Date.now();
    const ctrl = lerControle(), cfg = ctrl.config, hoje = hojeIso(), alvo = opts.alvo || diaUtilAnterior(hoje);
    const teste = simNao_(cfg.MODO_TESTE), simular = !!opts.simular, origem = opts.origem || 'Automático';
    const res = { alvo, hoje, teste, simular, itens: [], erros: [], quando: Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm') };
    const ini = segundaDe(alvo);
    try {
      const r = atualizarCalendario_(cfg, ctrl, ini, false);
      if (r.abortado) res.erros.push(r.eventos[0][3]);
    } catch (e) { res.erros.push(`Calendário indisponível (${e.message}); usei os últimos dados salvos.`); }
    let respostas = null;
    try { respostas = carregarRespostas(cfg).respostas; }
    catch (e) { res.erros.push(`Respostas do formulário indisponíveis: ${e.message}. Nada foi enviado.`); }

    if (respostas) {
      const dodia = ativas(ctrl).filter(a => a.data === alvo), inc = simNao_(cfg.INCLUIR_DIA_SEGUINTE), gravar = !simular && !teste;
      const rotulo = (g, ger) => (g.tipo === 'Oficina' ? 'Oficina ' + g.oficina + ' — ' : '') + g.municipio + (ger ? ' · ' + ger : '');
      const registrar = (g, ger, campos) => {                       // grava o resultado da gerência (não grava em simulação nem em teste)
        if (!gravar) return;
        salvarEnvios(ctrl, [Object.assign({ gkey: g.gkey, data: g.data, mun: g.municipio, tipo: g.tipo, oficina: g.oficina, ger, n: null, enviado_em: null, tipo_envio: origem, motivo: '', pdf: '', docx: '' }, campos)]);
      };
      let esgotou = false;
      agrupar(dodia.filter(a => a.revisar)).forEach(g => {
        res.itens.push({ municipio: rotulo(g), decisao: 'ignorada', motivo: 'Em revisão (confirme na aba Revisão)' });
        if (!simular) g.linhas.forEach(a => { a.motivo = 'Aguardando revisão'; });
      });
      const grupos = agrupar(dodia.filter(a => !a.revisar));
      grupos.forEach(g => {
        if (g.nao_auto) { res.itens.push({ municipio: rotulo(g), decisao: 'ignorada', motivo: 'Marcada como "Não enviar automático"' }); return; }
        const r = respostasDoGrupo_(ctrl, respostas, g, inc);
        estadoGerencias_(g, ctrl).forEach(e => {
          const it = { municipio: rotulo(g, e.ger), modalidades: g.modalidades };
          res.itens.push(it);
          if (e.status === ENVIADO) { it.decisao = 'ja_enviada'; it.motivo = 'Já enviada'; return; }
          const minhas = r.porGer[e.ger] || [];
          if (!minhas.length) {
            it.decisao = 'sem_avaliacoes'; it.motivo = 'Nenhuma avaliação atribuída a esta gerência';
            registrar(g, e.ger, { status: SEM_AVALIACOES, n: 0, enviado_em: new Date() });
            return;
          }
          const em = emailsDasGerencias(ctrl, [e.ger]);
          if (!em.emails.length) {
            it.decisao = 'nao_enviada'; it.motivo = 'Gerência sem e-mail válido. ' + em.avisos.join(' ');
            registrar(g, e.ger, { status: NAO_ENVIADO, n: minhas.length, motivo: it.motivo });
            return;
          }
          it.total = minhas.length;
          if (simular) { it.decisao = 'enviaria'; it.motivo = `${minhas.length} avaliação(ões); CCO: ${em.emails.length} e-mail(s)`; return; }
          if (Date.now() - t0 > LIMITE_AUTO_MS) {
            esgotou = true; it.decisao = 'nao_enviada'; it.motivo = 'Tempo da execução esgotado; use "Executar agora" para continuar.';
            return;
          }
          try {
            const prep = prepararEnvio(ctrl, respostas, g.gkey, e.ger, inc, false);
            const m = { para: cfg.EMAIL_PARA, cco: em.emails.join(','), assunto: prep.assunto, corpo: prep.corpo, pdfId: prep.pdfId, nome: cfg.NOME_REMETENTE };
            if (teste) {
              m.para = cfg.EMAIL_TESTE || Session.getEffectiveUser().getEmail(); m.cco = ''; m.assunto = '[TESTE] ' + m.assunto;
              m.corpo = `(Teste: em envio real iria para ${cfg.EMAIL_PARA} com CCO para ${em.emails.join(', ')})\n\n` + m.corpo;
            }
            const rr = enviarEmail_(cfg, m);
            const obs = [rr.nota, em.avisos.join(' '), prep.avisos.filter(a => /Word|Modelo|modelo/.test(a)).join(' ')].filter(Boolean).join(' ');
            const nomeLog = g.municipio + (g.tipo === 'Oficina' ? ' (Oficina: ' + g.oficina + ')' : '');
            if (teste) {
              it.decisao = 'teste'; it.motivo = `Teste enviado para ${m.para}`;
              registrarLog([{ origem: 'Teste', municipio: nomeLog, datas: fmtData(g.data), n: minhas.length, destinatarios: 1, status: 'Teste', remetente: rr.usado, link: prep.pdfUrl, obs, ger: e.ger }]);
            } else {
              it.decisao = 'enviada'; it.motivo = em.avisos.join(' ');
              registrar(g, e.ger, { status: ENVIADO, n: minhas.length, enviado_em: new Date(), pdf: prep.pdfUrl, docx: prep.docxUrl });
              atualizarResumo_(ctrl, g.gkey, { n: prep.totalAtividade, link: prep.pastaUrl });
              salvarAtividades(ctrl.atividades);                    // grava a cada envio: se o tempo acabar, o que já foi feito fica registrado
              registrarLog([{ origem, municipio: nomeLog, datas: fmtData(g.data), n: minhas.length, destinatarios: em.emails.length + 1, status: ENVIADO, remetente: rr.usado, link: prep.pdfUrl, obs, ger: e.ger }]);
            }
          } catch (err) {
            it.decisao = 'falha'; it.motivo = 'Falha no envio: ' + err.message;
            registrar(g, e.ger, { status: NAO_ENVIADO, n: minhas.length, motivo: 'Falha no envio automático: ' + err.message });
            registrarLog([{ origem, municipio: g.municipio, datas: fmtData(g.data), status: 'Falha', obs: err.message, ger: e.ger }]);
          }
        });
        if (gravar) atualizarResumo_(ctrl, g.gkey);
      });
      if (esgotou) res.erros.push('O tempo da execução acabou antes de tratar todas as gerências. O que já foi enviado está registrado; use "Executar agora" para continuar.');
      if (!simular) salvarAtividades(ctrl.atividades);
    }
    if (!simular) PropertiesService.getScriptProperties().setProperty('ULTIMA_EXEC', JSON.stringify(res));
    return res;
  });
}

/** Função chamada pelo gatilho diário. */
function gatilhoAutomatico() {
  const cfg = lerControle().config;
  if (!simNao_(cfg.AUTOMATICO) || diaSemana(hojeIso()) >= 5) return;
  try { rodarAutomatico_({ origem: 'Automático' }); }
  catch (e) {
    PropertiesService.getScriptProperties().setProperty('ULTIMA_EXEC', JSON.stringify({ quando: fmtHora(new Date()), erros: [String(e.message || e)], itens: [] }));
    throw e;   // o Google avisa por e-mail que o gatilho falhou
  }
}

function criarGatilho_(hora, minuto) {
  removerGatilho_();
  ScriptApp.newTrigger(GATILHO).timeBased().everyDays(1).atHour(hora).nearMinute(minuto).inTimezone(TZ).create();
}
function removerGatilho_() { ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === GATILHO).forEach(t => ScriptApp.deleteTrigger(t)); }

function diagnosticoRemetente(cfg) {
  const conta = Session.getEffectiveUser().getEmail(), pref = String(cfg.REMETENTE || '').trim();
  let aliases = [];
  try { aliases = GmailApp.getAliases(); } catch (e) { /* sem permissão ainda */ }
  const disponivel = !pref || pref.toLowerCase() === conta.toLowerCase() || aliases.map(a => a.toLowerCase()).indexOf(pref.toLowerCase()) >= 0;
  return { conta, preferido: pref, aliases, disponivel,
           texto: disponivel ? `Os e-mails sairão de ${pref || conta}.` : `${pref} NÃO está em "Enviar e-mail como" no Gmail de ${conta}; os e-mails sairão de ${conta}.` };
}

function statusAutomatico() {
  const cfg = lerControle().config, props = PropertiesService.getScriptProperties();
  const gatilhos = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === GATILHO).length;
  let ultima = null;
  try { ultima = JSON.parse(props.getProperty('ULTIMA_EXEC') || 'null'); } catch (e) { /* ignora */ }
  return { ativo: simNao_(cfg.AUTOMATICO), gatilhos, hora: parseInt(cfg.HORA_AUTOMATICO, 10) || 17, minuto: parseInt(cfg.MINUTO_AUTOMATICO, 10) || 0,
           teste: simNao_(cfg.MODO_TESTE), emailTeste: cfg.EMAIL_TESTE || '', remetente: diagnosticoRemetente(cfg), ultima,
           alvoHoje: diaUtilAnterior(hojeIso()), para: cfg.EMAIL_PARA };
}

/** p: {ativo, hora, minuto, teste, emailTeste} */
function definirAutomatico(p) {
  const hora = Math.min(23, Math.max(0, parseInt(p.hora, 10) || 0)), minuto = Math.min(59, Math.max(0, parseInt(p.minuto, 10) || 0));
  if (p.emailTeste && separarEmails(p.emailTeste).invalidos.length) throw new ErroDados('E-mail de teste inválido.');
  salvarConfig('HORA_AUTOMATICO', hora); salvarConfig('MINUTO_AUTOMATICO', minuto);
  salvarConfig('MODO_TESTE', p.teste ? 'Sim' : 'Não'); salvarConfig('EMAIL_TESTE', p.emailTeste || '');
  salvarConfig('AUTOMATICO', p.ativo ? 'Sim' : 'Não');
  if (p.ativo) criarGatilho_(hora, minuto); else removerGatilho_();
}

// ==================================================================== Web.gs
/**
 * WEB: página (Index.html) e funções chamadas por ela (google.script.run). Cada apiXxx devolve {ok, dados} ou {ok:false, erro}.
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index').setTitle('Relatórios de Avaliação - ATM')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Menu na planilha de controle. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Relatórios ATM')
    .addItem('Abrir a página do sistema', 'abrirPagina')
    .addItem('Preparar/verificar abas', 'prepararAbas')
    .addToUi();
}
function abrirPagina() {
  const url = ScriptApp.getService().getUrl();
  const html = HtmlService.createHtmlOutput(url
    ? `<p style="font-family:Arial">Abra o sistema neste endereço:</p><p><a href="${url}" target="_blank">${url}</a></p>`
    : '<p style="font-family:Arial">Ainda não há implantação. Em Implantar > Nova implantação, escolha "App da Web".</p>').setWidth(520).setHeight(140);
  SpreadsheetApp.getUi().showModalDialog(html, 'Relatórios ATM');
}
function prepararAbas() { garantirEstrutura(); SpreadsheetApp.getUi().alert('Abas conferidas. Confira a aba Gerências (e-mails) e Configurações.'); }

function exigirAcesso_() {
  const permitidos = separarEmails(lerControle().config.USUARIOS_PERMITIDOS).validos.map(e => e.toLowerCase());
  if (!permitidos.length) return;
  const eu = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (permitidos.indexOf(eu) < 0) throw new ErroDados('Seu usuário não tem permissão para usar este sistema.');
}
function api_(fn) {
  try { exigirAcesso_(); return { ok: true, dados: fn() }; }
  catch (e) { return { ok: false, erro: e instanceof ErroDados ? e.message : 'Erro inesperado: ' + (e && e.message ? e.message : e) }; }
}
const dhCliente_ = d => (d ? fmtHora(d) : '');

// ---------------------------------------------------------------- semana
function apiSemana(semana, aceitar) {
  return api_(() => {
    const ini = segundaDe(/^\d{4}-\d{2}-\d{2}$/.test(semana || '') ? semana : hojeIso());
    const ctx = carregarSemana(ini, !!aceitar);
    return {
      ini: ctx.ini, fim: ctx.fim, hoje: hojeIso(), erros: ctx.erros, abortado: ctx.abortado, incluirSeguinte: ctx.incluirSeguinte,
      mudancas: ctx.mudancas.map(e => ({ evento: e[0], municipio: e[1], detalhe: e[3] })),
      n_revisar: ctx.n_revisar, n_revisar_semana: ctx.n_revisar_semana, n_avisos: ctx.itens_revisao.length,
      respostasOk: ctx.respostas !== null,
      grupos: ctx.grupos.map(g => ({
        gkey: g.gkey, tipo: g.tipo, oficina: g.oficina, municipio: g.municipio, data: g.data, dia: DIAS_SEMANA[diaSemana(g.data)],
        modalidades: g.modalidades, nao_auto: g.nao_auto, total: g.total, pasta: g.pasta,
        geral: g.geral ? { status: g.geral.status, enviado_em: dhCliente_(g.geral.enviado_em), tipo_envio: g.geral.tipo_envio, n: g.geral.n, pdf: g.geral.pdf, docx: g.geral.docx } : null,
        gerencias: g.est.map(e => ({ ger: e.ger, n: e.nAtual === undefined ? null : e.nAtual, status: e.status, enviado_em: dhCliente_(e.enviado_em),
                                      tipo_envio: e.tipo_envio, motivo: e.motivo, pdf: e.pdf, docx: e.docx })) })),
    };
  });
}
function apiNaoAuto(gkeys, valor) { return api_(() => { definirNaoAuto(gkeys, valor); return true; }); }

// ---------------------------------------------------------------- revisão
function apiRevisao() {
  return api_(() => {
    const ctrl = lerControle();
    const itens = ativas(ctrl).filter(a => a.revisar).sort((a, b) => cmp(a.data, b.data) || cmp(a.mun, b.mun))
      .map(a => ({ chave: a.chave, data: a.data, mun: a.mun, modalidade: a.modalidade, tipo: a.tipo, oficina: a.oficina, ger: lista_(a.ger.replace(/\s+/g, ',')), obs: a.obs, origem: a.origem, proc: a.proc }));
    let av = { ini: null, itens: [] };
    try { av = JSON.parse(PropertiesService.getScriptProperties().getProperty('AVISOS_SEMANA') || 'null') || av; } catch (e) { /* sem avisos */ }
    return { itens, municipios: listaMunicipios(), gerencias: GERENCIAS_VALIDAS, modalidades: MODALIDADES,
             avisos: av.itens.map(i => ({ tipo: i.tipo, municipio: i.municipio, data: i.data ? fmtData(i.data) : '', detalhe: i.detalhe })),
             semanaAvisos: av.ini ? fmtData(av.ini) : '' };
  });
}
function apiConfirmar(f) {
  return api_(() => { confirmarRevisao(f.chave, paraIso(f.data), f.municipio, f.modalidade, f.gerencias, f.oficina); return true; });
}

// ---------------------------------------------------------------- envio manual
/** Prepara o envio de UMA gerência numa atividade (gkey = data|município[|oficina]). */
function apiPreparar(gkey, ger, incluirSeguinte) {
  return api_(() => {
    if (!gkey || !ger) throw new ErroDados('Escolha a atividade e a gerência.');
    const ctrl = lerControle(), respostas = carregarRespostas(ctrl.config).respostas;
    const inc = incluirSeguinte === undefined || incluirSeguinte === null ? simNao_(ctrl.config.INCLUIR_DIA_SEGUINTE) : !!incluirSeguinte;
    return prepararEnvio(ctrl, respostas, gkey, ger, inc, false);
  });
}
function apiRegerar(d, incluirSeguinte) {
  return api_(() => {
    const ctrl = lerControle(), respostas = carregarRespostas(ctrl.config).respostas;
    const novo = prepararEnvio(ctrl, respostas, d.gkey, d.ger, !!incluirSeguinte, false);
    ['para', 'cc', 'cco'].forEach(k => { novo[k] = d[k]; });            // mantém o que foi editado
    if ((novo.total > 0) === (d.total > 0)) { novo.assunto = d.assunto; novo.corpo = d.corpo; }   // trocou relatório <-> aviso: usa o texto novo
    return novo;
  });
}
function apiEnviar(d) { return api_(() => enviarManual(d)); }
function apiRascunho(d) { return api_(() => criarRascunho(d)); }

// ---------------------------------------------------------------- automático
function apiAutomatico() { return api_(() => statusAutomatico()); }
function apiDefinirAutomatico(p) { return api_(() => { definirAutomatico(p); return statusAutomatico(); }); }
function apiSimular() { return api_(() => rodarAutomatico_({ simular: true, origem: 'Simulação' })); }
function apiExecutarAgora() { return api_(() => rodarAutomatico_({ origem: 'Automático (executar agora)' })); }