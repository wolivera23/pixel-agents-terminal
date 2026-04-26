# Plan de Accion: Agent Control Center

## Objetivo

Evolucionar `pixel-agents-terminal` desde una oficina pixel-art reactiva a un `Agent Control Center` para observar, entender y luego controlar agentes CLI como Codex, Claude y otros procesos de terminal.

La prioridad no es reemplazar la capa visual actual, sino desacoplarla de los logs crudos y reordenar la app alrededor de un modelo operativo estable:

`Hooks / CLI events / process output -> Event Normalizer -> Central Agent State Store -> WebSocket -> Browser UI -> Cards + Timeline + Alerts + Speech + Controls`

## Diagnostico del codigo actual

### Lo que ya existe y conviene reutilizar

- `server/src/provider.ts`
  Ya define una capa de normalizacion por proveedor. Hoy el tipo `AgentEvent` es demasiado corto para el objetivo final, pero el concepto base es correcto.

- `server/src/providers/*`
  El sistema de providers para `claude` y `codex` ya resuelve instalacion de hooks, parseo de eventos y diferencias de formato por CLI.

- `server/src/server.ts`
  Ya existe un receptor HTTP confiable para hooks con autenticacion, `server.json` y soporte para compartir servidor entre ventanas/procesos.

- `server/src/standalone.ts`
  Ya funciona como bridge standalone y hoy hace tres cosas bien:
  1. instala hooks
  2. recibe eventos
  3. reenvia por WebSocket

- `webview-ui/src/websocketClient.ts`
  Ya entrega los mensajes del server a la UI usando el mismo canal semantico que usaba la extension.

- `webview-ui/src/hooks/useExtensionMessages.ts`
  Hoy concentra casi toda la traduccion `message -> estado UI`. Es grande, pero representa un punto natural de extraccion hacia un store central.

- `webview-ui/src/agentSpeech.ts`
  Ya implementa prioridades, throttle, capas separadas `dev` y `npc`, y deteccion de warning de contexto. Conviene conservarlo, pero cambiar su entrada para que consuma eventos semanticos.

- `webview-ui/src/office/engine/officeState.ts`
  Conviene mantenerlo como motor visual del mundo pixel-art. No deberia seguir siendo la fuente de verdad operativa de agentes.

- `webview-ui/src/office/components/ToolOverlay.tsx`
  Ya tiene parte del resumen visual de estado y contexto. Su logica puede reaprovecharse para overlays secundarios o modo inmersivo.

### Lo que hoy limita la evolucion

- `server/src/standalone.ts`
  Mezcla normalizacion, creacion de agentes, mapping a mensajes de UI y transporte WebSocket. Ese archivo hoy concentra demasiada responsabilidad.

- `webview-ui/src/hooks/useExtensionMessages.ts`
  Hace parsing, sincronizacion de estado, side effects visuales, audio, speech y mutacion de `OfficeState`. Es el mayor cuello de botella de mantenibilidad.

- Modelo actual de eventos
  El `AgentEvent` de `server/src/provider.ts` es util para hooks, pero no alcanza para timeline narrativo, alertas, controles, reglas de deteccion ni trazabilidad.

- Modelo actual de agente
  Hoy el estado real de un agente esta implícito entre:
  - arrays de IDs
  - `agentTools`
  - `agentStatuses`
  - `subagentTools`
  - flags dentro de `OfficeState.Character`

  Eso complica sumar cards, timeline, alertas y controles.

- Protocolo WebSocket/UI
  Hoy expone mensajes de muy bajo nivel y muy orientados a la oficina pixel-art: `agentToolStart`, `agentToolDone`, `agentToolsClear`, etc. Sirve para animacion, pero no para observabilidad de producto.

## Arquitectura propuesta

## Principio central

Separar dos capas:

1. `Operational state`
   Fuente de verdad del sistema: agentes, eventos, timeline, alertas, permisos, health.

2. `Presentation state`
   Canvas pixel-art, NPCs, speech ambiente, overlays, animaciones.

La oficina pasa a ser una vista mas del estado, no la dueña del estado.

## Backend / server

### 1. Event Normalizer

Crear una capa nueva que reciba eventos de providers y los convierta a un modelo estándar rico:

