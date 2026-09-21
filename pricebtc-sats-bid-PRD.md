# PRD — priceb.tc · Sats Bid

Versión: 1.0 · Fecha: 7 de septiembre de 2026 · Estado: especificación lista para implementar sobre el repositorio existente.

## 1. Objetivo y mandato de implementación

priceb.tc debe seguir siendo una web útil para consultar el precio de Bitcoin y usar sus widgets. Agregar una competencia diaria por un único espacio destacado junto al precio: cada participante paga sats por Lightning; sus pagos confirmados se acumulan durante el día; el mayor acumulado visible ocupa el Top Spot.

**La experiencia se explica así: “Pay sats. Take the spot. Someone else can take it from you.”**

Implementar incrementalmente sobre el stack, diseño e infraestructura actuales. Primero completar el recorrido con pagos simulados; después conectar BTCPay Server mediante un adapter. No reescribir el sitio ni bloquear el desarrollo por falta de credenciales de pagos reales.

Este documento consolida las decisiones de producto y define las reglas operativas que faltaban. Los valores de configuración aquí indicados son defaults del MVP, no observaciones sobre el sitio ni sobre su infraestructura. El repositorio y la configuración real todavía deben auditarse.

### Resultado esperado

- Homepage → participación → invoice Lightning → pago verificado → ranking actualizado.
- Un participante puede sumar sats y recuperar el liderazgo varias veces durante una ronda.
- Reset diario UTC, histórico, admin, moderación y trazabilidad de cada pago.
- El precio de BTC y los widgets siguen funcionando aunque falle Sats Bid.

## 2. Propuesta de valor y alcance

Cada pago compra participación y exposición competitiva durante una ronda; no reserva una posición ni un tiempo mínimo de exposición. Todos los pagos válidos cuentan aunque no alcancen para liderar. Ser superado no devuelve el pago. No hay premios, rendimientos, saldo retirable ni distribución de los sats entre participantes.

Los sats recibidos pertenecen al operador de priceb.tc. La política comercial del MVP es pagos finales y sin reembolsos automáticos por posición, fin de ronda o moderación. Los errores operativos y pagos anómalos tienen un procedimiento manual documentado; nunca prometer que esa política elimina obligaciones aplicables.

### Incluido

- Un Top Spot y un ranking global por día UTC.
- Bids acumulativos, invoices únicas y montos enteros en sats.
- Participación sin cuenta pública, reconocida mediante cookie segura.
- Top 20 en homepage y ranking completo paginado.
- Archivo de rondas y sus resultados.
- Moderación, bloqueo de dominios y administración protegida.
- Mock de pagos, integración BTCPay, reconciliación y métricas.

### Fuera del MVP

Cuentas públicas, email/password para participantes, social login, recuperación entre dispositivos, wallets de usuarios, balances internos, on-chain, Lightning Address estática, LNURL reutilizable, tarjetas, premios, tokens, NFTs, revenue sharing, referrals, autobidding, bots propios, múltiples spots, categorías, campañas, marketplace, mensajes, comentarios, likes, dashboard de anunciantes, API comercial pública, app móvil y patrocinio dentro de widgets existentes. No construir una plataforma de anuncios generalista.

## 3. Métricas de éxito

**Métrica principal: participantes que vuelven a pagar después de haber perdido el primer puesto por un pago de otro participante, dentro de la misma ronda.**

Medir dos valores juntos:

1. Cantidad de participantes únicos por ronda con al menos un `repeat_bid_after_outbid` acreditado.
2. Tasa de recuperación de participación: esos participantes / participantes únicos que perdieron el liderazgo por un pago ajeno. Con denominador cero, mostrar “sin datos”, no 0 %.

Un `repeat_bid` genérico es el segundo o posterior pago acreditado del participante en esa ronda. No equivale por sí solo a la métrica principal. `repeat_bid_after_outbid` requiere un evento previo de pérdida de liderazgo por pago, seguido de otro pago acreditado en esa ronda; no exige recuperar el puesto. Las pérdidas por moderación, reset o correcciones históricas no cuentan como outbid comercial.

Métricas secundarias: sats acreditados diarios, participantes pagadores, invoices creadas, conversión invoice→pago, pagos por participante, líderes distintos, cambios de líder por pagos, tiempo de confirmación y porcentaje de pagos recuperados por reconciliación. Los sats son importes brutos de participación; no presentarlos como beneficio neto de costos operativos.

No inventar un objetivo comercial numérico ni detener la implementación por no tenerlo. Admin debe permitir consultar los valores por día y agregado de 7/30 días.

## 4. Reglas económicas y de ranking

### 4.1 Montos

- `MINIMUM_BID_SATS=1000` por cada invoice, incluidas recargas.
- `MAXIMUM_BID_SATS=1000000` por invoice como límite inicial configurable.
- Solo enteros positivos. Rechazar negativos, cero, decimales, notación exponencial, entradas fuera de rango y valores no representables.
- Guardar montos como enteros de 64 bits; en JSON, usar strings decimales para todos los campos monetarios y totales. Nunca usar coma flotante para conversiones BTC/sats.
- Las tarifas de la wallet del pagador no aumentan su puntuación. El crédito es exactamente el monto solicitado y validado.
- Cambiar los límites afecta solo invoices nuevas; cada payment conserva el monto y reglas aceptadas al crearse.

### 4.2 Posiciones

`total_sats = SUM(payments.amount_sats)` para pagos con `settlement_status=settled` y `credit_status=credited` de ese participante/ronda.

Solo aparecen participantes con `moderation_status=approved`, `hidden=false` y total mayor a cero. Los pendientes, rechazados y ocultos conservan sus registros contables pero no son líderes ni aparecen en el ranking público.

Orden:

1. Total descendente.
2. `total_reached_sequence` ascendente: gana quien alcanzó antes ese total al acreditarse sus pagos en el servidor.
3. ID de participante ascendente como desempate determinista final.

La secuencia se asigna bajo bloqueo de la ronda durante la transacción de acreditación. No usar fecha de creación del participante ni reloj del navegador. En cada recarga cambia la secuencia del total del participante. La confirmación validada en priceb.tc fija el orden de desempate, no el momento en que alguien abrió la wallet; esta regla también aplica a pagos recuperados por reconciliación.

### 4.3 Mínimo orientativo para superar al líder

Con líder `L` y total propio `P`:

```text
additional_to_lead = max(MINIMUM_BID_SATS, L - P + 1)
```

Sin líder, el mínimo es `MINIMUM_BID_SATS`. Si el participante ya lidera, ofrecer “Add sats”, sin afirmar que necesita superar su propio total. Si el monto calculado supera el máximo por invoice, informar que requiere varios pagos; cada uno cuenta y ninguno reserva posición.

Los botones rápidos seleccionan mínimo orientativo + 1 / + 1.000 / + 5.000 / + 10.000 sats; el input inicial contiene el mínimo orientativo. Mostrar siempre el monto final a pagar y respetar el máximo. Se permite ingresar un monto inferior al necesario para liderar si cumple el mínimo de participación.

### 4.4 Ejemplo obligatorio

| Acción confirmada | A | B | Líder |
|---|---:|---:|---|
| A paga 10.000 | 10.000 | 0 | A |
| B paga 12.000 | 10.000 | 12.000 | B |
| A agrega 3.000 | 13.000 | 12.000 | A |

Dos invoices concurrentes siguen siendo válidas aunque cambie el líder antes de pagarse. No invalidar una invoice porque dejó de alcanzar para el primer puesto.

## 5. Rondas y corte UTC

### 5.1 Identidad de la ronda

Una ronda abarca el intervalo semiabierto `[00:00:00 UTC, 00:00:00 UTC del día siguiente)`. `round.date` es única. La base de datos/servidor determina el tiempo; la UI recibe `server_time` y `ends_at` para corregir su countdown. A las 00:00 UTC se muestra inmediatamente una ronda nueva, vacía, con nuevos participantes de ronda.

No poner totales antiguos en cero ni borrar filas. Conservar cada ronda y sus pagos; las identidades de navegador pueden continuar, pero no arrastran puntos. La creación diaria usa upsert con restricción única: debe funcionar tanto desde una tarea programada como desde la primera lectura o escritura del día si esa tarea no se ejecutó.

