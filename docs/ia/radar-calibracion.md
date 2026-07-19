# RADAR — Calibración (Fase 6)

Cómo medir calidad de la agenda y ajustar umbrales **en local**, con datos reales, sin dashboard pesado.

## 1. Ver métricas

```bash
# Con API arriba y token de director/produccion:
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3010/api/listening/radar-sources" >/dev/null  # smoke

curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3010/api/listening/radar-stats?days=30" | jq .
```

En el panel: **RADAR → Temas** muestra el bloque “Calibración (N días)” con los mismos datos.

`npm run check:listening` valida que el endpoint responde y trae `topics` / `hints` / `knobs`.

E2E UI (Playwright): `cd apps/admin/e2e && npm install && npx playwright test`  
(admin same-origin en el puerto de la API; detalle en `apps/admin/e2e/README.md`).

## 2. Qué mirar

| Señal | Interpretación |
|-------|----------------|
| `% risk` alto (≥40%) | Falsos positivos o mucho ruido de redes; aflojar hard-risk o lista `low` |
| `% verified` muy alto (≥70%) | Modelo over-confiado; el cap sin multi-fuente debería bajar a `checking` |
| `blocked_risk` | Gate de propuestas funciona (intentos 409) |
| `forced_from_risk` | Overrides humanos; si crece, la lista de risk puede ser demasiado agresiva |
| `skipped_similar` ≫ `inserted` | Dedupe fuerte; temas cercanos se fusionan/descartan |
| `sources.by_trust` | Lista editorial activa (PR5) |

## 3. Perillas (código)

| Knob | Dónde | Default | Si… |
|------|--------|---------|-----|
| Banda verified | `topic-verification.js` `deriveStatus` / caps | conf ≥ **75** | Muchos `checking` buenos → bajar a 70 |
| Banda risk | mismo | conf ≤ **39** o hard flags | Risk falso → subir o acotar `HARD_RISK_RE` |
| Hard risk regex | `HARD_RISK_RE` | rumor, clickbait, fake… | Añadir/quitar tokens locales |
| Similarity dedupe | `topic-detection.js` `TITLE_SIMILARITY_THRESHOLD` | **0.45** | Fusiona de más → **0.50**; de menos → **0.40** |
| Bonus multi-scrape | `applyScrapeMultiSource` | **+10** | Ajustar si Firecrawl domina |
| Trust high/med/low | `applyTrustFromSources` | +8 / +2 / −12 | Lista en `radar_sources` + estos deltas |
| Gate risk | `content-engine` generate-proposal | 409 salvo `force` | No desactivar en prod sin decisión editorial |

Tras cambiar un knob: `check:listening` + 1 corrida de “Buscar tendencias” en local y comparar `radar-stats` antes/después.

## 4. Ritual local recomendado (15–20 min)

1. `docker compose up -d` + migrate (ya tenés 034/035).
2. Abrir RADAR, anotar stats del bloque calibración (`days=30` o 7).
3. Correr **Buscar tendencias** una vez (gasta API).
4. Revisar 5 fichas a mano: ¿el badge coincide con tu juicio?
5. Si no: ajustar **una** perilla o un dominio en **Fuentes**, no tres a la vez.
6. Volver a `radar-stats?days=7` y comparar % risk / verified.
7. Anotar el cambio en commit o en este doc (fecha + knob + por qué).

## 5. Muestreo editorial (sin tabla nueva)

No hay aún log de “el director rechazó porque era basura”. Proxy útil:

- Topics `risk` que **nunca** generan propuesta → gate OK.
- Topics `verified` que el humano borra o no aprueba → anotar a mano; si se repite, bajar trust de la fuente o endurecer prompt.
- Propuestas con `warnings` (checking/signal) que llegan a publicada sin corrección → aflojar UI warning o subir barra a “force required” (cambio de producto).

## 6. Fuera de alcance de esta fase

- Dashboard histórico multi-mes.
- Auto-tune de umbrales por ML.
- Re-score batch de topics legacy (siguen “Sin evaluar”).
