# Plano de migração: MultiFit fora do Lovable

Documento compartilhado entre o **Construtor** (Claude Code), o **Revisor** (Codex) e o **humano**. Regras de cada agente: `CLAUDE.md` e `AGENTS.md`.

## Quadro de status

| Fase | Nome | Status | Branch | Review |
|---|---|---|---|---|
| 0 | Preparação e linha de base | 🟡 Aguardando review | `migracao/base` | — |
| 1 | Limpeza de build e configuração | ⚪ Não iniciada | | |
| 2 | Supabase local e projeto próprio | ⚪ Não iniciada | | |
| 3 | Autenticação sem Lovable | ⚪ Não iniciada | | |
| 4 | IA sem o gateway do Lovable | ⚪ Não iniciada | | |
| 5 | Documentação e preparação para o GitHub | ⚪ Não iniciada | | |
| 6 | Deploy remoto (opcional, só com o humano) | ⚪ Não iniciada | | |

Legenda: ⚪ não iniciada · 🔵 em andamento · 🟡 aguardando review / re-review · ❌ alterações necessárias · ✅ aprovada e mergeada

---

## Decisões do humano

Preencha antes da fase indicada. O Construtor **para** se encontrar uma decisão em branco.

| ID | Decisão | Opções | Resposta | Necessária na fase |
|---|---|---|---|---|
| D1 | Repositório no GitHub | (a) continuar em `blood-hidan/fit-ai`, desconectando o sync do Lovable antes do primeiro push; (b) criar um repositório novo | | 5 |
| D2 | Dados atuais (usuários, posts, fotos) | (a) começar do zero no Supabase novo; (b) tentar exportar do Lovable Cloud e importar | | 2 |
| D3 | Provedor de IA | (a) Google Gemini direto, o mesmo modelo usado hoje (`gemini-2.5-flash`), via endpoint compatível com OpenAI; (b) OpenAI; (c) Anthropic (Claude) | | 4 |
| D4 | Login com Google | (a) manter, criando credenciais OAuth próprias no Google Cloud; (b) desativar por enquanto e deixar só e-mail/senha | | 3 |
| D5 | Login Google no app nativo (Android/iOS) | (a) implementar deep link agora; (b) deixar no Backlog e funcionar só na web por enquanto | | 3 |
| D6 | Novo `appId` do Capacitor | ex.: `br.com.cesam.multifit`. **Atenção:** depois de publicado na Play Store, não pode mais mudar. | | 1 |
| D7 | Região do projeto Supabase novo | sugestão: `sa-east-1` (São Paulo) | | 2 |

---

## Fase 0 — Preparação e linha de base

**Objetivo:** ter um ponto de partida seguro e saber o que já estava quebrado antes da migração.

Tarefas:
1. Criar a branch `migracao/base` a partir da `main` atual.
2. Padronizar o gerenciador de pacotes no **npm**: rodar `npm install`, garantir que o `package-lock.json` está atualizado.
3. Rodar todas as validações do `CLAUDE.md` §6 e registrar o resultado **antes de qualquer mudança** na seção "Linha de base" do `HANDOFF.md` (erros de lint, testes e typecheck que já existem).
4. Confirmar o inventário de dependências do Lovable (`CLAUDE.md` §3) com `grep` e anotar qualquer novidade.

Critérios de aceite:
- [x] Linha de base registrada com a saída resumida de cada comando.
- [x] Inventário confirmado ou ampliado.
- [x] Nenhum arquivo de código alterado nesta fase.

## Fase 1 — Limpeza de build e configuração

**Objetivo:** remover tudo do Lovable que não depende de serviço externo.