Estados de ronda: `open`, `closing`, `closed`. Que una fila vieja todavía diga `open` nunca permite crear un bid fuera de su intervalo temporal.

### 5.2 Invoices cerca de medianoche

- TTL nominal de invoice: 10 minutos.
- No crear invoices durante los últimos 120 segundos de la ronda (`BID_CUTOFF_SECONDS`). Mostrar cuenta regresiva hasta la siguiente ronda; el ranking sigue actualizándose.
- Antes de ese corte, limitar la expiración efectiva al menor de TTL nominal y tiempo restante hasta `ends_at - 60 segundos`.
- El adapter debe expresar ese límite usando las capacidades reales del proveedor, redondeando hacia abajo. Releer la expiración devuelta y la expiración BOLT11. No entregar una invoice que exceda el límite. Si la versión/configuración no permite cumplirlo, aplicar un corte anterior conservador; documentarlo y probarlo.
- El frontend oculta QR y deshabilita copiar/abrir al expirar. Esto no cancela copias de BOLT11 guardadas previamente; el backend conserva la validación temporal.

### 5.3 A qué día pertenece un pago

`payment.round_id` queda fijado al crear el bid y nunca se reasigna. Para acreditar automáticamente, el pago debe haberse recibido dentro de la ronda y antes de la expiración efectiva de esa invoice, según evidencia autenticada del proveedor. No usar la hora de recepción del webhook como hora del pago.

Un pago recibido válidamente antes del corte, cuyo webhook llega después de medianoche, se acredita a su ronda original. Jamás suma a la ronda nueva. Si falta una fecha fiable o el proveedor informa pago tardío, queda `review` hasta resolver la evidencia. Un pago realmente realizado después del plazo se registra como recibido sin crédito competitivo automático; no se borra ni se convierte silenciosamente en participación del día siguiente.

### 5.4 Cierre e histórico

Al terminar el día, pasar a `closing` y reconciliar invoices. La ronda nueva funciona en paralelo. Intentar cierre a los 5 minutos (`ROUND_CLOSE_GRACE_SECONDS=300`); solo marcar `closed` si se consultaron las invoices relevantes y no quedan creaciones inciertas, pagos pendientes de verificación o excepciones sin resolver.

Una caída de BTCPay puede mantener el histórico “Provisional — confirming payments”. No inventar un ganador definitivo. Una anomalía tardía, parcial o excedida puede darse por revisada sin crédito mediante resolución administrativa auditada.

Si más tarde aparece evidencia válida de un pago a tiempo, permitir una corrección del archivo: usar el mismo servicio de acreditación, incrementar `result_revision`, guardar antes/después, recalcular resultado y mostrar “Resultado corregido”. No cambiar registros en silencio ni contaminar métricas de liderazgo en vivo con estos cambios retroactivos.

## 6. Experiencia y diseño

### 6.1 Homepage

Mantener estilo y navegación actuales. Jerarquía: precio BTC → Top Spot → CTA → ranking → histórico. Diseño minimalista, legible, mobile first, con carácter de scoreboard Bitcoin. Evitar estética de casino o promesas financieras.

Top Spot: logo/iniciales, nombre, descripción, dominio visible, enlace y total de sats. Etiquetar como espacio pagado: “Today's paid top spot”. No sugerir endorsement de priceb.tc.

Mostrar Top 20, enlace “View full leaderboard”, countdown “Next reset in: HH:MM:SS”, sats acreditados del día y participantes visibles con al menos un pago acreditado. Si se incluyen sats de participantes moderados, rotular: “All confirmed participation payments, including moderated entries”. El número de participantes públicos cuenta solo visibles, para coincidir con el ranking.

Polling cada 5 segundos; pausar cuando la pestaña está oculta y refrescar al volver. Usar respuestas cacheables/ETag para datos públicos. La respuesta debe incluir versión de ranking y fecha de actualización. Si los datos están viejos, mostrarlo; no mostrar liderazgo como actual indefinidamente.

Sin líder:

> This spot is unclaimed. Be the first to claim today's space next to Bitcoin's price.

CTA: “CLAIM IT”. Ranking: “No bids yet”. Sin pago real de seed en producción.

### 6.2 Participación en `/bid`

Campos: nombre obligatorio, 1–40 caracteres; URL HTTPS obligatoria, máximo 2.048 caracteres; descripción obligatoria, 1–100 caracteres; logo opcional PNG/JPEG/WebP, máximo 2 MiB. Contar caracteres de texto normalizados consistentemente, recortar espacios y rechazar controles invisibles abusivos. Sin logo, generar iniciales localmente.

Mostrar líder, total propio, monto adicional orientativo, importe final, ronda UTC y expiración. Aceptación explícita de reglas con versión y timestamp antes de crear cada invoice. Mostrar esta información antes del pago:

> Your payment adds to your total for this UTC round. Another participant may outbid you at any time. Payments are final; there is no guaranteed position or display time. Content may be removed under the moderation rules. Rankings reset every day at 00:00 UTC.

Agregar aviso próximo al cierre y política de pagos tardíos. La página de reglas debe explicar también desempates, mínimo por recarga, pérdida de acceso al borrar cookies y ausencia de reembolso automático por perder una posición.

### 6.3 Identificación sin cuentas

Crear sesión anónima antes de la primera invoice para que una recarga de página pueda recuperar un pago pendiente. Generar token aleatorio de al menos 256 bits, guardar solo su hash en base y enviarlo en cookie `HttpOnly`, `Secure` en HTTPS, `SameSite=Lax`, `Path=/`, sin atributo Domain. No usar localStorage para credenciales.

La sesión permite controlar una participación por ronda; restricción única `(session_id, round_id)`. Persistencia orientativa: 30 días, renovable con actividad. El primer pago confirma la participación pública; crear la sesión no acredita nada. Sin cookie no se autoriza acceso a pagos o edición ajenos. Borrar cookies o cambiar de dispositivo crea otra identidad; no fusionar por nombre, URL, IP ni monto. Explicar esta limitación sin construir recuperación pública en el MVP.

El perfil se reutiliza como borrador al día siguiente si la sesión continúa; crea una nueva fila de participante y revalida reglas. En MVP el participante puede editar su perfil antes de emitir su primera invoice. Después, la edición de contenido corresponde al admin y queda auditada; puede seguir haciendo recargas sin cambiar contenido.

### 6.4 Pantalla de pago

Mostrar QR BOLT11, texto copiable, “Copy invoice”, enlace `lightning:` validado, monto y countdown. Permitir reabrir el pago desde la misma sesión. Los botones no certifican el pago.

Estados UX: creando invoice; esperando pago; verificando; pago recibido/acreditado; invoice expirada; fallo de creación; verificación demorada; pago recibido en revisión; participación moderada. No llamar “fallido” a un timeout del proveedor si el pago pudo haberse recibido.

Consultar el estado local cada 2 segundos mientras el modal está activo, con backoff hasta 10 segundos si hay errores. El endpoint no debe generar una llamada a BTCPay por cada poll. Al acreditarse, actualizar automáticamente total, posición y líder en un máximo objetivo de 10 segundos, con infraestructura saludable.

QR legible con margen, contraste y tamaño suficiente; acciones accesibles por teclado, foco atrapado y restaurado en modal, etiquetas de inputs, errores asociados y aviso de estado mediante aria-live. No anunciar todo el leaderboard cada 5 segundos. Sin scroll horizontal a 360 px.

### 6.5 Histórico y reglas

- `/history`: días recientes paginados, ganador o “No eligible participants”, total acreditado y estado provisional/final/corregido.
- `/day/YYYY-MM-DD`: fecha UTC, ganador visible, ranking completo paginado, total, participantes y revisión de resultado.
- `/leaderboard`: ranking completo del día, si no existe una ruta equivalente.
- `/rules`: funcionamiento, pagos, tiempo UTC, moderación y contacto del operador configurado.

Un participante ocultado debe desaparecer también de links, logos y textos del histórico público. Conservar su evidencia en admin. Recalcular el líder elegible sin eliminar su pago. Una desocultación puede restituir posición; no contar estos cambios como outbid.

