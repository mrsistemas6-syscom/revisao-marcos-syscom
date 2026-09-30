# Publicar no GitHub Pages

Este diretório (`site/k4-review/`) é um site estático completo: HTML, CSS e
JavaScript puro. Sem build, sem Node, sem framework. Abre direto pelo
`index.html` ou serve por qualquer servidor estático.

## O que este site contém

- Visão geral do lote canário K4.0 (20 telas)
- Padrões candidatos observados
- Revisão humana focada das 4 telas selecionadas (32 perguntas)
- Modo Chefe e demonstração guiada

Nenhuma captura de tela (screenshot) foi incluída. Toda representação de tela
é gerada a partir dos dados estruturados (`data/review-data.json`), em
HTML/CSS puro.

## Publicar via GitHub Pages (Actions)

O workflow em `.github/workflows/deploy-k4-review-pages.yml` já está
preparado para publicar **somente** esta pasta. Ele não foi executado nem
disparado — publicação é uma decisão separada, tomada pelo responsável do
projeto.

Para publicar quando for autorizado:

1. Confirmar que o repositório tem GitHub Pages habilitado com fonte
   "GitHub Actions" (Settings → Pages → Build and deployment → Source).
2. Fazer merge/push do workflow para o branch padrão (`main` ou `master`,
   conforme configurado no arquivo).
3. O workflow builda um artefato só com o conteúdo de `site/k4-review/` e
   publica via `actions/deploy-pages`. Nenhum outro diretório do repositório
   (`docs/`, `inputs/`, `data/`, `output/`) entra no artefato.
4. A URL final segue o padrão `https://<usuario>.github.io/<repositorio>/`.

## Publicar manualmente, sem Actions

Também funciona copiar o conteúdo de `site/k4-review/` para qualquer
hospedagem de arquivo estático (branch `gh-pages`, Netlify, servidor interno,
etc.). Não há dependência de build: os três arquivos em `assets/` e o JSON em
`data/` já estão prontos para uso.

Para testar localmente antes de publicar:

```
py -m http.server 8000
```

E abrir `http://localhost:8000/` na pasta `site/k4-review/`. Abrir o
`index.html` direto por duplo clique (`file://`) também funciona na maioria
dos navegadores modernos; alguns bloqueiam o `fetch()` local de
`data/review-data.json` sob `file://` por política de CORS — nesse caso, use
o servidor local acima.

## O que este README não faz

Não publica nada. Não executa `git push`. Não altera configuração do
repositório. A decisão de publicar é humana e feita fora desta sessão.
