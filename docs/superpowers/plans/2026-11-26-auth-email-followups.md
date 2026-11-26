# Seguimientos del corte SMTP / `littlebase.club` (#172–#176) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Antes de despachar:** este plan y su spec se mergean a `develop` por un PR de docs (rama `update/auth-email-followups-spec`) **antes** de despachar a nadie. Cada implementer corta su worktree de `origin/develop` con el plan ya incluido. Ahí marca `- [x]` en su copia para que se vea el avance, pero **nunca** hace `git add` del plan: cuatro ramas paralelas no pueden tocar el mismo archivo. Antes de su último `git status`, restaura el plan con `git -C $WT checkout -- docs/superpowers/plans/2026-11-26-auth-email-followups.md`. El orquestador junta todas las marcas en la rama `update/auth-email-followups-progress` (Task 6).

**Goal:** Cerrar #172, #173, #174, #175 y #176. El runbook queda con comandos completos y el DNS vigente, las plantillas se ven bien en Outlook de escritorio y tienen preheader, `.env.example` queda envuelto y el check C(3) busca valores y no menciones.

**Architecture:** Cuatro ramas sin archivos en común, en una sola ola paralela: A (runbook), B (plantillas y su suite), C (`.env.example`) y D (checklist). Después de los merges, el orquestador re-aplica las plantillas en Supabase por la Management API, verifica byte a byte, espera la caché y el owner prueba en su bandeja.