## 7. Arquitectura y preservación del sitio

Auditar primero framework, rutas, despliegue, fuente del precio, caché, widgets/embeds, scripts, base de datos, autenticación, tareas programadas y tests. Registrar baseline de comportamiento y capturas de homepage/widgets. No se presupone tecnología concreta.

Reutilizar el backend y DB si permiten transacciones y restricciones. Si falta persistencia, preferir PostgreSQL administrado; Supabase es una opción de hosting, no un requisito adicional. Si el sitio es estático, agregar un backend pequeño compatible con su hosting sin migrar el frontend entero. Adaptar SQL/locks a la base existente y demostrar las mismas invariantes.

Separar:

```text
UI precio/widgets ── servicio de precio existente
UI Sats Bid ──────── API de rondas/participantes/pagos ── DB
                              │
                       PaymentProvider
                         /          \
              MockPaymentProvider   BTCPayPaymentProvider
                                           │
                                     BTCPay Store
                                           │
                                   nodo/wallet Lightning

Webhook firmado ── inbox durable ── worker de verificación/acreditación
Scheduler ──────── reconciliación y cierre de rondas
```

Un monolito modular con worker/tareas del hosting es suficiente. No introducir microservicios, Redis, colas externas o WebSockets si la infraestructura existente y una cola en DB resuelven el caso. No mantener transacciones SQL abiertas durante llamadas HTTP al proveedor.

Feature flags separados para render de Sats Bid y nuevas invoices. Apagar nuevas invoices debe mantener webhooks, consultas privadas y reconciliación. Un error de DB de bidding no puede impedir renderizar el precio. No cambiar contratos, URLs, parámetros, tamaños, caché o scripts de widgets existentes; no agregarles publicidad.

Preservar SEO existente, canonical y metadatos que funcionen. Como fallback: título `Bitcoin Price Live — BTC/USD | priceb.tc`; descripción `Live Bitcoin price, BTC tools and a daily Lightning-powered leaderboard.` No reemplazar metadata existente sin revisar el efecto. Contenido público renderizado en servidor cuando el stack lo soporte; enlaces pagados con `rel="sponsored ugc noopener noreferrer"`. Checkout, sesión y admin sin indexación ni caché pública.

## 8. Contrato PaymentProvider

Contrato conceptual en TypeScript; implementar equivalente en el lenguaje existente. Los tipos pertenecen al dominio del producto y no deben filtrar DTOs de BTCPay a la UI.

```ts
type Sats = string; // entero decimal canónico; aritmética exacta internamente
type ProviderState = 'new' | 'processing' | 'settled' | 'expired' | 'invalid';

interface InvoiceSnapshot {
  provider: 'mock' | 'btcpay';
  invoiceId: string;
  storeId: string;
  bidId: string;
  state: ProviderState;
  additionalStatus?: string;
  requestedSats: Sats;
  receivedSats: Sats;
  paymentMethod: 'lightning' | 'unsupported';
  network: string;
  expiresAt: string;
  receivedAt?: string; // evidencia del pago, no timestamp del webhook
  verifiedPaymentIds: string[];
  manuallyMarked: boolean;
  bolt11?: string;
  checkoutUrl?: string;
}

interface VerifiedWebhook {
  deliveryId: string;
  originalDeliveryId?: string;
  eventType: string;
  storeId: string;
  invoiceId: string;
}

interface PaymentProvider {
  createInvoice(input: {
    bidId: string;
    participantId: string;
    roundId: string;
    amountSats: Sats;
    expiresNoLaterThan: string;
  }): Promise<InvoiceSnapshot>;
  getInvoice(invoiceId: string): Promise<InvoiceSnapshot>;
  findInvoicesByBidId(bidId: string): Promise<InvoiceSnapshot[]>;
  verifyWebhook(rawBody: Uint8Array, headers: Headers): VerifiedWebhook;
}
```

`verifyWebhook` verifica firma y esquema antes de devolver IDs; no acredita. `getInvoice` incluye las consultas adicionales necesarias para comprobar pagos reales. `findInvoicesByBidId` resuelve respuestas de creación perdidas usando un identificador externo único; si la API no ofrece filtro exacto, paginar una ventana de creación acotada y comparar metadata. No asumir idempotencia nativa que la versión instalada no garantice.

El adapter convierte unidades, normaliza estados, impone timeout y valida el esquema. Un estado nuevo/desconocido o datos incompletos producen revisión, nunca crédito. No exponer una operación pública `markAsPaid` ni permitir que la UI seleccione provider, red, store o invoice externa.

## 9. BTCPay y validación de pagos

### 9.1 Integración verificada y compatibilidad