```ts
type AgentEvent = {
  id: string;
  timestamp: number;
  source: 'claude' | 'codex' | 'cli' | 'system';
  agentId: string;
  type:
    | 'agent_started'
    | 'agent_idle'
    | 'agent_action'
    | 'tool_use'
    | 'file_changed'
    | 'command_started'
    | 'command_finished'
    | 'permission_request'
    | 'permission_approved'
    | 'permission_rejected'
    | 'task_completed'
    | 'task_failed'
    | 'error'
    | 'context_warning'
    | 'loop_detected'
    | 'blocked';
  severity: 'info' | 'success' | 'warning' | 'error' | 'critical';
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
};
```

Recomendacion: no reemplazar de golpe el `AgentEvent` actual de providers. Renombrar el actual a algo como `ProviderEvent` y usar un normalizador intermedio.

### 2. Central Agent State Store

Crear un store de servidor que mantenga:

- agentes por ID
- ultimo estado
- actividad actual
- timeline reciente
- permisos pendientes
- contadores de errores
- patrones de loop/bloqueo
- buffer de eventos para clientes nuevos

Modelo sugerido:

```ts
type AgentState = 'idle' | 'running' | 'waiting_permission' | 'blocked' | 'error' | 'done';

type Agent = {
  id: string;
  name: string;
  type: 'dev' | 'npc' | 'system';
  source?: 'claude' | 'codex' | 'cli';
  state: AgentState;
  lastAction?: string;
  lastUpdate: number;
  currentTask?: string;
  contextUsage?: number;
  errorCount?: number;
  loopDetected?: boolean;
  muted?: boolean;
};

type TimelineEvent = {
  id: string;
  timestamp: number;
  agentId: string;
  severity: 'info' | 'success' | 'warning' | 'error' | 'critical';
  message: string;
  metadata?: Record<string, unknown>;
};
```

### 3. Broadcast protocol de alto nivel

Agregar un protocolo WebSocket versionado, por ejemplo:

- `snapshot`
- `agent_upserted`
- `agent_removed`
- `event_appended`
- `timeline_appended`
- `alert_raised`
- `permission_requested`
- `permission_resolved`

La UI pixel-art actual puede seguir recibiendo mensajes legacy durante una fase de compatibilidad.

## Frontend / browser

### 1. App state central

Crear un store de cliente separado de `OfficeState`. No hace falta Redux; alcanza con reducer + context o un store liviano.

Responsabilidades:

- snapshot de agentes
- timeline
- alertas
- permisos pendientes
- filtros
- seleccion de agente
- preferencias de speech por severidad

### 2. Vistas nuevas

Agregar una capa dashboard paralela al canvas:

- `Agent Cards`
- `Timeline`
- `Alerts/Health rail`
- `Permission queue`

La oficina pixel-art puede quedar:

- como panel principal si el usuario elige modo inmersivo
- o como vista secundaria/minimizada

### 3. Speech basado en eventos

`agentSpeech.ts` debe dejar de depender de triggers manuales como `triggerSpeech('task_completed')` desde handlers de mensajes de bajo nivel.

Nuevo flujo:

- store cliente recibe `AgentEvent`
- `speechEventMapper` decide si ese evento merece voz dev
- NPC speech sigue separado
- eventos `critical` interrumpen NPCs

## Archivos a reutilizar

- `server/src/server.ts`
- `server/src/providers/index.ts`
- `server/src/providers/hook/claude/*`
- `server/src/providers/hook/codex/*`
- `server/src/provider.ts` como punto de partida del contrato de providers
- `server/src/standalone.ts` como bootstrap del proceso standalone
- `webview-ui/src/websocketClient.ts`
- `webview-ui/src/agentSpeech.ts`
- `webview-ui/src/notificationSound.ts`
- `webview-ui/src/office/engine/officeState.ts`
- `webview-ui/src/office/components/ToolOverlay.tsx`
- `webview-ui/src/App.tsx` como shell inicial

## Archivos a refactorizar

- `server/src/provider.ts`
  Separar `ProviderEvent` de `DomainAgentEvent`.

- `server/src/standalone.ts`
  Extraer:
  - normalizador
  - state store
  - broadcaster

- `webview-ui/src/hooks/useExtensionMessages.ts`
  Partirlo en:
  - transporte WS/message
  - reducer/store de dominio
  - adaptador pixel-art
  - adaptador speech

- `webview-ui/src/App.tsx`
  Dejar de ser una pantalla casi exclusivamente canvas-driven. Debe pasar a orquestar layout de dashboard + canvas.

- `webview-ui/src/components/TopBar.tsx`
  Cambiar semantica de `+ Agent` y preparar acciones futuras por agente.

