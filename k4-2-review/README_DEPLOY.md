# Revisão do Gestor · Rodada 2 (K4.2)

Site estático: HTML, CSS e JavaScript puros. Sem build, sem Node, sem framework.
Esta pasta (`site/k4-2-review/`) é independente do portal anterior
(`site/k4-review/`), que não foi alterado.

**Estado: somente teste local.** Nada foi publicado, sincronizado ou enviado
(`git push`). Publicar é uma decisão separada, do responsável do projeto.

## O que o portal faz

- 23 perguntas, uma por vez, com barra de progresso, Voltar e autosave.
- 17 perguntas de comportamento, 4 confirmações rápidas de busca e 2 pendências
  da revisão anterior (Montagem do Trio Fechado).
- Não inclui dúvidas opcionais, nem as que a IA deve reler primeiro, nem lacunas
  de fonte. Só aparece, no resumo final, a contagem das opcionais.
- Cada tela tem o botão **VER TELA**: abre um modal com a captura sanitizada da
  tela (clique para ampliar, sem sair do modal), a representação esquemática
  (nomes de campos, botões, abas e colunas) e o resumo "O que a IA já sabe".
- **SYSCOM** no topo volta à Home sem apagar respostas; a Home oferece
  CONTINUAR REVISÃO quando há progresso salvo.

## Capturas de tela (`assets/screens/`)

São versões **sanitizadas** (PUBLIC_SAFE_PREVIEW), uma por tela, geradas por
`tools/review/build_k42_screen_previews.py` a partir das capturas já existentes.
O nome da empresa na barra de título (e no campo Empresa de uma tela) é coberto
por uma faixa cinza; o resto da imagem é idêntico ao original. O PNG é regravado
sem metadados. O arquivo original nunca é copiado.

Se uma captura não puder ser sanitizada com segurança, ela não é copiada: a tela
fica só com a representação esquemática e é registrada como
`SCREEN_PREVIEW_WITHHELD` (hoje: nenhuma). Antes de publicar, vale uma conferência
humana rápida das 18 imagens: a inspeção feita até aqui foi da IA.

## Como testar localmente

Na pasta `site/k4-2-review/`:

```
py -m http.server 8000
```

Abra `http://localhost:8000/`. Abrir o `index.html` por duplo clique costuma
falhar, porque o navegador bloqueia o `fetch()` de `data/review-data.json` em
`file://`. O portal mostra uma mensagem explicando isso.

## Autosave

As respostas ficam no `localStorage` do navegador, na chave
`syscom-human-review-k42-v1`. É uma chave nova: a revisão anterior (K4.1) não é
lida nem sobrescrita. "Recomeçar do zero" apaga só esta chave.

Para limpar manualmente: ferramentas do navegador, aba Application (ou
Armazenamento), Local Storage, remover `syscom-human-review-k42-v1`.

## Como as respostas funcionam

- Hipótese da IA: SIM, FUNCIONA ASSIM (detalhe opcional) / FUNCIONA DIFERENTE
  (explicação obrigatória) / NÃO SEI / NÃO SE APLICA.
- Pergunta aberta: SEI EXPLICAR (texto obrigatório) / NÃO SEI.
- Confirmação de busca: SIM, É A MESMA BUSCA / NÃO, ABRE OUTRA COISA (pede o
  destino correto) / NÃO SEI.
- Pendências da revisão anterior: SIM / NÃO / NÃO SEI, com texto obrigatório onde
  a resposta pede uma explicação.
- **Pular / Não sei** registra NÃO SEI quando a pergunta ainda não tem resposta
  completa. Se já tem, apenas avança.
- Resposta que pede explicação e ficou sem texto conta como pendência e **não é
  exportada**.

## Exportação

Botão **EXPORTAR REVISÃO** (resumo final) baixa `syscom-human-review-k42.json`,
schema `syscom-human-review-k42@1.0.0`. Também há "Copiar para a área de
transferência". Campos opcionais vazios não são exportados.

Revisor: `gestor_syscom` / `Gestor SYSCOM`, fixo no portal. É um papel; nenhum
nome pessoal é pedido nem gravado.

## O que NÃO está aqui

Sem screenshots originais, sem caminhos locais, sem identificação de empresas,
dados de clientes, credenciais ou arquivos internos. Os dados vêm de
`tools/review/build_k42_review_portal.py`, que lê só artefatos estruturados e o
manifesto interno dos previews (o caminho das capturas originais fica fora do site).

Para regenerar os dados: `py tools/review/build_k42_review_portal.py`.
Para conferir: `py tools/review/qa_k42_review_portal.py`.