Usar Greenfield: crear mediante `POST /api/v1/stores/{storeId}/invoices`, consultar con `GET /api/v1/stores/{storeId}/invoices/{invoiceId}` y obtener detalles en su subrecurso `/payment-methods`. Restringir checkout a `BTC-LN`; obtener BOLT11 del método Lightning. Autenticación `Authorization: token …`. Comprobar campos, unidades y permisos contra `/docs` de la instancia instalada, guardar versión y fixtures sanitizados. Referencia: [API Greenfield](https://docs.btcpayserver.org/API/Greenfield/v1/).

Enviar el precio denominado en BTC con conversión decimal exacta: 10.000 sats → `"0.00010000"`; nunca usar el feed BTC/USD para cobrar. Guardar `bid_id`, `participant_id`, `round_id` como metadata propia y `bid_id` como referencia de pedido. No incluir cookies ni datos de sesión. Verificar con un contract test que la invoice efectivamente pide el monto esperado, sin método alternativo ni conversión fiat. El backend es quien crea la invoice; la redirección del checkout no demuestra un pago. Referencia: [guía de integración](https://docs.btcpayserver.org/Development/ecommerce-integration-guide/).

BTCPay distingue `New`, `Processing`, `Settled`, `Expired` e `Invalid`; puede indicar pago parcial, tardío, excedente o marcado manualmente. Lightning normalmente se liquida inmediatamente. **`Settled` es necesario pero no suficiente para este producto:** una invoice marcada manualmente no prueba recepción de dinero. Referencia: [estados de invoices](https://docs.btcpayserver.org/Invoices/).

### 9.2 Creación de un bid

1. Validar sesión, CSRF/Origin, perfil aprobado, ronda/corte, monto, límites y aceptación de reglas.
2. Requerir `Idempotency-Key` del cliente y guardar payment local en `creating`, con payload hash, monto, participante y ronda inmutables.
3. Aplicar exclusión por participante: máximo una invoice activa (`creating`, `creation_unknown`, `pending`, `processing`) a la vez. Solicitud diferente con una activa devuelve conflicto y permite recuperarla.
4. Fuera de la transacción, llamar al adapter con `bid_id=payment.id` como referencia única.
5. Guardar invoice ID, snapshot y expiración antes de devolver BOLT11. Un webhook que llegue antes debe poder esperar en inbox hasta completar el vínculo.
6. Misma idempotency key y mismo payload devuelven el mismo recurso, incluso si está en creación; mismo key con otro payload devuelve 409. No emitir otra invoice por doble click, retry de red o refresh.
7. Si el resultado de creación es incierto, marcar `creation_unknown`, devolver 202 y reconciliar por bid ID. No volver a ejecutar un POST a ciegas. Si se encuentran múltiples invoices, conservar todas las referencias como incidencia, no elegir por monto ni mostrar una arbitraria. Resolver la ambigüedad antes de permitir otra invoice.
8. Solo marcar `failed` cuando se sabe que no existe una invoice cobrable. Si no se puede demostrar, mantener la incidencia y avisar al operador.

Una invoice expirada no se recicla. El botón para reintentar genera un nuevo bid con nueva key, revalida ronda y monto. Las invoices viejas siguen registradas para detectar pagos tardíos.

### 9.3 Recepción del webhook

Ruta canónica `POST /api/webhooks/btcpay`. Capturar bytes originales antes de parsear. `BTCPay-Sig` contiene `sha256=` más HMAC-SHA256 del body con el secreto del webhook. Validar formato/longitud y comparar en tiempo constante; no reserializar JSON ni comparar objetos. Referencia: [ejemplo oficial de validación](https://docs.btcpayserver.org/Development/GreenFieldExample-NodeJS/).

Reglas de la aplicación:

- Rechazar firma ausente/incorrecta con 401, payload malformado con 400 y body mayor a 256 KiB con 413. No imprimir secretos, firma esperada o payload completo en errores.
- Luego de autenticar, verificar store configurada y campos requeridos. Encolar de forma durable antes de responder 2xx; ante fallo de persistencia devolver 503 para permitir redelivery.
- Deduplicar delivery ID. `originalDeliveryId` ayuda a correlacionar reenvíos, pero la idempotencia definitiva está en el payment y sus créditos.
- Suscribir `InvoiceSettled`, `InvoiceProcessing`, `InvoiceExpired`, `InvoiceInvalid` y eventos de recepción de pago soportados por la instancia. Cualquiera solo dispara una consulta autenticada; el nombre del evento no acredita por sí solo.
- Un evento válido desconocido se registra como ignorado sin cambiar contabilidad. Una invoice no vinculada queda en cuarentena/reintento; nunca crear un participante a partir del webhook.
- No rechazar automáticamente reenvíos legítimos por antigüedad: las consultas actuales, la deduplicación y las invariantes evitan replay con doble crédito.

### 9.4 Verificación server-side obligatoria

El worker consulta la invoice usando las credenciales propias y el store configurado. Debe comprobar en conjunto:

1. Provider/store/red correctos e invoice ID vinculada al payment local.
2. Referencias de bid, participante y ronda coherentes con DB. DB es autoridad de la asociación; metadata no puede cambiar propietario ni monto.
3. Monto solicitado convertido exactamente a sats igual al monto local.
4. Estado actual `Settled`, sin marca manual, y evidencia de pago Lightning liquidado con identificadores verificables.
5. Monto realmente recibido en Lightning exactamente igual al esperado; comprobar unidades de los detalles del método. No sumar pagos on-chain ni tarifas de routing.
6. Tiempo de recepción válido según sección 5. No sustituir campos faltantes con `now()`.

Monto insuficiente, excedente, método incorrecto, marca manual, referencia inconsistente, estado desconocido o pago tardío: `credit_status=review`, sin crédito automático. Guardar evidencia y motivo. No confundir “el dinero llegó” con “el pago puede sumar al ranking”. La revisión no habilita al admin a inventar un `Settled` ni cambiar el monto; puede reconsultar evidencia y resolver sin crédito las excepciones no elegibles.

### 9.5 Acreditación exactamente una vez

Toda ruta —webhook, reconciliación o reintento administrativo— llama al mismo servicio. Tras verificar al proveedor, ejecutar una transacción breve con bloqueo de ronda y payment en orden consistente:

```text
Si ya existe crédito para payment_id: devolver resultado actual.
Revalidar asociación, elegibilidad temporal y snapshot verificado.
Asignar sequence de acreditación dentro de la ronda.
Marcar settlement_status=settled, credit_status=credited, credited_at.
Guardar evidencia de pago e identificadores únicos del proveedor.
Actualizar agregado reconstruible y total_reached_sequence del participante.
Recalcular líder elegible.
Insertar eventos de negocio/outbox con claves únicas.
Commit.
```

Una falla revierte todas las mutaciones. Webhook y scheduler concurrentes no pueden sumar dos veces, perder una recarga ni emitir dos cambios de líder. Mantener unicidad del crédito por payment y de identificadores de pago externo dentro del provider/store.

Los totales se reconstruyen desde payments acreditados; una caché nunca es la única evidencia. Una observación posterior contradictoria no elimina un crédito silenciosamente: abrir incidencia y auditar cualquier corrección. No ofrecer controles de edición libre de totales o estados contables.

### 9.6 Estados locales

Separar los campos para no mezclar creación, observación del proveedor y contabilidad:

| Campo | Valores | Uso |
|---|---|---|
| `creation_status` | creating, ready, creation_unknown, failed | Si existe una invoice y pudo vincularse |
| `provider_status` | valor original + normalizado | Última observación autenticada |
| `settlement_status` | pending, processing, settled, expired, invalid | Situación verificada del pago |
| `credit_status` | uncredited, credited, review, excluded | Efecto competitivo |

`Expired` puede requerir revisión posterior si aparece evidencia de recepción; no considerarlo motivo para borrar el registro o dejar de reconciliar. Un HTTP timeout solo actualiza error/reintento, nunca transforma un pago en inexistente.

## 10. Reconciliación, jobs y recuperación

Implementar tareas idempotentes con lease/bloqueo para múltiples instancias. Frecuencia inicial: cada 60 segundos. Usar la misma verificación y acreditación de la sección 9.

- Recuperar `creating` abandonados y `creation_unknown` por referencia externa.
- Procesar inbox y consultar invoices pendientes/procesando o con errores.
- Reconsultar expiradas, inválidas y revisiones de las últimas 48 horas; no confiar solo en webhooks.
- Auditar diariamente invoices locales y del store de los últimos 7 días, con paginación y filtro por referencia de priceb.tc. Detectar huérfanas en ambas direcciones y diferencias de montos/estados. Admin permite auditar un intervalo anterior.
- Actualizar rondas y completar cierres; reconstruir y comparar agregados diariamente.
- Reintentar con backoff exponencial y jitter, timeout HTTP de 10 segundos, respetando 429/Retry-After. Tras 10 fallas consecutivas mover a revisión operativa y alertar; no descartar el trabajo. La auditoría programada puede volver a intentar.
- Si BTCPay no responde, conservar el pago pendiente y mostrar “Verification delayed”. Una caída no acredita ni descuenta sats.

El job debe procesar páginas acotadas, persistir cursor y evitar que una invoice defectuosa bloquee otras. Registrar última ejecución/éxito, cola pendiente, antigüedad del elemento más viejo y motivo de error sanitizado. No depender de una pestaña abierta para completar pagos o resets.

## 11. Modelo de datos

Nombres orientativos; implementar tablas equivalentes, migraciones versionadas, claves foráneas e índices. IDs opacos no secuenciales para exposición pública. Timestamps UTC con zona; montos BIGINT no negativos. Nunca hacer cascada de borrado desde participante a pagos.

| Tabla | Campos esenciales y restricciones |
|---|---|
| `rounds` | id, date UNIQUE, starts_at, ends_at, status, credit_sequence, current_leader_id nullable, closed_at, result_revision, created_at; check ends_at > starts_at |
| `participant_sessions` | id, token_hash UNIQUE, created_at, expires_at, revoked_at, last_seen_at; no token en claro |
| `participants` | id, session_id, round_id, name, description, url, normalized_domain, logo_asset_id, moderation_status, moderation_reason, hidden, rules_version, created_at, updated_at; UNIQUE(session_id, round_id), UNIQUE(id, round_id) |
| `payments` | id (=bid_id), participant_id, round_id, provider, provider_store_id, provider_invoice_id nullable, amount_sats, creation_status, provider_status, additional_status, settlement_status, credit_status, requested_expires_at, expires_at, provider_received_at, verified_at, credited_at, credit_sequence, rules_version, rules_accepted_at, last_checked_at, next_retry_at, retry_count, review_reason, resolved_at, resolution_reason, created_at |
| `provider_payment_evidence` | id, payment_id, provider, store_id, external_payment_id, amount_sats, method, received_at, verified_at, sanitized_snapshot; UNIQUE(provider, store_id, external_payment_id) |
| `invoice_references` | provider, store_id, invoice_id UNIQUE por provider/store, bid_id, disposition canonical/orphan/duplicate, discovered_at; conserva anomalías de creación |
| `idempotency_requests` | session_id, scope, key_hash, request_hash, payment_id, state, created_at; UNIQUE(session_id, scope, key_hash) |
| `webhook_inbox` | id, provider, store_id, delivery_id, original_delivery_id, invoice_id, event_type, body_hash, sanitized_payload, received_at, processed_at, attempt_count, next_retry_at, error_code; UNIQUE(provider, store_id, delivery_id) |
| `participant_totals` | participant_id UNIQUE, round_id, total_sats, total_reached_sequence, updated_at; proyección reconstruible, opcional si queries directas bastan |
| `domain_events` | id, unique_event_key UNIQUE, round_id, participant_id nullable, payment_id nullable, type, reason, round_sequence, occurred_at, payload mínimo; funciona como outbox durable |
| `blocked_domains` | normalized_domain UNIQUE, include_subdomains, reason, created_by, created_at, disabled_at |
| `moderation_actions` | id, participant_id, admin_id, action, reason, before_json, after_json, created_at |
| `admin_sessions` | id, token_hash UNIQUE, admin_identity, expires_at, revoked_at, created_at; puede reutilizar auth existente |
| `audit_log` | id, actor, action, entity_type, entity_id, reason, before_json, after_json, correlation_id, created_at; solo append |
| `assets` | id, storage_key UNIQUE, mime, byte_size, width, height, session_id, moderation_status, created_at |
| `operational_settings` | key UNIQUE, value, version, updated_by, updated_at; pausa de nuevos bids y defaults administrativos permitidos |

Payment debe tener FK compuesta `(participant_id, round_id)` → participants para impedir asociaciones cruzadas. `provider_invoice_id` tiene índice único `(provider, provider_store_id, provider_invoice_id)` cuando no sea null. Proteger la unicidad de invoice activa por participante mediante restricción/lock equivalente, incluyendo creaciones inciertas.

Índices mínimos: payments por ronda/crédito, participante, invoice externa, estado/next_retry_at; participants por ronda/visibilidad; events por ronda/secuencia y unique key; inbox por pending/next_retry_at; rounds por date. Agregados y rank deben usar la misma política de visibilidad en todas las rutas.

Datos públicos: perfil aprobado, posición, total, fecha y estadísticas. Nunca exponer tokens/hashes, session_id, invoice IDs, BOLT11, IPs, datos admin, evidencias ni metadata interna a través de queries públicas. Con Supabase, activar RLS y mantener escrituras de dinero exclusivamente en servidor; service role nunca en frontend.

## 12. API de la aplicación

JSON con montos como strings, timestamps ISO 8601 UTC y errores `{error:{code,message,request_id,details?}}`. `details` no expone secretos. Validar esquemas y paginar listas con cursor y máximo 100 elementos. Auth significa sesión propia o admin según tabla; un ID opaco no reemplaza autorización.

| Método / ruta | Acceso | Contrato mínimo |
|---|---|---|
| `GET /api/round/current` | Público | ronda, server_time, ends_at, bids_open, límites y reglas públicas |
| `GET /api/leaderboard?date=&cursor=&limit=` | Público | líder, participantes visibles, totales, versión, updated_at; default hoy y 20 |
| `GET /api/history?cursor=&limit=` | Público | resultados diarios, estado y revisión |
| `GET /api/history/:date` | Público | ronda histórica y ranking paginado |
| `POST /api/participants` | Sesión, crear si falta | perfil validado + ronda actual; creación idempotente por sesión/ronda; devuelve moderation_status |
| `GET /api/participants/me` | Sesión | perfil de esta ronda, total, posición y pago activo propio |
| `PATCH /api/participants/me` | Sesión | editar antes de primera invoice; revalidar y moderar |
| `POST /api/assets/logo` | Sesión | upload validado; devuelve asset ID propio |
| `POST /api/bids` | Sesión + CSRF + Idempotency-Key | `{amount_sats, rules_version, accepted_rules:true}`; infiere participante/ronda; 201 ready o 202 creando |
| `GET /api/payments/:id` | Dueño o admin | estado local, monto, expiración y BOLT11 vigente si corresponde; no-store |
| `POST /api/webhooks/btcpay` | HMAC | recepción durable; ninguna cookie requerida |
| `POST /api/admin/login` | Público limitado | auth admin, si no existe solución reutilizable |
| `POST /api/admin/logout` | Admin + CSRF | revoca sesión |
| `GET /api/admin/rounds` | Admin | estado, totales, incidencias, histórico |
| `GET /api/admin/participants` | Admin | filtros por ronda/estado/dominio |
| `PATCH /api/admin/participants/:id` | Admin + CSRF | approve/reject/hide/unhide/edición; reason y versión para evitar pisar cambios |
| `GET /api/admin/payments` | Admin | filtros por fechas/estado/participante/invoice, evidencia sanitizada |
| `POST /api/admin/payments/:id/reconcile` | Admin + CSRF | encola nueva comprobación; no marca pagado |
| `POST /api/admin/payments/:id/resolve` | Admin + CSRF | resolución sin crédito de anomalía documentada; no modifica monto |
| `POST /api/admin/reconcile` | Admin + CSRF | auditoría de intervalo validado y acotado |
| `GET/POST /api/admin/blocked-domains` | Admin; CSRF al escribir | listar/bloquear dominio y subdominios |
| `DELETE /api/admin/blocked-domains/:id` | Admin + CSRF | desactivar bloqueo con auditoría |
| `PATCH /api/admin/settings` | Admin + CSRF | pausar/reanudar nuevas invoices; conserva cobros pendientes |
| `GET /api/admin/analytics` | Admin | métricas por período y definiciones |
| `POST /api/internal/jobs/reconcile` | Credencial de scheduler | trabajo acotado; omitir HTTP si scheduler llama función interna |
| `POST /api/dev/payments/:id/simulate` | Solo mock + dev/test + sesión propia | emite evento mock y usa pipeline normal |

Errores de dominio mínimos: `INVALID_AMOUNT`, `ROUND_CLOSING`, `ROUND_CHANGED`, `PARTICIPANT_NOT_APPROVED`, `ACTIVE_INVOICE_EXISTS`, `IDEMPOTENCY_CONFLICT`, `PAYMENT_PROVIDER_UNAVAILABLE`, `INVOICE_CREATION_UNCERTAIN`, `FORBIDDEN`, `RATE_LIMITED`. Usar 400/422 para validación, 401/403 para auth, 404 para recursos ajenos sin revelar existencia, 409 para conflictos, 429 para límites y 503 para indisponibilidad. No retornar un QR ficticio ante error real.

## 13. Moderación

Antes de emitir invoice, validar texto plano, URL, dominio y logo. Rechazar contenido sexual explícito, malware, phishing, estafas evidentes, suplantación y contenido ilegal. No ejecutar HTML/Markdown proporcionado por participantes.

Estados: `pending`, `approved`, `rejected`; `hidden` es un control independiente de visibilidad. Default `MODERATION_MODE=auto_basic`: aprobar automáticamente solo entradas que pasan validaciones y no disparan reglas de riesgo. Esto es un filtro básico, no una certificación de seguridad del sitio enlazado. Las sospechosas quedan pendientes, las que violan reglas conocidas rechazadas. Permitir `manual` como modo operativo; ambos deben aplicar las mismas validaciones.

No cobrar mientras un perfil esté pendiente/rechazado u oculto. Si se oculta mientras existe una invoice, seguir reconociendo y conciliando un pago real; conservarlo contablemente y excluir al participante del ranking. Mostrar ese estado al propietario.

Bloquear un dominio afecta nuevas participaciones y oculta de inmediato las existentes coincidentes, incluido histórico; indicar si cubre subdominios. Normalizar host, IDN/punycode y punto final; comparar límites de dominio, no coincidencias de substring. Desbloquear un dominio no desoculta automáticamente contenido previamente moderado.

Admin puede corregir descripción/URL, siempre revalidando y registrando antes/después/motivo. Cambios de visibilidad recalculan líder y métricas públicas; los eventos registran `reason=moderation`, no outbid por pago. El historial contable y la evidencia de contenido original quedan accesibles solo al admin.

## 14. Admin y seguridad

### 14.1 Administración

`/admin` requiere autenticación server-side y autorización en cada endpoint. Reutilizar auth segura existente; si no hay, implementar un único operador con `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` y sesiones revocables. Hash Argon2id o equivalente mantenido; nunca contraseña en texto plano. Sesiones con cookie segura y expiración máxima inicial de 8 horas. Sin registro público de admins; MFA si la solución existente lo soporta.

Pantallas mínimas: ronda actual, moderación, pagos, incidencias de reconciliación, rondas históricas, dominios bloqueados, métricas y pausa de nuevas invoices. Poder seguir invoice → bid → participante → ronda desde la tabla de pagos. Mostrar diferencia entre provider Settled, crédito y visibilidad. Enlace a BTCPay solo construido desde host configurado y ID validado.

### 14.2 Controles obligatorios

- Autorización de propiedad contra IDOR; validación server-side de todos los campos y límite de body.
- CSRF y validación Origin en escrituras de navegador. CORS del mismo origen; no CORS amplio con credenciales. Webhook usa HMAC y scheduler su credencial separada.
- Rate limits compartidos entre instancias: defaults 60 lecturas privadas/minuto por sesión, 10 creaciones de participante/hora por IP, 10 bids/10 minutos por sesión y 30 por IP, 10 uploads/hora por sesión y 5 intentos de login/15 minutos por IP+identidad. Aplicar 429 con Retry-After y ajustar tras observar uso. Endpoints públicos, webhook y scheduler tienen políticas separadas; no bloquear redelivery legítimo con la cuota de usuarios.
- Solo HTTPS para enlaces públicos. Rechazar usuario/password en URL, esquemas javascript/data/file, IPs literales y hosts locales/reservados. No buscar previews ni descargar contenido del enlace; evitar SSRF. Una eventual inspección de enlaces debe ejecutarse aislada con control de DNS y redirecciones.
- Upload: verificar magic bytes y decodificación real, máximo 2 MiB y 4 megapíxeles, rechazar SVG/GIF/animación, reencodear a PNG/WebP, eliminar metadata, limitar a 512×512 y guardar con nombre aleatorio en almacenamiento no ejecutable. No servir el archivo original. Proceso con límites de memoria/tiempo.
- Escape de texto, CSP compatible con el sitio, `X-Content-Type-Options: nosniff`, protección de framing para admin. Preservar permisos de embed de widgets; no aplicar una cabecera global que los rompa.
- BOLT11: validar prefijo/red, monto y vencimiento con biblioteca mantenida antes de generar QR/enlace. No usar servicios externos para generar el QR.
- Secretos solo del servidor, nunca en bundle, URLs, analytics ni commits. API key runtime sin privilegios para retirar, pagar, administrar nodo, modificar facturas o marcar Settled. Configuración de webhooks hecha por el operador o herramienta de setup separada.
- TLS verificado hacia BTCPay; host fijo por configuración, sin destino arbitrario ni fallback a mock ante errores. Configuración inválida cierra la creación de invoices, manteniendo el sitio de precios.
- Sanitizar logs: request IDs y IDs internos; sin seed, API key, cookie, BOLT11 completo, preimage, password ni payload íntegro. No recolectar direcciones de wallet del participante.
- Backups, auditoría append-only y migraciones compatibles. Probar restore de DB en entorno separado; backup de la DB de la app no reemplaza backup de BTCPay/nodo.

Retención inicial: logs técnicos e inbox procesado sanitizado 30 días; sesiones expiradas revocadas/purgadas según política conservando la relación histórica mediante identidad pseudónima; eventos analíticos de cliente 90 días; pagos, evidencia contable mínima y auditoría sin borrado automático en MVP. No conservar IP cruda en analytics; si se usa hash temporal para rate limit, rotarlo y expirar su almacenamiento. Documentar retención real en privacidad.

## 15. Mock y desarrollo local

`PAYMENT_PROVIDER=mock` debe permitir toda la experiencia sin nodo, wallet ni credenciales. Mock persiste invoices en DB o almacenamiento de test determinista, con monto/expiración y reloj inyectable. No generar una BOLT11 que parezca pagable en mainnet: mostrar claramente “Demo payment — no real sats”.

“SIMULATE PAYMENT” solo con entorno dev/test, provider mock y habilitación explícita. El endpoint server-side aplica las mismas condiciones y auth; esconder el botón no alcanza. En producción el endpoint no existe o devuelve 404 y el arranque rechaza `PAYMENT_PROVIDER=mock` o simulación habilitada.

Simular: pago liquidado, expiración, firma incorrecta, webhook duplicado, desordenado, perdido, retrasado, fallo/timeout del provider, creación incierta y discrepancia de monto. Los eventos mock recorren inbox, verificación, transacción y analytics normales; no sumar directamente al total desde el botón.

Seed reproducible con 8 proyectos ficticios, pagos y rondas anteriores; etiquetas de demo y dominios example.com. Separar seed de desarrollo de migraciones productivas. Proveer instrucciones locales exactas adaptadas al repo: instalación, `.env`, migraciones, seed, servidor, worker y tests. Una sola máquina debe poder ejecutar el flujo completo.

## 16. Analytics e instrumentación

Eventos de cliente: `homepage_view`, `take_spot_clicked`, `bid_form_submitted`, `invoice_displayed`, `invoice_copied`, `wallet_open_clicked`, `top_spot_link_clicked`. No usarlos para contabilidad; pueden faltar o repetirse.

Eventos de servidor, guardados junto al cambio de estado mediante outbox:

| Evento | Regla |
|---|---|
| `participant_created` | Una participación nueva por sesión/ronda |
| `invoice_created` | Una invoice canónica creada y vinculada |
| `payment_settled` | Pago real verificado; incluir credit_status para separar anomalías |
| `payment_credited` | Un crédito competitivo, único por payment |
| `payment_expired` | Primera expiración observada; una expiración no implica que nunca pueda aparecer un pago tardío |
| `leader_changed` | Cambio de líder elegible; incluir from/to y reason payment/moderation/reset/reconciliation |
| `participant_outbid` | Anterior líder visible desplazado por pago de otro participante en ronda abierta |
| `repeat_bid` | Segundo o posterior crédito del participante en la ronda |
| `repeat_bid_after_outbid` | Primer o posterior crédito tras perder liderazgo por pago; agregado principal deduplica participante/ronda |
| `leader_reclaimed` | Participante previamente desplazado vuelve al primer puesto por pago propio |
| `payment_reconciled` | Recuperación por job de estado que faltaba localmente |
| `moderation_action` | Cambio administrativo de contenido/visibilidad |

Payload mínimo: event_id, round_id, participant_id pseudónimo si aplica, payment_id si aplica, monto necesario, timestamp, source, reason y secuencia. Prohibido token de sesión, IP, BOLT11, credenciales y texto libre con datos personales. Los eventos de reconciliación histórica no fabrican una pérdida de liderazgo que nunca fue mostrada en vivo.

Exportación al proveedor analítico mediante outbox reintentable con event_id; el proveedor debe deduplicar o las consultas hacerlo explícitamente. Admin calcula métricas de pagos desde DB/eventos propios, incluso si analytics externo está apagado. Fallas de analytics nunca revierten pagos. La sección pública “Today's battle” es opcional y solo se agrega si no demora lo esencial.

## 17. Variables de entorno y configuración

Generar `.env.example` con placeholders vacíos para secretos y descripción de cada variable. Los nombres se pueden adaptar a convenciones existentes conservando sus funciones. No crear credenciales reales en el repo.

```dotenv
APP_ENV=development
PUBLIC_SITE_URL=http://localhost:3000
DATABASE_URL=

SATS_BID_ENABLED=true
BIDS_ENABLED=true
PAYMENT_PROVIDER=mock
MOCK_PAYMENTS_ENABLED=true
MOCK_WEBHOOK_SECRET=

MINIMUM_BID_SATS=1000
MAXIMUM_BID_SATS=1000000
INVOICE_TTL_SECONDS=600
BID_CUTOFF_SECONDS=120
INVOICE_END_BUFFER_SECONDS=60
ROUND_CLOSE_GRACE_SECONDS=300
LEADERBOARD_POLL_SECONDS=5
RECONCILIATION_INTERVAL_SECONDS=60
PROVIDER_HTTP_TIMEOUT_SECONDS=10

BTCPAY_URL=
BTCPAY_API_KEY=
BTCPAY_STORE_ID=
BTCPAY_WEBHOOK_SECRET=
BTCPAY_NETWORK=mainnet

ADMIN_EMAIL=
ADMIN_PASSWORD_HASH=
ADMIN_SESSION_SECRET=
JOB_AUTH_SECRET=
SUPPORT_CONTACT_URL=
RULES_VERSION=1.0
MODERATION_MODE=auto_basic

LOG_LEVEL=info
ANALYTICS_ENABLED=false
ANALYTICS_PROVIDER=
ANALYTICS_SERVER_KEY=
```

Agregar variables de almacenamiento de logos, auth, monitoreo y analytics únicamente según los servicios realmente elegidos; documentarlas en `.env.example` y README. Reutilizar variables existentes de precio/widgets; no reemplazarlas sin necesidad.

Validación de arranque:

- Producción exige HTTPS, provider BTCPay, simulación false, secretos presentes, store/red explícitos, admin y contacto configurados antes de abrir pagos.
- Valores numéricos positivos y coherentes: mínimo ≤ máximo, TTL/corte/buffer compatibles. Secretos independientes, fuertes y sin defaults inseguros.
- Solo configuración deliberadamente pública puede serializarse hacia la UI. Los prefijos de variables públicas propios del framework nunca se usan para secretos.
- `BIDS_ENABLED` funciona como límite global; admin puede pausar dentro de ese límite pero no sobrepasar un apagado de entorno.
- Mantener lectura de pagos y reconciliación cuando se pausa la creación. No borrar DB al cambiar provider; cada payment conserva provider/store original. Entornos mock, staging y producción usan DB y stores separados.

## 18. Wallet y operación real

### 18.1 Destino de los sats

```text
Wallet Lightning del usuario
        ↓ paga una BOLT11 única
BTCPay Store de priceb.tc
        ↓ conectada a
Nodo/wallet Lightning del operador
```

BTCPay coordina invoices y observa su pago; no debe confundirse la API key de la web con una wallet. Puede conectarse con distintas configuraciones Lightning, incluidas opciones propias o servicios custodiales compatibles. La elección determina quién controla claves y liquidez. Referencia: [Lightning en BTCPay](https://docs.btcpayserver.org/LightningNetwork/).

Decisión operativa previa al lanzamiento: el operador elige instancia BTCPay y backend Lightning compatibles, documenta custodia y responsables, y prueba recepción. La web solo recibe API key limitada y secreto de webhook. Seed, private keys, macaroons con poder de gasto y credenciales del nodo no se entregan al frontend, al repo ni al agente que implementa la web.

### 18.2 Setup

1. Disponer de instancia BTCPay con HTTPS, versión mantenida, acceso administrativo protegido y backups.
2. Crear store dedicada a priceb.tc y conectar su recepción Lightning; verificar red correcta y capacidad de recepción suficiente para el máximo por invoice.
3. Restringir estas invoices a Lightning y monto exacto. No habilitar cobros on-chain como fallback.
4. Crear API key limitada a crear/ver invoices y las consultas estrictamente necesarias de la misma store. Verificar nombres exactos de permisos por endpoint en la versión instalada. Configurar webhooks por separado; no dejar permisos de setup en runtime.
5. Crear webhook HTTPS hacia `/api/webhooks/btcpay`, con secreto independiente y redelivery activo. Guardarlo en el entorno privado.
6. Ejecutar comprobaciones de creación, BOLT11, monto, expiración, lectura del pago y metadatos. No dar por hecho que un checkout URL ya contiene una BOLT11 utilizable.
7. Ensayar en entorno separado, después realizar un pago real de importe bajo autorizado por el operador. Registrar evidencia sanitizada de recepción en BTCPay y un único crédito en la app.
8. Probar caída del webhook, recuperación por scheduler, reset UTC y pausa de nuevas invoices antes de abrir al público.

### 18.3 Operación cotidiana

Monitorear disponibilidad del nodo, capacidad entrante, errores al crear invoices, webhook, cola y diferencias de conciliación. Recibir por Lightning requiere capacidad de recepción, no solo saldo total. La gestión concreta depende del backend elegido. Referencia: [operación Lightning](https://docs.btcpayserver.org/LightningNetwork/).

Definir un máximo operativo de fondos en la wallet caliente y un procedimiento manual periódico para retirar excedentes, preservando liquidez. El destino de reserva puede ser una wallet on-chain/cold storage, pero mover fondos desde Lightning requiere el mecanismo admitido por el setup; no implementar barridos, swaps ni retiros automáticos en este MVP.

Runbook obligatorio:

| Incidente | Respuesta |
|---|---|
| Nodo/BTCPay indisponible o sin recepción | Pausar nuevas invoices, mantener precio/widgets, mostrar indisponibilidad y recuperar pagos existentes |
| Webhook falla | Mantener inbox/reintentos; reconciliar por API; verificar secreto y entrega sin duplicar créditos |
| App/DB estuvo caída | Restaurar servicio, auditar invoices por referencias del período y cerrar rondas pendientes |
| Creación incierta/huérfana | Buscar por bid ID, asociar solo con evidencia completa; mantener anomalías visibles |
| Pago tardío/parcial/excedido | Registrar fondos y motivo sin crédito automático; operador resuelve con evidencia y contacto de soporte |
| Contenido peligroso | Ocultar, bloquear dominio si corresponde, recalcular visibilidad y conservar auditoría/pagos |
| Credencial comprometida | Pausar nuevas invoices, rotar/revocar API key o secreto, auditar eventos y reanudar tras verificación |
| Corrección de histórico | Registrar motivo y revisión, reconstruir resultado y rotular corrección |

Alertas iniciales: ningún éxito de reconciliación en 5 minutos; pago pendiente de verificación por más de 5 minutos; creación incierta; invoice huérfana; diferencias contables; ronda que no cerró después de 15 minutos; tasa elevada de errores de proveedor. Canal de alertas configurable y documentado, sin exigir un servicio nuevo para desarrollo local.

## 19. Testing y criterios de aceptación verificables

Usar reloj inyectable y fixtures deterministas. Tests de dinero y concurrencia son obligatorios; no se reemplazan con screenshots. Ejecutar integración contra la misma familia de DB que producción.

| Área | Casos obligatorios |
|---|---|
| Ranking | Primer pago crea líder; mayor acumulado cambia líder; recarga suma; pending/invalid/review no suman; empate usa secuencia de acreditación; participantes sin pagos no aparecen |
| Montos | Rechazar cero/negativo/fracciones/exponente/overflow; límites; conversión exacta 1 sat y 10.000 sats; tarifas no suman |
| Idempotencia | Doble click/retry devuelve misma invoice; misma key con distinto payload da 409; webhook repetido y redelivery con ID nuevo acreditan una vez |
| Concurrencia | Dos pagos a distintos participantes; dos recargas; webhook y reconciliación del mismo pago; cierre y acreditación concurrentes; sin pérdida de updates ni duplicados de eventos |
| Creación incierta | Timeout después de crear en proveedor, crash antes de vincular, webhook antes del vínculo, múltiples invoices encontradas; no emitir otra a ciegas |
| Firma | HMAC válido; ausente; secreto incorrecto; body alterado; espacios/orden JSON distintos; longitud malformada; límites de tamaño |
| Evidencia | Invoice ajena, otra store/red, metadata alterada, monto distinto, método on-chain, Settled manual, pago parcial/excedido, estado desconocido: nunca acreditar automáticamente |
| Tiempo | 23:59:59→00:00:00 UTC; medianoche local irrelevante; reloj de cliente falso; corte previo; invoice vence antes de fin; webhook tardío de pago a tiempo va a ronda original; pago fuera de plazo queda review |
| Cierre | Cron perdido; varias instancias crean una ronda; proveedor caído deja provisional; corrección posterior versiona histórico; nueva ronda sin arrastre |
| Reconciliación | Webhook perdido; expirado que después reporta pago; paginación; retries con backoff; job duplicado; huérfanas y diferencias; reconstrucción de totales |
| Sesión/auth | Recuperar invoice con refresh; otro navegador no accede; round ownership; cookie segura; token no público; CSRF; admin sin sesión rechazado; logout revoca |
| Moderación | Pending no puede pagar; ocultar líder recalcula; pago de invoice previa a ocultación se conserva; bloqueo por dominio y subdominio; ocultación histórica; desocultar sin inventar pagos |
| Contenido | XSS en nombre/descripción; URLs peligrosas; IDN; SVG y archivo con extensión falsa; imágenes enormes; metadata removida; límites de uploads |
| Mock | Flujo end-to-end, expiración y errores; endpoint inaccesible en producción aunque se invoque directamente; no fallback mock en provider real |
| Analytics | Un evento por crédito; repeat_bid genérico distinto de after_outbid; moderación/reset no cuentan como outbid; analytics caído no afecta el pago |
| Regresión | Precio/feed y cada widget/iframe/parámetro existentes mantienen comportamiento; falla de bidding no bloquea precio; CSP no rompe embeds |
| UX | Móvil 360 px, desktop, teclado, QR/copia/open wallet, estados vacíos/errores, cambio de líder automático y recuperación al volver a pestaña |

E2E principal: A paga 10.000; B paga 12.000; A agrega 3.000; A vuelve al primer puesto; se registra repeat_bid_after_outbid; refresh conserva identidad; reset vacía ronda nueva y preserva la anterior. Otro E2E oculta al líder y verifica tanto homepage como histórico.

Contract tests BTCPay con respuestas sanitizadas de la versión real: creación, detalles de método, recepción liquidada, eventos y expiración. Antes de declarar pagos reales listos, verificar una invoice de bajo monto desde una wallet compatible y confirmar que el scheduler recupera el pago si se omite el webhook.

Objetivos técnicos del MVP con infraestructura saludable: actualización visible dentro de 10 segundos tras acreditación; recuperación de webhook perdido dentro de 2 minutos; lectura de leaderboard p95 < 500 ms en staging con 50 lectores concurrentes. Registrar dataset, entorno y medición, sin afirmar resultados no ejecutados. No sacrificar la carga inicial del precio por scripts o consultas de bidding; conservar el baseline y explicar cualquier regresión.

## 20. Fases de implementación

Completar cada fase con cambios revisables y evidencia. Mantener la feature desactivada en producción hasta completar las condiciones de lanzamiento.

### Fase 1 — Auditar el producto existente

Identificar stack, hosting, feed, widgets, auth, DB, variables, rutas y pruebas. Documentar arquitectura y baseline. Proponer la mínima extensión necesaria y registrar decisiones; no reescribir por preferencia personal.

### Fase 2 — Persistencia y dominio

Migraciones, restricciones, rondas, sesiones, pagos, moderación, secuencias, inbox/outbox y adapter. Mock y seed deterministas. Tests de montos, ranking, UTC e idempotencia. Salida: dominio comprobable sin UI ni credenciales reales.

### Fase 3 — Ranking e histórico

APIs, totales, desempates, reset, estados de cierre, histórico paginado y reconstrucción. Salida: rondas completas preservadas con casos de corte probados.

### Fase 4 — Participación y pago mock

Formulario, cookie segura, upload, reglas, monto, invoice propia, simulación, polling, recargas, timeout y refresh. Salida: E2E A/B/A completo con pipeline normal de pagos.

### Fase 5 — Integrar homepage

Top Spot, CTA, countdown, ranking, estadísticas y links históricos, preservando precio/widgets y SEO. Verificación visual responsive y accesible. Salida: producto navegable y regresiones verificadas.

### Fase 6 — Admin y moderación

Auth, inspección invoice→participante, hide/unhide, aprobación/rechazo, ediciones auditadas, bloqueo de dominios, incidencias y pausa. Salida: MVP operable íntegramente con pagos simulados.

### Fase 7 — BTCPay y recuperación

Adapter real, firma sobre raw body, verificación de pago, asociación durable, reconciliación, contratos y runbook. Configurar por entorno. Sin credenciales, completar código/tests de contrato y detallar el requisito pendiente; no declarar verificación real aprobada ni frenar mejoras independientes.

### Fase 8 — Analytics

Eventos y métricas, outbox deduplicado, admin por período y distinción precisa de repeat_bid_after_outbid. Salida: métrica principal comprobada por E2E.

### Fase 9 — Preparar lanzamiento

Seguridad, concurrencia, mobile, regresiones, backups/restore, observabilidad, test de pago real, scheduler y cierre UTC. Migraciones revisadas, README, `.env.example`, instrucciones operativas y reporte honesto de checks.

Rollout: migraciones aditivas → desplegar feature apagada → smoke tests → conectar BTCPay y recibir pago de prueba → verificar evidencia → habilitar. Rollback: pausar nuevas invoices y desactivar UI si hace falta, conservando worker/webhooks, consultas de pagos, DB y auditoría. No revertir borrando pagos reales ni retirar columnas usadas por cobros pendientes.

## 21. Definition of Done

### 21.1 MVP funcional con mock

- [ ] El precio actual de BTC y todos los widgets conservan comportamiento y contratos.
- [ ] Un visitante crea participación válida, acepta reglas y recibe una invoice mock única.
- [ ] El pago simulado recorre verificación y acreditación server-side exactamente una vez.
- [ ] Aparece en ranking, puede sumar, ser superado y recuperar liderazgo automáticamente.
- [ ] Se respetan mínimo, máximo, desempate, expiración y ausencia de reserva de puesto.
- [ ] Cookie segura reconoce la participación y permite recuperar invoice pendiente.
- [ ] Reset UTC crea ronda nueva sin borrar ni trasladar datos.
- [ ] Histórico soporta provisional, cerrado y corregido.
- [ ] Admin autentica, modera, inspecciona pagos y bloquea dominios con auditoría.
- [ ] Métrica repeat_bid_after_outbid es distinguible y verificable.
- [ ] Tests obligatorios del dominio, mock, seguridad y regresión pasan.
- [ ] Migraciones, seed, `.env.example` y README permiten reproducir el flujo local.

### 21.2 MVP listo para pagos reales

- [ ] Adapter BTCPay implementado sin acoplar producto a sus DTOs.
- [ ] Invoice Lightning única por bid, monto exacto, expiración y red verificadas.
- [ ] Webhooks HMAC sobre bytes originales; recepción durable y deduplicación.
- [ ] `Settled` más evidencia real, store, monto, método, referencia y tiempo validados por API.
- [ ] Ningún dato del navegador ni marca manual de BTCPay puede fabricar crédito.
- [ ] Concurrencia, retries, creación incierta y reenvíos no duplican pagos ni eventos.
- [ ] Reconciliación recupera pagos sin webhook y detecta invoices huérfanas.
- [ ] Pagos de frontera UTC y anomalías tienen tratamiento explícito y probado.
- [ ] Mock/simulación inaccesibles en producción; sin fallback silencioso.
- [ ] Store/wallet configuradas; capacidad de recepción, backups, alertas y operador definidos.
- [ ] Pago Lightning real de bajo monto observado en BTCPay y acreditado una sola vez.
- [ ] Privilegios mínimos y secretos privados comprobados; ningún secreto en código/bundle/logs.
- [ ] Restore, pausa y rollback documentados; procesamiento de pagos existentes se conserva.
- [ ] Validación mobile, regresión de widgets y objetivos técnicos medidos con evidencia.
- [ ] No hay incidencias críticas abiertas ni checks pendientes presentados como aprobados.

**El MVP completo está terminado cuando ambas listas están cumplidas.** Si faltan credenciales, nodo o pago real, reportar “MVP mock completado; habilitación Lightning pendiente” con los requisitos concretos. No afirmar que el producto está listo para cobrar solo porque compila.

## 22. Entrega esperada de Codex al implementar

Trabajar sobre el repositorio real, respetar sus instrucciones y mantener cambios pequeños y coherentes. Resolver decisiones rutinarias con los defaults de este PRD. Si una limitación real del stack exige desviarse, documentar motivo, impacto y alternativa sin inventar funcionalidades fuera de alcance.

Dejar en el repo: implementación, migraciones, tests relevantes, seed de desarrollo, `.env.example`, README local y runbook operativo. No incorporar credenciales, seeds de wallets ni fixtures con pagos o usuarios sensibles.

El reporte final debe indicar qué funciona, arquitectura elegida, tablas y endpoints agregados, variables nuevas, comandos reales para correr local y probar mock, checks ejecutados/resultados, cómo configurar BTCPay, evidencia de pago real si ocurrió, y requisitos operativos pendientes. Diferenciar código implementado de integración verificada y de despliegue efectivo.

Prioridad permanente: **preservar priceb.tc, terminar primero el recorrido con mock y conectar Lightning real con contabilidad verificable después.**
