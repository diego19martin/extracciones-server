# Carga automática del "Archivo para App"

Tesorería (Christian Rodríguez) envía todos los días, alrededor de las 03:30, el mail
**"Archivo para App - dd/mm/aaaa hh:mm"** con el adjunto `ArchivoApp_*.xlsx`.
Un flujo de Power Automate toma ese adjunto y lo manda al servidor, que:

1. Lee el Excel (acepta encabezados `Máquina/Location/Importe/Zona/Moneda` o
   `machine/location/bill/zona/moneda`), descarta filas vacías/en cero y máquinas repetidas.
2. Aplica el **último límite confirmado** (tabla `config`).
3. Reemplaza `listado` y `listado_filtrado`, así la app de extracciones queda lista.
4. Registra la carga en `carga_archivo` y avisa a las pantallas abiertas.

La carga manual desde `/conversion` sigue funcionando igual y tiene prioridad:
quien cargue un archivo a mano y confirme, reemplaza lo cargado automáticamente.

**Protección:** si hay una extracción en curso (máquinas ya marcadas como trabajadas en
las últimas 12 hs), la carga automática **no** pisa el listado y responde `409`.

## Endpoint

`POST /api/archivoAutomatico`

- Header: `x-api-key: <AUTO_UPLOAD_TOKEN>`
- Body JSON:
  ```json
  { "nombreArchivo": "ArchivoApp_20/11/2026 03:31.xlsx", "contenidoBase64": "<adjunto en base64>" }
  ```
  Opcional: `"forzar": true` para reemplazar aunque haya extracción en curso.
- Respuestas: `200` OK con `{ maquinas, aExtraer, limitePesos, limiteDolares }`,
  `401` token inválido, `400` archivo inválido, `409` extracción en curso,
  `503` falta configurar `AUTO_UPLOAD_TOKEN`.

`GET /api/ultimaCarga` devuelve la última carga (origen, fecha, máquinas, límite).

## Configuración en Heroku

Crear la variable `AUTO_UPLOAD_TOKEN` con un valor largo y aleatorio
(Settings → Config Vars). **No** guardarla en el repositorio.

## Flujo de Power Automate

1. **Disparador:** *Office 365 Outlook – When a new email arrives (V3)*
   - Carpeta: Bandeja de entrada
   - De: `crodriguez@palermo.com.ar`
   - Filtro de asunto: `Archivo para App`
   - Incluir datos adjuntos: **Sí** · Solo con datos adjuntos: **Sí**
2. **Apply to each** sobre `Attachments`:
   - **Condición:** `Attachments Name` termina en `.xlsx`
   - **HTTP** (POST) a `https://extraccione-server.herokuapp.com/api/archivoAutomatico`
     - Headers: `Content-Type: application/json`, `x-api-key: <token>`
     - Body:
       ```json
       {
         "nombreArchivo": "@{items('Apply_to_each')?['name']}",
         "contenidoBase64": "@{items('Apply_to_each')?['contentBytes']}"
       }
       ```
3. **Si el HTTP no devuelve 200:** enviar mail de aviso a Jefes de Juego / Automatizaciones
   con el código y el cuerpo de la respuesta (en `409` el aviso es informativo: no se pisó
   una extracción en curso).