- `webview-ui/src/office/components/ToolOverlay.tsx`
  Reutilizar como overlay contextual, no como componente principal de estado.

## Archivos nuevos sugeridos

### Server

- `server/src/domain/types.ts`
  Tipos centrales: `Agent`, `AgentEvent`, `TimelineEvent`, `PermissionRequest`, `Alert`

- `server/src/domain/agentStateStore.ts`
  Store principal del backend

- `server/src/domain/eventNormalizer.ts`
  `ProviderEvent -> AgentEvent[]`

- `server/src/domain/timeline.ts`
  Constructor de mensajes humanos

- `server/src/domain/rules.ts`
  Deteccion de `loop_detected`, `blocked`, `context_warning`, escalacion de errores

- `server/src/domain/wsProtocol.ts`
  Tipos de mensajes socket

### Frontend

- `webview-ui/src/domain/types.ts`
- `webview-ui/src/domain/reducer.ts`
- `webview-ui/src/domain/selectors.ts`
- `webview-ui/src/domain/speechMapper.ts`
- `webview-ui/src/hooks/useAgentControlCenter.ts`
- `webview-ui/src/components/dashboard/AgentCard.tsx`
- `webview-ui/src/components/dashboard/AgentGrid.tsx`
- `webview-ui/src/components/dashboard/TimelinePanel.tsx`
- `webview-ui/src/components/dashboard/AlertsPanel.tsx`
- `webview-ui/src/components/dashboard/PermissionPanel.tsx`

## Reglas de deteccion sugeridas

### loop_detected

Heuristica inicial segura:

- misma accion normalizada o mismo `toolName + title`
- repetida 3 veces o mas
- dentro de una ventana de 60 a 120 segundos
- sin evento `task_completed`

### blocked

- agente en `running`
- sin eventos nuevos por `X` segundos
- configurable por tipo de evento
- no disparar si hay comando explicitamente largo y con heartbeat/progress

Valor inicial razonable:

- warning a los 45s
- blocked fuerte a los 90s

### context_warning

- si el provider expone tokens reales, usar eso
- si no, dejar `contextUsage` indefinido
- umbral inicial: `> 0.8`

### error escalation

- 2 errores seguidos: `warning`
- 3 o mas en ventana corta: `error`
- 4 o mas o combinacion con bloqueo: `critical`

## Orden de implementacion

## Fase 1: Contratos y store de dominio

Objetivo: introducir estructura sin romper la UI actual.

- crear tipos centrales de dominio
- renombrar el evento actual de providers a `ProviderEvent`
- crear `eventNormalizer`
- crear `agentStateStore`
- agregar tests unitarios del store y reglas

Resultado esperado:

- el server ya puede construir estado semantico aunque la UI todavia siga usando mensajes legacy

## Fase 2: WebSocket protocol dual

Objetivo: emitir estado nuevo sin romper el canvas actual.

- agregar `snapshot` y eventos incrementales
- mantener mensajes legacy durante compatibilidad
- exponer timeline y alertas por WebSocket

Resultado esperado:

- clientes nuevos pueden renderizar dashboard
- clientes viejos siguen funcionando

## Fase 3: Store cliente y dashboard basico

Objetivo: desacoplar la UI del handler actual.

- crear reducer/store frontend
- mover parsing de mensajes fuera de `useExtensionMessages.ts`
- renderizar `Agent Cards`, `TimelinePanel` y `AlertsPanel`
- mantener el canvas operativo

Resultado esperado:

- la app ya es usable como dashboard aunque el mundo pixel-art siga presente

## Fase 4: Permisos visuales y speech por eventos

- agregar `PermissionPanel`
- adaptar `agentSpeech.ts` a eventos de dominio
- separar speech dev vs NPC de manera estricta

Resultado esperado:

- las alertas y permisos ya no dependen de logs crudos ni del canvas

## Fase 5: Reglas de health y estados enriquecidos

- loop detection
- blocked detection
- error escalation
- contexto

Resultado esperado:

- cards y timeline muestran salud real del agente

## Fase 6: Arquitectura para controles futuros

- modelar acciones `pause`, `cancel`, `retry`, `send_instruction`, `approve`, `reject`
- dejar interfaces y placeholders
- no ejecutar acciones reales sin backend seguro

Resultado esperado:

- la UI ya queda preparada para controles verdaderos

## Riesgos de romper lo existente

