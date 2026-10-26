"""Atualiza o link/edição da projeção da CCEE em data/projecao.json.

O resumo em si é curado manualmente. Quando uma nova edição do Encontro do PLD
é publicada, este script atualiza apenas edicao, mes e url (e o fallback em
index.html), sinalizando que o resumo precisa ser revisado.

Requer um navegador "headful" (a CCEE bloqueia clientes automatizados/headless).
No GitHub Actions roda sob xvfb-run.

Uso local: python scripts/atualizar-projecao.py
"""

import json
import os
import re
import sys
from urllib.parse import unquote

from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JSON_PATH = os.path.join(RAIZ, "data", "projecao.json")
HTML_PATH = os.path.join(RAIZ, "index.html")
URL_PLD = "https://www.ccee.org.br/dados-e-analises/dados-pld"

MESES = {
    "janeiro": 1,
    "fevereiro": 2,
    "marco": 3,
    "março": 3,
    "abril": 4,
    "maio": 5,
    "junho": 6,
    "julho": 7,
    "agosto": 8,
    "setembro": 9,
    "outubro": 10,
    "novembro": 11,
    "dezembro": 12,
}

RE_EDICAO = re.compile(r"(\d+)\s*(?:º|°|o)\s*Encontro\s+do\s+PLD", re.IGNORECASE)
RE_MES = re.compile(
    r"Encontro\s+do\s+PLD\s*-\s*([A-Za-zÀ-ÿ]+)\s+de\s+(\d{4})\.pdf", re.IGNORECASE
)


def escrever_output(chave, valor):
    caminho = os.environ.get("GITHUB_OUTPUT")
    if not caminho:
        return
    with open(caminho, "a", encoding="utf-8") as f:
        f.write(f"{chave}={valor}\n")


def descobrir_ultima_edicao():
    with sync_playwright() as p:
        args = ["--disable-blink-features=AutomationControlled"]
        try:
            browser = p.chromium.launch(channel="chrome", headless=False, args=args)
        except Exception:
            browser = p.chromium.launch(headless=False, args=args)

        try:
            context = browser.new_context(
                locale="pt-BR",
                timezone_id="America/Sao_Paulo",
                viewport={"width": 1366, "height": 900},
            )
            context.add_init_script(
                "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
            )
            page = context.new_page()
            page.goto(URL_PLD, wait_until="domcontentloaded", timeout=90000)

            links = []
            for _ in range(3):
                page.wait_for_timeout(5000)
                html = page.content()
                if "Acesso bloqueado" in html or "access blocked" in html.lower():
                    raise RuntimeError(
                        "CCEE bloqueou o acesso (WAF). Rode em um navegador headful."
                    )
                links = page.eval_on_selector_all(
                    "a",
                    "els => els.map(a => ({h: a.href, t: (a.textContent || '').trim()}))",
                )
                if any("/documents/" in (l.get("h") or "") for l in links):
                    break

            candidatos = []
            for link in links:
                href = link.get("h") or ""
                if "/documents/" not in href:
                    continue
                texto = unquote(href)
                if "Encontro do PLD" not in texto:
                    continue
                edicao = RE_EDICAO.search(texto)
                if not edicao:
                    continue
                candidatos.append((int(edicao.group(1)), href))

            if not candidatos:
                raise RuntimeError(
                    "Link da apresentação do Encontro do PLD não encontrado na página."
                )

            numero, href = max(candidatos, key=lambda c: c[0])
            texto = unquote(href)
            mes = RE_MES.search(texto)
            if not mes or mes.group(1).lower() not in MESES:
                raise RuntimeError("Mês/ano da edição não identificado no link: " + texto)

            ano = int(mes.group(2))
            mes_iso = f"{ano}-{MESES[mes.group(1).lower()]:02d}"
            return f"{numero}º Encontro do PLD", mes_iso, href
        finally:
            browser.close()


def atualizar_fallback(dados):
    with open(HTML_PATH, encoding="utf-8", newline="") as f:
        html = f.read()

    padrao = re.compile(
        r'(<script type="application/json" id="projecao-fallback">)[\s\S]*?(</script>)'
    )
    if not padrao.search(html):
        raise RuntimeError("Fallback #projecao-fallback não encontrado em index.html")

    conteudo = json.dumps(dados, ensure_ascii=False, indent=2)
    novo = padrao.sub(
        lambda m: m.group(1) + "\n" + conteudo + "\n" + m.group(2), html, count=1
    )
    if novo != html:
        with open(HTML_PATH, "w", encoding="utf-8", newline="") as f:
            f.write(novo)


def main():
    atual = {}
    if os.path.exists(JSON_PATH):
        with open(JSON_PATH, encoding="utf-8") as f:
            atual = json.load(f)

    edicao, mes, url = descobrir_ultima_edicao()

    if (
        atual.get("edicao") == edicao
        and atual.get("mes") == mes
        and atual.get("url") == url
    ):
        print("Sem novidades: " + edicao)
        escrever_output("edicao", edicao)
        escrever_output("desatualizado", "0")
        return

    novo = dict(atual)
    novo["edicao"] = edicao
    novo["mes"] = mes
    novo["url"] = url
    novo.setdefault("pagina", 0)
    novo.setdefault("resumo", "")
    novo.setdefault("destaques", [])
    novo.setdefault("resumoEdicao", edicao)

    desatualizado = novo.get("resumoEdicao") != edicao

    with open(JSON_PATH, "w", encoding="utf-8", newline="\n") as f:
        json.dump(novo, f, ensure_ascii=False, indent=2)
        f.write("\n")

    atualizar_fallback(novo)

    print("Nova edição: " + edicao + " (" + mes + ")")
    print("URL: " + url)
    print("Resumo desatualizado: " + ("sim" if desatualizado else "não"))
    escrever_output("edicao", edicao)
    escrever_output("desatualizado", "1" if desatualizado else "0")


if __name__ == "__main__":
    try:
        main()
    except Exception as erro:
        print("Falha: " + str(erro), file=sys.stderr)
        sys.exit(1)
