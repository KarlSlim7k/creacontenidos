# Content Engine

Capa 2: toma los temas detectados y genera propuestas (nota, post, guion de audio, guion de video, meme). Implementado con Nous Portal (`../../lib/ai-client.js`), no Claude directo — `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` en `.env` no se usan.

System prompt a usar: [`docs/ia/identidad-editorial.md`](../../../../../docs/ia/identidad-editorial.md). Spec de procedimiento: [`docs/ia/especificacion-pipeline.md`](../../../../../docs/ia/especificacion-pipeline.md).
