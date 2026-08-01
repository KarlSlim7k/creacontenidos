# Backups y recuperación de Postgres

## Objetivos

- RPO: 24 horas.
- RTO inicial: 2 horas desde que se decide restaurar.
- Nunca restaurar una prueba sobre `crea_command_center` de producción.

## Backup local

El VPS ejecuta `/opt/backups/creacontenidos/backup_db.sh` todos los días a las
03:15 UTC mediante el `crontab` de `karol`. La copia canónica está en
`ops/backup_db.sh`.

El script conserva 14 días, usa `umask 077`, mantiene el directorio y el script
en `700`, los dumps y el log en `600`, escribe primero a un archivo temporal y
solo publica el dump después de que `gzip -t` lo valida. Si existe
`/opt/backups/creacontenidos/heartbeat-url`, notifica esa URL únicamente después
de completar la validación y la retención.

Comprobación local del script, sin Docker ni red reales:

```bash
ops/check-backup.sh
```

## Copia externa

Configurar en Dokploy un Destination S3 limitado al bucket de respaldos. Para el
compose `creacontenidos`, crear un backup con estos valores:

- tipo: `compose` / PostgreSQL;
- servicio: `db`;
- base: `crea_command_center`;
- horario: `30 3 * * *` UTC, separado 15 minutos del backup local;
- prefijo: `creacontenidos/postgres`;
- retención: 14 objetos (`keepLatestCount=14`);
- estado: habilitado.

Después de guardarlo, ejecutar **Test/Manual Backup** y confirmar que Dokploy
lista el objeto en el bucket. No se considera configurado solo porque exista la
tarea: debe existir y poder descargarse al menos un objeto.

Objeto verificado el 1 de agosto de 2026:
`creacontenidosapp-creacontenidos-909nii_db/creacontenidos/postgres/2026-08-01T22-05-38-378Z.sql.gz`
(9,114,120 bytes). Se descargó desde R2, pasó `gzip -t` y se restauró completo.

## Restauración aislada

1. Elegir el dump más reciente y validar `gzip -t`.
2. Crear un contenedor `postgres:16` sin red y con `/var/lib/postgresql/data` en
   `tmpfs`. No montar el volumen de producción.
3. Detectar el formato descomprimido con `file`. El script local genera SQL
   plano y se restaura con `psql -v ON_ERROR_STOP=1`; Dokploy genera un dump
   custom (`PGDMP`) y se restaura con `pg_restore --exit-on-error`.
4. Comparar producción y restauración: tablas públicas, `schema_migrations`,
   notas publicadas en `content_proposals`, usuarios, leads e imágenes.
5. Leer el tamaño y los primeros bytes de una fila de `generated_images`.
6. Eliminar el contenedor aislado y comprobar que ya no existe.

### Evidencia del 1 de agosto de 2026

Dump restaurado: `crea_command_center_20260801_205929.sql.gz` (8.7 MiB).

| Verificación | Producción | Restauración |
|---|---:|---:|
| Tablas públicas | 24 | 24 |
| Migraciones | 38 | 38 |
| Notas publicadas | 4 | 4 |
| Usuarios | 4 | 4 |
| Leads | 0 | 0 |
| Imágenes generadas | 5 | 5 |

La imagen más reciente se leyó como JPEG, 1,062,711 bytes y cabecera
`ffd8ffe0`. El restore usó `network=none` y `tmpfs`; el contenedor temporal se
eliminó y su ausencia se comprobó al finalizar.

La misma comparación pasó al restaurar directamente el objeto externo de R2
con `pg_restore`: los seis conteos y la lectura de imagen coincidieron con
producción. El contenedor aislado de esta segunda prueba también se eliminó.

## Heartbeat

Crear un monitor diario externo con un máximo de 26 horas entre señales y una
alerta a un correo operativo. Guardar su URL únicamente en:

```text
/opt/backups/creacontenidos/heartbeat-url
```

El archivo debe pertenecer a `karol:karol` y tener modo `600`. No registrar la
URL en Git, logs, comandos compartidos ni variables del compose.

## Recuperación real

Ante pérdida o corrupción, detener primero las escrituras y conservar una copia
del volumen afectado. Restaurar inicialmente en una base nueva, ejecutar las
verificaciones anteriores y cambiar la aplicación al destino recuperado solo
después de aprobar los conteos y una lectura real desde la API. La restauración
directa sobre producción queda prohibida como atajo.
