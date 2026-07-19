# Content Engine

Capa 2: toma los temas detectados y genera propuestas (nota, post, guion de audio, guion de video, meme). Implementado con Nous Portal (`../../lib/ai-client.js`), no Claude directo — `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` en `.env` no se usan.

## `POST /generate-proposal` — guards antes de gastar IA

1. **Verificación RADAR** — si el topic tiene `verification_status = 'risk'`, responde `409` con `code: 'verification_risk'` salvo `{ force: true }`. `checking` / `signal` se permiten; la respuesta puede incluir `warnings[]`. Legacy (`verification_status` null) se permite.
2. **Canibalización** — nota `published` con título similar (`similarity` > 0.35) → `409` salvo `force`.
3. Contexto de competencia + generación.

Plan: [`docs/ia/radar-verificacion-plan.md`](../../../../../docs/ia/radar-verificacion-plan.md).

System prompt a usar: [`docs/ia/identidad-editorial.md`](../../../../../docs/ia/identidad-editorial.md). Spec de procedimiento: [`docs/ia/especificacion-pipeline.md`](../../../../../docs/ia/especificacion-pipeline.md).
