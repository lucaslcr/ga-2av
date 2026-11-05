# Geometria Analítica · 2ª AV

Site de estudo para a 2ª AV de Geometria Analítica e Álgebra Linear (FACAPE, Profa. Vânia Lasalvia).
O progresso fica no navegador e, para quem cria uma conta (usuário + PIN de 4 números), também no banco D1 da Cloudflare. Assim ele aparece em qualquer aparelho.

## Estrutura

| Caminho | O que é |
|---|---|
| `public/index.html` | O site publicado. É gerado pelo `build.py`, não edite à mão. |
| `functions/api/[[path]].js` | API do Cloudflare Pages: `/api/check`, `/api/register`, `/api/login`, `/api/progress`, `/api/logout`. |
| `schema.sql` | Tabelas do banco D1 (`users` e `sessions`). |
| `src/ga-2av.html` | Fonte do site (o mesmo arquivo do artefato). |
| `src/sync.js`, `src/sync.css` | Tela de conta e sincronização, injetadas no build. |
| `build.py` | Gera `public/index.html` a partir de `src/`. |

## Configurar na Cloudflare (uma vez)

1. **Criar o banco.** No painel, vá em **Storage & Databases → D1 SQL Database → Create**. Use o nome `ga-2av`. As tabelas são criadas sozinhas no primeiro acesso, e o `schema.sql` fica só como referência.
2. **Ligar o repositório.** Vá em **Workers & Pages → Create → Pages → Connect to Git** e escolha este repositório.
   - Framework preset: **None**
   - Build command: deixe vazio
   - Build output directory: `public`
3. **Ligar o banco ao site.** No projeto do Pages, vá em **Settings → Bindings → Add → D1 database**.
   - Variable name: `DB`
   - Database: `ga-2av`
   - Faça isso em **Production**, e também em **Preview** se for usar.
4. **Publicar de novo.** Em **Deployments**, no último deploy, clique em **⋯ → Retry deployment** para o binding valer.

Depois disso, todo push na branch principal publica sozinho.

## Atualizar o conteúdo

```bash
cp caminho/do/artefato/ga-2av.html src/ga-2av.html
python3 build.py
git add -A && git commit -m "Atualiza conteúdo" && git push
```

## Testar localmente

```bash
npx wrangler pages dev public --d1 DB=ga-2av
```

## Segurança

- O PIN é guardado com PBKDF2 (100 mil iterações, sal por usuário). Ele nunca fica no banco em texto.
- Depois de 5 PINs errados, a conta fica bloqueada por 15 minutos.
- A sessão é um token aleatório guardado no navegador. No banco fica só o hash dele.
- Dá para ver nome, usuário e progresso no banco. Não há e-mail nem outros dados pessoais.