Tarefas:
1. Remover o plugin `lovable-tagger` do `vite.config.ts` e do `package.json`.
2. Remover `src/pages/Index.tsx` (placeholder sem rota), depois de confirmar com `grep` que nada o importa.
3. `index.html`: trocar as meta tags `og:image`/`twitter:image` por uma imagem local em `public/` (ex.: `public/og-image.png`, gerada a partir do logo) e remover `twitter:site @Lovable`.
4. `capacitor.config.json`: remover o bloco `server` e trocar o `appId` pelo valor da decisão **D6**.
5. Remover `bun.lock` e `bun.lockb`, mantendo só `package-lock.json`.
6. `package.json`: trocar `"name"` para `multifit`.
7. `.gitignore`: adicionar `.env`, `.env.*`, com exceção de `!.env.example`, e também `supabase/.temp`, `supabase/functions/.env`, `android/`, `ios/` (só se o humano não quiser versionar as pastas nativas; pergunte).
8. Criar `.env.example` com as variáveis do front (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`) com placeholders.
9. Tirar o `.env` do índice do git (`git rm --cached .env`), mantendo o arquivo local.

Critérios de aceite:
- [ ] Build, lint, testes e typecheck no mesmo estado ou melhor que a linha de base.
- [ ] `grep -i lovable` só encontra os itens previstos para as Fases 2 a 5.
- [ ] O app abre com `npm run dev` e a navegação funciona igual.
- [ ] `.env` não está mais rastreado pelo git; `.env.example` existe.

## Fase 2 — Supabase local e projeto próprio

**Objetivo:** o banco, o storage e as funções rodam localmente com a Supabase CLI, e existe um projeto remoto pertencente ao humano.

Pré-requisitos (humano): Docker Desktop instalado; conta em supabase.com; decisões **D2** e **D7** preenchidas.

Tarefas:
1. Adicionar `supabase` (CLI) como devDependency e criar os scripts no `package.json`: `db:start`, `db:stop`, `db:reset`, `db:types` e `functions:serve`.
2. Revisar `supabase/config.toml`: o `project_id` antigo do Lovable sai e entra uma configuração local completa (`npx supabase init` em um diretório temporário pode servir de referência; **não sobrescrever** as migrations existentes).
3. Rodar `npx supabase start` e `npx supabase db reset` e confirmar que **todas** as migrations aplicam do zero, incluindo os buckets `community-media` e `avatars`. Se alguma migration depender de algo criado só no painel do Lovable Cloud, criar uma migration nova que corrija isso.
4. Criar `supabase/seed.sql` com dados mínimos de desenvolvimento (2 ou 3 usuários de teste com perfis, posts e follows), se for útil para testes manuais. Senhas de teste só valem localmente.
5. Regenerar `src/integrations/supabase/types.ts` com `npm run db:types` e conferir que o diff é vazio ou só cosmético.
6. Criar `.env.local.example` (ou documentar no README) apontando o front para o Supabase local (`http://127.0.0.1:54321` e a anon key exibida pelo `supabase start`).
7. Remover o comentário "auto-generated by Lovable" de `src/integrations/supabase/client.ts`, se houver, e garantir que o client lê só variáveis de ambiente.
8. **Se D2 = (b):** escrever em `docs/migracao/DADOS.md` um procedimento de exportação e importação (usuários do `auth`, tabelas públicas, arquivos do storage), **sem executá-lo**. Quem executa é o humano.

Critérios de aceite:
- [ ] `npm run db:reset` termina sem erro em um ambiente limpo.
- [ ] Com `npm run dev` apontando para o Supabase local, é possível criar conta com e-mail/senha, editar perfil, postar com foto, seguir, mandar mensagem e registrar corrida.
- [ ] `types.ts` regenerado pela CLI.
- [ ] Nenhuma referência ao projeto `hvikgsaecnkvizcclynj` no código.

## Fase 3 — Autenticação sem Lovable

**Objetivo:** remover `@lovable.dev/cloud-auth-js` e usar só o Supabase Auth.

Pré-requisitos: decisões **D4** e **D5**. Se D4 = (a), o humano cria um OAuth Client no Google Cloud Console e informa o Client ID (o Client Secret vai **só** para `supabase/.env` local e para o painel do Supabase, nunca para o repositório).

Tarefas:
1. **Se D4 = (a):** substituir `lovable.auth.signInWithOAuth("google", ...)` em `AuthPage.tsx` por `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } })`. Configurar `[auth.external.google]` no `config.toml` usando `env(...)` para os segredos e definir `site_url` e `additional_redirect_urls` locais.
2. **Se D4 = (b):** esconder o botão do Google na `AuthPage` sem quebrar o layout e registrar a pendência no Backlog.
3. Apagar `src/integrations/lovable/` e remover `@lovable.dev/cloud-auth-js` do `package.json`.
4. **Se D5 = (a):** implementar o fluxo nativo (custom URL scheme + `@capacitor/app` `appUrlOpen` + `supabase.auth.exchangeCodeForSession`/`setSession`) e registrar o scheme no Android/iOS. **Se D5 = (b):** no app nativo, esconder o botão do Google ou mostrar uma mensagem clara, e anotar no Backlog.
5. Conferir se `src/lib/auth-persistence.ts` ("manter conectado") continua funcionando.

Critérios de aceite:
- [ ] Login com e-mail/senha, logout e "manter conectado" funcionam localmente.
- [ ] Login com Google funciona na web local (se D4 = a) ou está oculto de forma limpa (se D4 = b).
- [ ] Nenhum segredo de OAuth no repositório.
- [ ] `grep -i lovable src/` não retorna nada.

## Fase 4 — IA sem o gateway do Lovable

**Objetivo:** as funções `chat-fitness` e `generate-nutrition` passam a chamar um provedor de IA com chave própria.

Pré-requisito: decisão **D3** e a chave de API do humano colocada em `supabase/functions/.env` (arquivo ignorado pelo git).

Tarefas:
1. Criar `supabase/functions/_shared/ai.ts` com uma função única de chamada ao provedor, configurada por variáveis de ambiente (`AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL`). As duas funções passam a usar esse módulo.
2. **Manter o formato da resposta:** o `ChatPage.tsx` lê SSE no formato OpenAI (`data: {...choices[0].delta.content}`). Se o provedor escolhido não usar esse formato, o `_shared/ai.ts` converte o stream, e o front não muda. Para Gemini, verificar na documentação oficial o endpoint compatível com OpenAI antes de implementar.
3. Criar `supabase/functions/_shared/cors.ts` e reaproveitar nas duas funções.
4. **Segurança (estas funções já estão sendo reescritas):**
   - validar o usuário autenticado via header `Authorization` (`supabase.auth.getUser()` no servidor) e devolver 401 se não houver usuário;
   - aceitar do cliente só mensagens com `role` `user` ou `assistant`, descartando `system`;
   - limitar a quantidade de mensagens e o tamanho do texto, devolvendo 400 se passar do limite;
   - ler o perfil do usuário no servidor em vez de confiar no `profile` enviado pelo cliente, se isso não mudar o comportamento.
5. Manter as mensagens de erro em português e os status 429 e 402 equivalentes (mapear os erros do provedor novo).
6. Criar `supabase/functions/.env.example` com os nomes das variáveis.

Critérios de aceite:
- [ ] Com `npm run functions:serve`, o chat responde com streaming no app local e a geração de plano nutricional funciona.
- [ ] Sem login, as funções retornam 401.
- [ ] Mensagem com `role: "system"` enviada pelo cliente é ignorada ou rejeitada.
- [ ] Nenhuma referência a `ai.gateway.lovable.dev` ou `LOVABLE_API_KEY`.

## Fase 5 — Documentação e preparação para o GitHub

**Objetivo:** qualquer pessoa clona o repositório, segue o README e roda o projeto, e nada sensível vai para o GitHub.

Tarefas:
1. Reescrever o `README.md`: o que é o projeto, stack, pré-requisitos (Node, Docker, Supabase CLI), passo a passo para rodar localmente, variáveis de ambiente, scripts, estrutura de pastas e créditos (Escola Cesam).
2. Reescrever o `APK_BUILD_GUIDE.md` sem citar o Lovable, usando o novo `appId` e o build de produção.
3. Verificação final:
   - `grep -rni lovable` (fora de `docs/` e `node_modules`) retorna **zero**;
   - procurar segredos no repositório e no histórico (`git log -p | grep -niE "api_key|secret|service_role"`);
   - observação: o `.env` antigo com a chave pública do projeto Lovable já está no histórico do git. Essa chave é publicável e o projeto antigo será abandonado, então não precisa reescrever o histórico. Registre isso no handoff para o humano saber.
4. Preparar a publicação conforme **D1**, deixando os comandos documentados para o humano executar (o Construtor **não** faz push). Se D1 = (a), lembrar o humano de desconectar a integração GitHub do Lovable **antes** do primeiro push, para o Lovable não sobrescrever as mudanças.

Critérios de aceite:
- [ ] Clone limpo + README = projeto rodando localmente (o Revisor testa seguindo só o README).
- [ ] Zero referências ao Lovable fora de `docs/migracao/`.
- [ ] Nenhum segredo no repositório.

## Fase 6 — Deploy remoto (opcional, executada pelo humano)

O Construtor só **documenta** os comandos; o humano executa:
```bash
npx supabase login
npx supabase link --project-ref <ref-do-projeto-novo>
npx supabase db push
npx supabase secrets set AI_API_KEY=... AI_MODEL=... AI_BASE_URL=...
npx supabase functions deploy chat-fitness
npx supabase functions deploy generate-nutrition
```
Depois: configurar Auth (Site URL, Redirect URLs, provedor Google) no painel, atualizar o `.env` local com a URL e a chave públicas do projeto novo e gerar o build do app.

---

## Backlog (fora do escopo da migração)

Itens encontrados no caminho que **não** devem ser misturados com a migração:

1. **Privacidade dos perfis (prioridade alta):** a política `"Profiles are viewable by everyone"` expõe idade, peso, altura, alergias e restrições alimentares de todos os usuários. Separar os dados públicos dos privados (tabela ou view) com RLS adequada. Importante por causa da LGPD.
2. Política de inserção em `notifications` permite que um usuário crie notificações para qualquer outro.
3. `multifit-logo.png` (~800 KB) duplicado em `public/` e `src/assets/`: comprimir e manter uma cópia só.
4. `public/sw.js`: revisar a estratégia de cache para não servir versão velha depois de um deploy.
5. Login Google nativo (se D5 = b).
6. Bundle JS principal com ~1,13 MB (334 KB gzip): avaliar code-splitting por rota (`React.lazy`).
7. `npm audit` aponta 43 vulnerabilidades (5 críticas, 30 altas): avaliar `npm audit fix` sem `--force` em uma branch separada.
8. Dívida de lint pré-existente (19 erros, 23 avisos; ver `HANDOFF.md` → Linha de base).
