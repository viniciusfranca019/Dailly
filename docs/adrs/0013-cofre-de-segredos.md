# ADR 0013 — Cofre de segredos: cifrado no SQLite, aberto por senha + `.env`

- **Status:** Aceito
- **Data:** 2026-11-02
- **Decisores:** Vinicius
- **Relaciona:** emenda a [ADR 0004](0004-ai-providers-byok.md) (onde mora a
  chave de IA) · fecha a §2.2 da [auditoria](../auditoria-lacunas.md)
  (`SecretStore`) · usa a defesa de borda da [ADR 0012](0012-so-web.md) ·
  muda a execução da [ADR 0011](0011-requests-modulo-e-execucao.md) (o
  servidor passa a resolver segredos)

## Contexto

O Requests grava a request inteira em texto puro: um `Authorization: Bearer
sk_live_…`, um `-u user:senha` ou uma API key no corpo vão para o
`~/.config/dailly/dailly.sqlite` como estão. O `env` da tela é o único lugar
seguro hoje, porque nunca é gravado, e o preço é redigitar as chaves a cada
recarga.

Dois fatos tornam isso urgente. O autor vai migrar a coleção do Apidog, com
pastas fundas e ambientes cheios de chaves, e um importador gravaria todas em
texto puro. E a [ADR 0005](0005-backup-restore.md) prevê subir o `.sqlite` para
um provider de nuvem, que levaria as chaves junto.

A Fase 3 já pedia o mesmo mecanismo para a chave de IA. A ADR 0004 o resolvia
com o keychain do Tauri, que deixou de existir com a ADR 0008 e de novo com a
0012. A auditoria já tinha apontado o defeito: um mecanismo de SO no lugar de
uma decisão, sem port.

## Decisão

**Os valores secretos moram cifrados no próprio SQLite, atrás do port
`SecretStore`, e o cofre só abre com duas peças juntas: a senha que o autor
digita a cada sessão e a chave do `.env`.** Uma request guarda só o nome
(`{{stripe_key}}`); o valor fica no cofre.

### Contra o quê

| Quem tem | Abre? | Por quê |
|----------|-------|---------|
| Só o `.sqlite` (backup no Drive, arquivo enviado por engano) | não | faltam a senha e o `.env`; sem o `.env` nem dá para testar senhas offline |
| `.sqlite` + `.env` (o disco, pelo `\\wsl$` do Windows ou um backup da home) | não | falta a senha, que nunca vai a disco |
| `.sqlite` + senha | não | falta o `.env` |
| Malware rodando como o autor, com o cofre aberto | **sim** | a chave precisa estar em memória para executar; é o limite de qualquer cliente de API |

A última linha é o limite declarado, não uma lacuna: proteger contra um
processo do mesmo usuário com o cofre aberto exigiria isolamento que o
navegador e o Node não dão.

### As chaves

Três camadas, para que cada operação toque só o que precisa:

1. **Chave de dados (DEK):** 32 bytes aleatórios, gerados uma vez. Cifra cada
   valor.
2. **Chave da sessão (KEK):** derivada das duas peças juntas,
   `HKDF-SHA256(ikm = scrypt(senha, sal), salt = DAILLY_SECRET_KEY, info =
   "dailly/vault/kek/v1")`. Ela cifra a DEK, e a DEK cifrada fica no banco.
   Trocar a senha recifra só a DEK, não os segredos.
3. **Chave de recuperação:** 32 bytes aleatórios, mostrados **uma vez** na
   criação do cofre, em grupos legíveis, para o gerenciador de senhas do autor.
   Ela cifra uma segunda cópia da DEK, **sozinha**, sem `.env` e sem senha.
   Isso cobre "esqueci a senha" e "perdi o `.env`" sem enfraquecer o disco,
   porque a chave de recuperação nunca fica na máquina.

O `scrypt` endurece a senha, que um humano escolhe. O `DAILLY_SECRET_KEY`
(32 bytes, `openssl rand -base64 32`) já é aleatório e entra como *pepper*:
quem tem o backup e não tem o `.env` não consegue sequer calcular uma tentativa.
Os parâmetros do `scrypt` (`N = 2^17, r = 8, p = 1`, com `maxmem` acima dos
128 MB que isso pede) ficam gravados com o cofre, para poderem subir depois sem
quebrar o que existe.

Tudo pelo `node:crypto`: `scrypt`, `hkdf`, `randomBytes`, AES-256-GCM. Nenhuma
dependência nova.

### Os valores

Cada valor é cifrado com **AES-256-GCM**, com um nonce aleatório de 12 bytes a
cada gravação. O nome e o ambiente do segredo entram como dado autenticado
(`AAD = 'dailly/secret/v1:' + JSON.stringify([ambiente, nome])`), então copiar o
texto cifrado de uma linha para outra não decifra: a tag falha.

```sql
vault(id = 1, kdf JSON, salt, created_at)            -- parâmetros, uma linha
vault_slots(kind, wrapped_dek, nonce, tag)           -- 'sessao' | 'recuperacao'
secrets(environment, name, ciphertext, nonce, tag, updated_at,
        PRIMARY KEY (environment, name))
```

Não há hash da senha guardado. Uma senha errada é detectada porque a tag GCM da
DEK cifrada não fecha, e é isso que a tela diz.

