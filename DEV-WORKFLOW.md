# 🛠️ Guia Operacional — Gabinete Virtual

> **Para quem:** Desenvolvedor e Curador do projeto.  
> **Objetivo:** Evitar conflitos entre o sync automático do totem e o trabalho de desenvolvimento/curadoria.

---

## 🔑 O Problema: Dois Escritores no Mesmo Repositório

O sistema usa o **GitHub como banco de dados distribuído**. Isso significa que:

- O **totem** (kiosk) faz commits automáticos de dados no `main` a cada sync (~5 min)  
  → Arquivos: `assets/config.json`, `manifest.json`

- O **desenvolvedor** também faz commits de código no `main`  
  → Arquivos: `js/`, `*.html`, `tests/`, etc.

Quando os dois trabalham ao mesmo tempo, o `git push` do desenvolvedor é **rejeitado** como non-fast-forward.

---

## 🔒 Dev Lock — A Solução

O **Dev Lock** pausa o push de sync do totem enquanto você trabalha.  
Funciona através de um ref git especial (`__dev-lock__`) criado no GitHub.

### Ativar antes de trabalhar

```bash
npm run dev:lock
```

- Cria o ref `refs/heads/__dev-lock__` no GitHub
- O totem detecta e **pausa o push** automaticamente (em até 1 minuto)
- O totem **continua funcionando** normalmente para visitantes
- O totem **continua lendo** (pull) atualizações

### Desativar ao terminar

```bash
npm run dev:unlock
```

- Deleta o ref `__dev-lock__` do GitHub
- O totem retoma o sync de push normalmente em até 1 minuto

---

## 📅 Fluxo Diário Recomendado

### Sessão de Desenvolvimento

```
1. npm run dev:lock          ← PRIMEIRO, sempre
2. [seu trabalho normal]
   - npm run dev             ← servidor local
   - editar arquivos
   - git add + git commit
3. git push origin main      ← push do código
4. npm run dev:unlock        ← ÚLTIMO, sempre
```

### Se o push for rejeitado (esqueceu o lock)

Rode o merge automático que preserva sua versão:

```bash
git fetch origin
git merge origin/main -X ours --no-edit
git push origin main
```

> `-X ours` = em conflito, sua versão local vence.  
> Os commits de sync do totem (`sync: config local mais recente`) são apenas dados — podem ser descartados com segurança.

---

## 🎨 Sessão de Curadoria (tablet do museu)

Durante curadoria ativa no tablet:
- O totem **faz push automaticamente** do `config.json` para o GitHub
- Não é necessário usar `dev:lock` durante curadoria (o lock é para o desenvolvedor)
- O desenvolvedor deve **evitar trabalhar** no mesmo período em que o curador está editando obras

### Depois de uma sessão de curadoria

Se você for desenvolver logo após o curador ter trabalhado:

```bash
git pull --no-rebase       # ou: git fetch origin + git merge -X ours
npm run dev:lock
[trabalhe normalmente]
npm run dev:unlock
```

---

## 🚨 Diagnóstico Rápido

### Verificar estado do Dev Lock

Acesse o **Painel Admin** (`/adm.html`) → seção "📡 Diagnóstico de Conectividade"  
A linha "🔒 Dev Lock" mostra se o push está suspenso ou ativo.

### Verificar via terminal

```bash
# Ver se o lock está ativo:
git ls-remote origin refs/heads/__dev-lock__

# Resultado com saída = LOCK ATIVO
# Resultado sem saída  = sem lock (sync normal)
```

### Forçar remoção do lock (emergência)

```bash
git push origin --delete refs/heads/__dev-lock__
```

---

## 📁 Arquivos que o Totem Pode Modificar

| Arquivo | Modificado por | Frequência |
|---------|---------------|------------|
| `assets/config.json` | Totem (curadoria) | A cada save de obra |
| `manifest.json` | Totem (sync engine) | A cada sync (~5 min) |

**Nunca edite esses arquivos manualmente** — eles são gerenciados pelo sistema.  
Use a interface de curadoria (`/curadoria.html`) para modificar obras.

---

## ⚠️ Limitações Conhecidas

1. **Cache de 1 minuto**: O totem verifica o lock a cada 1 minuto. Pode demorar até 1 min para pausar/retomar.
2. **Sem lock ≠ sem conflito**: Se o curador editar uma obra E o desenvolvedor modificar `assets/config.json` manualmente ao mesmo tempo, ainda pode haver conflito.
3. **Um branch para tudo**: Esta arquitetura (MVP) usa um branch único. A solução definitiva para ambientes com múltiplos totens ou curadoria intensiva seria separar em `main` (código) e `config/live` (dados).

---

*Última atualização: 2026-05*