### Riesgo 1: romper el flujo pixel-art actual

`useExtensionMessages.ts` hoy es el pegamento de casi todo. Si se reescribe de golpe, es facil romper:

- animaciones
- burbujas
- subagentes
- sonido
- estados de waiting/permission

Mitigacion:

- introducir un adaptador intermedio
- sostener protocolo legacy por una o dos fases

### Riesgo 2: duplicacion de estado

Durante la migracion va a coexistir:

- store nuevo de dominio
- `OfficeState`
- estados React actuales

Mitigacion:

- definir una sola fuente de verdad operativa: el nuevo store
- `OfficeState` solo consume proyecciones

### Riesgo 3: mismatch entre providers

Claude y Codex no emiten exactamente lo mismo.

Mitigacion:

- normalizar a eventos semanticamente pobres al principio, pero estables
- no asumir que todos tienen tokens, permisos o task names

### Riesgo 4: timeline ruidosa

Si se vuelcan todos los eventos, la timeline se vuelve ilegible.

Mitigacion:

- separar `raw event stream` de `human timeline`
- colapsar eventos tecnicos repetitivos

### Riesgo 5: falso positivo en reglas de bloqueo/loop

Mitigacion:

- arrancar con thresholds conservadores
- mostrar detecciones como heuristicas
- hacerlas configurables despues

## Criterios de aceptacion por etapa

### Contratos de dominio

- existe un tipo unificado de `AgentEvent`
- existe un store de agentes testeado
- se pueden derivar `Agent`, `TimelineEvent` y `Alert` desde eventos normalizados

### Dashboard minimo

- se ve una card por agente real
- cada card muestra nombre, source, estado, ultima accion, tarea actual, ultimo update, errores, contexto si existe, bloqueo/permisos
- la timeline narra eventos humanos, no logs crudos

### Speech

- eventos importantes dev disparan voz dev
- NPC speech sigue existiendo, pero separado
- una alerta `critical` interrumpe NPCs

### Compatibilidad

- el canvas y los agentes pixel-art siguen funcionando mientras se introduce el dashboard
- Codex y Claude siguen apareciendo como agentes reales

## Orden sugerido de commits / PRs

### PR 1: Domain contracts

- agregar tipos de dominio
- agregar store backend
- tests del store y normalizador

Bajo riesgo. No toca UI principal.

### PR 2: Server event pipeline

- integrar normalizador y store en `standalone.ts`
- emitir snapshot y protocolo nuevo
- mantener mensajes legacy

Riesgo medio. Toca backend activo, pero sin romper la UI si se mantiene compatibilidad.

### PR 3: Frontend domain store

- crear reducer/store cliente
- conectar WebSocket protocol nuevo
- no cambiar todavia el layout principal

Riesgo medio. Reduce deuda estructural.

### PR 4: Agent Cards + Timeline

- agregar dashboard visible
- mantener canvas

Riesgo medio-bajo si es aditivo.

### PR 5: Alerts + Permission queue + speech mapper

- panel de permisos
- alertas
- speech basado en eventos

### PR 6: Health rules

- blocked
- loop_detected
- error escalation
- context warning

### PR 7: Future controls scaffolding

- contratos de acciones
- botones deshabilitados o mockeados
- backend interface seguro

## Primer commit pequeno y seguro

El primer paso recomendado no es tocar la UI. Es introducir los contratos de dominio en el server sin cambiar el comportamiento visible.

Contenido del primer commit:

- crear `server/src/domain/types.ts`
- mover ahi:
  - `Agent`
  - `AgentEvent`
  - `TimelineEvent`
  - `Alert`
  - `PermissionRequest`
- renombrar el `AgentEvent` actual de `server/src/provider.ts` a `ProviderEvent`
- ajustar tipos para que los providers sigan compilando
- agregar un test minimo que valide el contrato de tipos o un normalizador trivial

Por que este commit primero:

- fija el lenguaje del sistema
- baja riesgo de refactors grandes
- no cambia flujo visual ni hooks
- habilita las siguientes PRs sin deuda conceptual

## Recomendacion final

No conviene intentar migrar directamente desde `message handlers -> OfficeState` a `dashboard` en un solo paso. El camino menos riesgoso es:

1. formalizar dominio
2. centralizar estado
3. emitir protocolo nuevo
4. montar dashboard
5. relegar la oficina a vista derivada

Eso preserva lo que hoy ya funciona y evita que la parte estetica siga bloqueando la parte operativa.