**Tech Stack:** Vitest 4 (`// @vitest-environment node`), TypeScript 6 (`tsc -b`, `tsconfig.ops.json` ya incluye `supabase/templates/**/*.ts`), ESLint 10, pnpm, Supabase CLI 2.107, Management API de Supabase, `jq`, `curl`, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-26-auth-email-followups-design.md` (§1 lotes, §3.1–§3.5 una decisión por issue, §4 Management API, §5 verificación).

## Global Constraints

- **Worktrees:** el orquestador crea uno por rama en `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/<slug>`, con `git worktree add --no-track -b <rama> <ruta> origin/develop`. En cada task, `$WT` es esa ruta absoluta. Primera acción en B: `pnpm install --frozen-lockfile`. A, C y D no necesitan instalar nada.
- **Git:** siempre `git -C $WT …`, **un comando git por llamada a la shell**. Nunca `git stash` (el stash es compartido entre worktrees), `--amend`, `--no-verify`, `CLAUDE_GIT_OVERRIDE`, push, PR ni merge (eso es del orquestador). Para descartar un cambio: `git -C $WT checkout -- <archivo>`. Nunca toques `/Users/arturoortiz/Proyectos/Personales/ligaspequenas` (checkout principal).
- **Archivos por rama (exclusivos; antes de cada commit, `git -C $WT status -s` muestra solo estos):**
  - A `update/auth-email-runbook-followups`: `docs/ops/auth-email.md`.
  - B `fix/auth-email-templates-outlook`: `supabase/templates/invite.html`, `supabase/templates/magic_link.html`, `supabase/templates/confirmation.html` y `supabase/templates/templates.test.ts`.
  - C `update/env-example-wrap`: `.env.example`.
  - D `fix/checklist-secret-grep`: `docs/security/pre-real-data-checklist.md`.
  - Si hace falta otro archivo, **detente** y avisa al orquestador.
- **No se tocan:** specs ni planes antiguos (incluido `docs/superpowers/specs/2026-11-25-custom-smtp-littlebase-design.md`), `supabase/config.toml`, `src/` y `supabase/functions/`.
- **Implementers sin acceso remoto:** nada de Supabase MCP, CLI de Supabase contra el proyecto remoto, Management API, llavero ni Dashboards.
- **Secretos:** ningún valor de token (`sbp_…`), key (`re_…`, `sb_secret_…`) ni JWT en el repo, el chat, issues o logs. Los valores plantados de Task 4 viven solo en un directorio de `mktemp -d` fuera del repo.
- **Copy:** acentos y `ñ` como UTF-8 literal, nunca como entidades HTML. Las únicas variables de plantilla siguen siendo `{{ .ConfirmationURL }}` y `{{ .Email }}`. Los textos obligatorios y el pie de las plantillas no cambian.
- Docs en español. Identificadores en inglés, sin comentarios nuevos. Commits en inglés, enfocados en el porqué, con `Refs #N`. Si el brief del orquestador da una línea `Claude-Session:`, va al final del mensaje.
- **PRs (orquestador):** A → `Closes #172`, `Closes #176`; B → `Refs #173` (#173 se cierra a mano después de Task 5); C → `Closes #174`; D → `Closes #175`.

## Review Focus

- **Outlook sin VML:** un comentario condicional `<!--[if mso]>` o un `xmlns`/`urn:` en una plantilla rompería la regla de la suite y complicaría la plantilla de Go. La celda con `bgcolor` basta (Task 2, `%s.html has no scripts, remote images, external stylesheets or http:// links` sigue verde; el reviewer busca `\[if mso` → vacío).
- **El ancho fijo no debe romper el móvil:** si solo se pone `width="480"` y no `width:100%` en el `style`, en un teléfono la tarjeta se desborda. El test exige las dos cosas (Task 2, `%s.html gives the card a fixed width for Outlook and a fluid width elsewhere`), y la captura en Playwright a 375 px de ancho lo confirma (Task 2, Step 2.6).
- **Preheader con datos del usuario:** un `{{ .Email }}` en el preheader se mostraría en la vista previa de la bandeja. El texto es exacto y sin variables (Task 2, `%s.html starts the body with its hidden preheader`).
- **Token del llavero filtrado:** imprimir el `GET`/`PATCH` completo de la Management API saca `smtp_pass`, y un `echo $token` saca el token. El procedimiento descarta la respuesta del `PATCH`, extrae del `GET` solo campos de plantilla y pasa el token por `-K <(…)` (Task 1, Step 1.4; Task 5). El reviewer de A busca `sbp_`, `re_` y `echo .*token` en el runbook → vacío.
- **C(3) que deja de detectar:** un patrón de valores demasiado estricto saldría vacío para siempre. La prueba con valores plantados (Task 4, Step 4.3) exige 3 coincidencias exactas.

---

## Task 1 [repo / implementer]: Runbook — comandos completos, DNS por CNAME, caché y Management API (#172, #176)

Rama `update/auth-email-runbook-followups`, worktree `…/ligaspequenas-worktrees/auth-email-runbook-followups`.

**Files:**
- Modify: `docs/ops/auth-email.md` (l.3 encabezado; l.33-40 tabla DNS; l.59 re-aplicar; l.65 §3 paso 3; l.74 paso 1; l.84 paso 11; l.120-121 R4/R5; §7)

**Interfaces:**
- Consumes: nada.
- Produces: el runbook §2 con la subsección de Management API que usa Task 5, y el §4 paso 11 con los comandos completos que usa #179.

- [ ] **Step 1.1: Baseline de los greps (rojo)**

```bash
rg -n '\| MX \||\| TXT \| `send`|amazonses|dig \+short (MX|TXT) send' $WT/docs/ops/auth-email.md
rg -n 'secrets set' $WT/docs/ops/auth-email.md
```

Esperado: el primero coincide en la tabla (l.38-39) y en el paso 1 (l.74). El segundo da l.45, 78, 84 y 120, y las l.84 y 120 no tienen `pnpm exec supabase` ni `--project-ref`.

- [ ] **Step 1.2: #176 DNS.** En §1 "Resend", la tabla queda con 4 filas: TXT `resend._domainkey` (igual), CNAME `send` → `send.forge.rmta.net`, CNAME `rsend` → `rsend.forge.rmta.net` y TXT `_dmarc` (igual). Debajo, una línea: desde el 2026-11-25 Resend delega SPF y return-path con CNAMEs, y en `send` ya no hay MX ni TXT (un CNAME no convive con otros registros en el mismo nombre). En §4 paso 1, los cuatro `dig` del spec §3.2.2, con su valor esperado en la columna de comprobación: DKIM `p=…`, `send.forge.rmta.net.`, `rsend.forge.rmta.net.` y `"v=DMARC1; p=none;"`. §5.2 paso 2 no cambia.

- [ ] **Step 1.3: #172 comandos completos.** El paso 11, R4 y R5 usan los dos comandos del spec §3.1 (`pnpm exec supabase secrets set ALLOWED_ORIGINS="…" --project-ref eksbaugyypadtanyjcje` y después `pnpm exec supabase functions deploy invite-user --project-ref eksbaugyypadtanyjcje --use-api`, desde un worktree limpio en `origin/develop` actualizado) y luego el script de §5.1. Los valores son exactos:
  - Paso 11: `http://localhost:5173,https://littlebase.club`.
  - R4: `http://localhost:5173,https://ligaspequenas.vercel.app` si falló el paso 5; `http://localhost:5173,https://ligaspequenas.vercel.app,https://littlebase.club` si falló el paso 11.
  - R5: `http://localhost:5173,https://ligaspequenas.vercel.app,https://littlebase.club`.

  Una tabla de Markdown no aguanta bloques de código: en la celda del paso 11, los comandos van como `code` inline separados por "y después", igual que el paso 5.

- [ ] **Step 1.4: #176 plantillas, caché y Management API.** En §2, "Re-aplicar las plantillas" queda así:
  1. **Camino A, Dashboard:** el texto de hoy.
  2. **Camino B, Management API:** subsección nueva "Re-aplicar por la Management API (orquestador)". Abre con las reglas del spec §4 como bullets: solo plantillas; token por `-K <(…)`; nunca imprimir ni escribir el token; `unset` al final; respuesta del `PATCH` descartada; del `GET` solo campos de plantilla; si se guarda un `GET`, quitar antes `smtp_pass` y todo campo con `pass|secret|token|key`. Nota: aprobado por el owner el 2026-11-25; el token es el de `supabase login` y tiene poder sobre toda la cuenta. Después, este bloque, tal cual:

```bash
api=https://api.supabase.com/v1/projects/eksbaugyypadtanyjcje/config/auth
token=$(security find-generic-password -s "Supabase CLI" -a supabase -w | sed 's/^go-keyring-base64://' | base64 -d)
auth() { printf 'header = "Authorization: Bearer %s"\n' "$token"; }
for name in invite magic_link confirmation; do
  subject=$(awk -v h="[auth.email.template.$name]" '$0==h{f=1;next} /^\[/{f=0} f&&/^subject/{sub(/^subject *= *"/,"");sub(/"$/,"");print}' supabase/config.toml)
  jq -n --arg n "$name" --arg s "$subject" --rawfile c "supabase/templates/$name.html" \
    '{("mailer_subjects_"+$n): $s, ("mailer_templates_"+$n+"_content"): $c}' \
    | curl -sS -K <(auth) -X PATCH "$api" -H 'Content-Type: application/json' --data-binary @- -o /dev/null -w "$name PATCH %{http_code}\n"
done
for name in invite magic_link confirmation; do
  curl -sS -K <(auth) "$api" | jq -j --arg n "$name" '.["mailer_templates_"+$n+"_content"]' | cmp - "supabase/templates/$name.html" && echo "$name content identical"
  curl -sS -K <(auth) "$api" | jq -r --arg n "$name" '.["mailer_subjects_"+$n]'
done
unset token
```

     Se corre desde un checkout de `develop` actualizado. Esperado: `PATCH 200` ×3, `content identical` ×3 y los tres asuntos de `config.toml`.
  3. **Al final de §2, para los dos caminos:** después de aplicar, esperar **30 minutos** antes de juzgar el cambio (caché de GoTrue: observado el 2026-11-25, de 7 a 27 min para `magic_link`; las plantillas nunca usadas se aplican al instante, pero hoy las tres ya se usaron). Probar con una petición **nueva**, nunca con un correo viejo. Aunque se haya usado el Dashboard, la verificación byte a byte se puede hacer con el segundo `for`.
  4. En §7 "Operación", una bullet "Cambio de plantilla que no se ve" que remita a la regla de los 30 minutos de §2.
  5. En §3, paso 3: "re-aplicar las tres plantillas (§2)", sin "en el Dashboard".
  6. En la l.3, agregar la ruta `docs/superpowers/specs/2026-11-26-auth-email-followups-design.md` como seguimientos.

- [ ] **Step 1.5: Greps (verde)**

```bash
rg -n '\| MX \||\| TXT \| `send`|amazonses|dig \+short (MX|TXT) send' $WT/docs/ops/auth-email.md
rg -n 'forge\.rmta\.net|CNAME (r?send)' $WT/docs/ops/auth-email.md
rg -n 'secrets set' $WT/docs/ops/auth-email.md
rg -n 'functions deploy invite-user' $WT/docs/ops/auth-email.md
rg -n 'sbp_|re_[A-Za-z0-9]|echo .*\$token' $WT/docs/ops/auth-email.md
```

Esperado: (1) vacío. (2) la tabla y el paso 1. (3) cada línea con `secrets set` trae `pnpm exec supabase` y `--project-ref eksbaugyypadtanyjcje` (la l.45 ya los trae). (4) los pasos 5 y 11, R4 y R5. (5) vacío.

- [ ] **Step 1.6: Commit**

```bash
git -C $WT add docs/ops/auth-email.md
git -C $WT commit -m "docs: complete ALLOWED_ORIGINS commands and current Resend DNS in auth-email runbook" -m "Step 11, R4 and R5 used abbreviated commands without a redeploy, so a copy/paste failed and a warm isolate could keep the old origins. Also documents the CNAME DNS scheme, the template cache delay and the owner-approved Management API path. Refs #172 #176"
```

---

## Task 2 [repo / implementer]: Plantillas a prueba de Outlook y con preheader (#173)

Rama `fix/auth-email-templates-outlook`, worktree `…/ligaspequenas-worktrees/auth-email-templates-outlook`.

**Files:**
- Modify: `supabase/templates/templates.test.ts` (agregar `preheader` a cada entrada de `TEMPLATES` y 3 `test.each`)
- Modify: `supabase/templates/invite.html`, `supabase/templates/magic_link.html`, `supabase/templates/confirmation.html` (l.8-9 `<body>`, l.12 tarjeta, l.17-19 botón)

**Interfaces:**
- Consumes: los helpers existentes `flat`, `escapeRegExp`, `readTemplate` y `NAMES`.
- Produces: los tres HTML que Task 5 aplica al proyecto vivo.

- [ ] **Step 2.0: Baseline.** En `$WT`, `pnpm install --frozen-lockfile` y `pnpm exec vitest run`. Anota `B_files` y `B_tests` (todo verde). Abre los tres HTML actuales con Playwright (`file://`, a 600 px y a 375 px de ancho) y guarda capturas "antes" en el scratchpad (no en el repo).

- [ ] **Step 2.1: Tests nuevos (rojo).** En `TEMPLATES`, cada entrada recibe `preheader` con el copy exacto del spec §3.3:

```ts
invite:       preheader: 'Acepta tu invitación a Little Baseball Club. El enlace es válido por 1 hora.',
magic_link:   preheader: 'Tu enlace para entrar a Little Baseball Club. Es válido por 1 hora.',
confirmation: preheader: 'Confirma tu correo para entrar a Little Baseball Club. El enlace es válido por 1 hora.',
```

Tres tests nuevos, después del test del botón:

```ts
test.each(NAMES)('%s.html wraps the button in a bgcolor cell for Outlook', (name) => {
  expect(flat(readTemplate(name))).toMatch(
    /<td\b[^>]*\bbgcolor="#6d28d9"[^>]*>\s*<a\b[^>]*href="\{\{ \.ConfirmationURL \}\}"/,
  )
})

test.each(NAMES)('%s.html gives the card a fixed width for Outlook and a fluid width elsewhere', (name) => {
  expect(readTemplate(name)).toMatch(
    /<table\b(?=[^>]*\bwidth="480")(?=[^>]*\bstyle="(?:[^"]*;)?width:100%;[^"]*max-width:480px)[^>]*>/,
  )
})

test.each(NAMES)('%s.html starts the body with its hidden preheader', (name) => {
  expect(flat(readTemplate(name))).toMatch(
    new RegExp(
      `<body\\b[^>]*>\\s*<div\\b(?=[^>]*display:none)(?=[^>]*mso-hide:all)[^>]*>${escapeRegExp(TEMPLATES[name].preheader)}</div>`,
    ),
  )
})
```

No se toca ningún test existente.

- [ ] **Step 2.2: Ver el rojo.** `pnpm exec vitest run supabase/templates`. Esperado: 9 failed (los 3 nuevos × 3 plantillas) y 25 passed.

- [ ] **Step 2.3: Marcado en las tres plantillas** (spec §3.3; el mismo cambio en las tres):
  - Primer hijo de `<body>`: `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f4f4f5;opacity:0;">` + el preheader de esa plantilla + `</div>`.
  - Tarjeta (l.12): `width="100%"` pasa a `width="480"` y `style="max-width:480px;…"` pasa a `style="width:100%;max-width:480px;…"`. El resto del `style` no cambia. La tabla externa (l.9) no cambia.
  - Botón (l.17-19): `<p style="margin:0 0 24px;">…</p>` pasa a ser `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr><td align="center" bgcolor="#6d28d9" style="border-radius:6px;">` + el `<a>` actual, intacto + `</td></tr></table>`, con la misma sangría del archivo.
  - Sin `<!--[if mso]>`, VML, `xmlns` ni `urn:`.

- [ ] **Step 2.4: Verde.** `pnpm exec vitest run supabase/templates` → 34 passed. `rg -n '\[if mso|xmlns|urn:' $WT/supabase/templates` → vacío.

- [ ] **Step 2.5: Suite completa.** `pnpm exec vitest run` → `B_files` archivos y `B_tests + 9` tests, todo verde. `pnpm exec tsc -b` → sin errores. `pnpm lint` → sin errores.

- [ ] **Step 2.6: Capturas "después"** de los tres HTML con Playwright (`file://`, a 600 px y a 375 px). Esperado: a 600 px, la tarjeta mide 480 px y el botón se ve igual que antes; a 375 px, la tarjeta no se desborda (sin scroll horizontal); el preheader no se ve. Las rutas de las capturas antes y después van en el reporte al orquestador.

- [ ] **Step 2.7: Commit**

```bash
git -C $WT add supabase/templates/templates.test.ts supabase/templates/invite.html supabase/templates/magic_link.html supabase/templates/confirmation.html
git -C $WT commit -m "fix: make auth email button and card width render in Outlook desktop, add preheader" -m "Outlook ignores padding/border-radius on the inline-block link and max-width on the card, so the button showed as a text link and the card stretched. A bgcolor cell and a width attribute fix both; the preheader gives a useful inbox preview. Refs #173"
```

---

## Task 3 [repo / implementer]: `.env.example` — envolver la línea de Resend (#174)

Rama `update/env-example-wrap`, worktree `…/ligaspequenas-worktrees/env-example-wrap`.

**Files:**
- Modify: `.env.example:12`

- [ ] **Step 3.1: Rojo.** `python3 -I -c "import sys; [print(i, len(l.rstrip('\n'))) for i, l in enumerate(open(sys.argv[1], encoding='utf8'), 1) if len(l.rstrip('\n')) > 80]" $WT/.env.example` → `1 81`, `7 83` y `12 168`.
- [ ] **Step 3.2:** Reemplaza la l.12 por las tres líneas exactas del spec §3.4.
- [ ] **Step 3.3: Verde.** El mismo comando → solo `1 81` y `7 83`. `git -C $WT diff --stat` → 1 archivo, 3 inserciones y 1 borrado. Las tres líneas nuevas, sin `#` y unidas con un espacio, son iguales a la l.12 original sin `# `.
- [ ] **Step 3.4: Commit**

```bash
git -C $WT add .env.example
git -C $WT commit -m "docs: wrap the Resend line in .env.example to match its neighbours" -m "Refs #174"
```

---

## Task 4 [repo / implementer]: Checklist C(3) — buscar valores, no menciones (#175)

Rama `fix/checklist-secret-grep`, worktree `…/ligaspequenas-worktrees/checklist-secret-grep`.

**Files:**
- Modify: `docs/security/pre-real-data-checklist.md:79-80` (y el párrafo "Verde:" de la l.105 solo si nombra el grep viejo)

- [ ] **Step 4.1: Rojo.** Desde `$WT`: `grep -rnE 'sb_secret_|service_role|SERVICE_ROLE' src .env.example` → coincide en `.env.example:7`, `:9` y `:11` (check rojo por construcción).
- [ ] **Step 4.2:** En el bloque de C, el comentario `# (3) secretos en src — verde: vacío` y su grep pasan a ser el comentario y los dos `grep` exactos del spec §3.5. El texto "(3) vacío" de la l.105 se queda.
- [ ] **Step 4.3: Verde y prueba con valores plantados.** Desde `$WT`, corre los dos `grep` nuevos tal como quedaron en el checklist → los dos vacíos. Después, fuera del repo:

```bash
tmp=$(mktemp -d)
cp $WT/.env.example "$tmp/env.example"
printf '%s\n' 'SUPABASE_SERVICE_ROLE_KEY=fakevalue123' 'X=sb_secret_FAKEfake0123456789' 'Y=eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abc' >> "$tmp/env.example"
grep -nE '<el patrón de .env.example copiado del checklist>' "$tmp/env.example"
rm -r "$tmp"
```

Esperado: exactamente 3 coincidencias, las tres líneas plantadas (l.18, 19 y 20). `git -C $WT status -s` muestra solo el checklist. Pega en el reporte las salidas vacías y la de las 3 coincidencias.

- [ ] **Step 4.4: Commit**

```bash
git -C $WT add docs/security/pre-real-data-checklist.md
git -C $WT commit -m "docs: make checklist C(3) match secret values in .env.example, not mentions" -m "The old grep always matched the comments that name the secrets, so the check was red by construction. src keeps the broad pattern. Refs #175"
```

---

## Task 5 [orchestrator + owner]: Revisión, PRs, merges y re-aplicar plantillas en vivo

- [ ] **Step 5.1 [orchestrator]:** antes de despachar, PR de docs `update/auth-email-followups-spec` a `develop` y merge. Después, crear los cuatro worktrees (Global Constraints) y despachar Tasks 1 a 4 en paralelo.
- [ ] **Step 5.2 [orchestrator]:** por rama, revisión pre-PR (ciclo implementer → reviewer, máximo 3 vueltas; los Minor van a issues). En B, el reviewer ve las capturas antes y después de Task 2. Después, PR a `develop` con el `Closes`/`Refs` de Global Constraints, CI verde y merge.
- [ ] **Step 5.3 [orchestrator]:** con A y D mergeados, comentar en #179 que el runbook §4 paso 11 ya trae los comandos completos (#172).
- [ ] **Step 5.4 [orchestrator]:** con C y D mergeados, desde un checkout de `develop` actualizado, correr los dos `grep` de C(3) → vacíos.
- [ ] **Step 5.5 [orchestrator]:** con A y B mergeados, desde un checkout de `develop` actualizado, re-aplicar las tres plantillas con el bloque del runbook §2 (Management API). Esperado: `PATCH 200` ×3, `content identical` ×3 y los tres asuntos iguales a `config.toml`. Si algo no es 200 o `cmp` difiere: no seguir; diagnosticar con `superpowers:systematic-debugging`, sin imprimir el token ni respuestas completas.
- [ ] **Step 5.6 [orchestrator]:** anotar la hora del `PATCH` y esperar **30 minutos** (caché de GoTrue).
- [ ] **Step 5.7 [owner]:** desde `https://littlebase.club/login`, pedir un magic link **nuevo** con el correo del owner. En la bandeja: el preheader "Tu enlace para entrar a Little Baseball Club. Es válido por 1 hora." aparece junto al asunto; el correo trae el botón morado y el enlace en texto plano; el botón loguea. Si llega la versión anterior: esperar otros 15 minutos y pedir otro enlace. Si el enlace no loguea: rollback (Step 5.8).
- [ ] **Step 5.8 [orchestrator], solo si 5.7 falla:** volver a hacer el `PATCH` con la versión anterior (`git show <merge de B>^1:supabase/templates/<name>.html`), `git revert` del PR de B en una rama nueva `fix/revert-auth-email-templates-outlook` y PR. No se parcha hacia adelante.
- [ ] **Step 5.9 [orchestrator]:** con la aprobación explícita del owner a 5.7, cerrar #173 con un comentario que tenga la salida de 5.5 (sin secretos) y la confirmación del owner. Comprobar que #172, #174, #175 y #176 se cerraron con sus PRs; si alguno sigue abierto, cerrarlo a mano y enlazar el PR.

---

## Task 6 [orchestrator]: Rama de progreso

- [ ] **Step 6.1:** en la rama `update/auth-email-followups-progress`, cortada de `origin/develop`, marcar `- [x]` en este plan todo lo hecho en Tasks 1 a 5. Si algo se hizo distinto, una nota `> Done differently: …`. PR a `develop` y merge.

---

## Discrepancias y decisiones del planner

- **Marcas del plan fuera de las ramas de implementer:** cuatro ramas paralelas editando el mismo `.md` violarían la regla de "archivos exclusivos por rama". Por eso las marcas se hacen en local y se consolidan en Task 6.
- **B usa `Refs #173`, no `Closes`:** el cambio solo llega al usuario cuando se re-aplica en Supabase y el owner lo ve en su bandeja (mismo criterio que #7).
- **Botón sin padding de celda:** el padding se queda en el `<a>` (área clicable completa fuera de Outlook). En Outlook, la celda con `bgcolor` da el bloque de color, aunque más ajustado. Poner el padding en la celda achicaría el área clicable en todos los demás clientes.
- **Snippet de la Management API comprobado a medias:** el planner verificó, sin imprimirlos, el servicio y la cuenta del llavero, el prefijo `go-keyring-base64:` y que el valor decodificado tiene forma `sbp_…`. No llamó a la API. La primera ejecución real es Task 5.5. Si el snippet falla por forma (no por permisos), el orquestador corrige el runbook en una rama `fix/` propia.
- **Prueba de Outlook:** no hay Outlook de escritorio. El test fija el marcado, y Task 5.7 (Gmail) prueba que no hay regresión.