### O ciclo de uma sessão

1. `make start` sobe a API com o cofre **trancado**: ela tem o `.env`, não tem a
   senha.
2. Na primeira vez que a tela precisa do cofre, ela pede a senha
   (`POST /vault/unlock`). Pela tela, e não pelo terminal, porque o `make start`
   roda a API e a UI em paralelo (`-j2`), e um prompt no meio dos dois logs se
   perde.
3. Aberto, a DEK vive só na memória do processo da API. Parar o servidor tranca;
   `POST /vault/lock` tranca na hora.
4. Sem `DAILLY_SECRET_KEY`, a API sobe igual e o cofre diz o que falta. A chave
   de recuperação abre e permite gravar um `.env` novo, com nova senha.

### O que a tela vê

O valor aparece **mascarado** (`sk_live_••••••`), com um botão de revelar e um
de copiar. Revelar é uma rota própria, `GET /secrets/:ambiente/:nome`, nunca
embutida na listagem (`GET /secrets` devolve só nomes e ambientes). Todas as
rotas do cofre respondem `Cache-Control: no-store` e passam pela defesa de Host e
Origin da ADR 0012.

O disco tem só texto cifrado, que é onde estão as ameaças que esta ADR cobre.
Mostrar o valor quando o autor pede é o que torna o cofre usável, porque é como
se confere se a chave colada é a certa.

### A execução

O servidor resolve `{{nome}}` sozinho, no ambiente da execução: o que veio no
`env` da tela vale primeiro (é a escolha do momento), e o cofre preenche o
resto. Uma variável que só o cofre tem, com o cofre trancado, recusa a
execução com o motivo dito (`423`, "cofre trancado", com os nomes). Ela nunca
sai para a rede com `{{nome}}` literal. Nenhuma mensagem de erro carrega um
valor.

### O que já foi gravado em texto puro

Apagar uma linha no SQLite deixa o conteúdo nas páginas livres e no WAL. A
conexão passa a rodar com `PRAGMA secure_delete = ON`, e a migração que mover
segredos de requests já gravadas termina com `wal_checkpoint(TRUNCATE)` e
`VACUUM`.

## Consequências

**Positivas**

- O backup da ADR 0005 pode subir o `.sqlite` sem levar segredo legível.
- O importador do Apidog grava nomes, nunca valores, e as requests migradas
  executam com o cofre aberto, sem redigitar nada.
- A chave de IA da Fase 3 usa o mesmo port e o mesmo cofre. O keychain do SO
  pode entrar depois como outro adapter, sem mudar o domínio.
- Nenhuma dependência nova: o driver SQLite fica o mesmo.

**Negativas / trade-offs**

- Uma senha por sessão. É o preço de proteger o disco local, e foi escolhido
  sabendo disso.
- Perder a senha **e** a chave de recuperação, ou o `.env` **e** a chave de
  recuperação, perde os valores. Requests e pastas continuam; só os segredos
  precisam ser recadastrados.
- O diário (entries) continua em texto puro. Cifrar o banco inteiro é outra
  decisão, com outro custo (ver SQLCipher abaixo).
- Os critérios escritos mudam: o "nunca aparece no SQLite" da Fase 3 e o
  "keychain do SO" do `mvp.md` passam a ser "nunca em texto puro, no SQLite nem
  em log".

## Alternativas consideradas

- **SQLCipher, o banco inteiro cifrado** (`better-sqlite3-multiple-ciphers`).
  Adiada: troca o driver nativo que tudo usa, e o problema de onde a chave mora
  continua o mesmo. Volta se o autor quiser o diário cifrado também.
- **Keychain do SO como primeiro adapter.** Rejeitada agora: no WSL depende de
  uma sessão D-Bus para o libsecret, que nem sempre existe, e repete o defeito
  que a auditoria apontou. Continua possível como adapter do port.
- **Só o `.env`.** Rejeitada: protege cópias do banco, mas o `\\wsl$` e um
  backup da home levam a chave junto com o cofre.
- **Só a senha.** Válida e mais simples. Perde para a combinação porque, sem o
  pepper, um backup vazado permite tentar senhas offline à vontade.
- **`.env` ou senha, qualquer uma abre** (dois slots, como no LUKS). Rejeitada:
  fica tão forte quanto a peça mais fraca, e a do `.env` está no disco.
- **A tela nunca vê o valor.** Rejeitada pelo autor: conferir a chave colada é
  parte do uso, e a ameaça coberta está no disco, não na tela.

## Emenda 1 (2026-11-02) — o AAD em JSON

A primeira redação dava o AAD como `dailly/secret/v1:<ambiente>:<nome>`. A
revisão da implementação mostrou a colisão: com `:` cru, `(a, "b:c")` e
`("a:b", c)` produziam o mesmo AAD, e um texto cifrado copiado entre as duas
linhas decifrava como o valor da outra. O AAD passou a ser
`'dailly/secret/v1:' + JSON.stringify([ambiente, nome])`, que não tem ambiguidade,
e a rota de gravar passou a validar o ambiente (`[A-Za-z0-9_.-]`) e o nome (sem
espaço nem chaves, para poder ser escrito como `{{nome}}`). Quem ler a tabela
`secrets` por outro caminho (backup, exportação, outro adapter) tem que usar
esta forma.
