# UI Handoff para Codex — desde Claude

## Estado: CLAUDE_CURRENT_HANDOFF.md completado + extras

Todo lo del handoff vigente está implementado. Pasé por tres rondas de trabajo. Esto es el estado final.

---

## Qué se hizo (resumen ejecutivo)

### Reestructura web (pre-handoff)

- **`TopBar.tsx`**: barra superior única que reemplaza todos los controles flotantes. Logo, `+ Agent`, `Dashboard`, `Layout`, `Settings`, zoom, versión.
- **`App.tsx`**: layout `flex-col` → TopBar + tres columnas (sidebar izquierdo 220px | canvas flex-1 | sidebar derecho 220px). Toggle Dashboard en TopBar muestra/oculta los paneles.
- **`Dropdown.tsx`**: prop `direction: 'up' | 'down'`.

### Store de dominio frontend

- `domain/types.ts` — mirror de server/src/domain/types.ts
- `domain/reducer.ts` — `DomainState` + `domainReducer` (UPSERT_AGENTS, REMOVE_AGENT, ADD_TIMELINE, ADD_ALERTS, UPSERT_PERMISSIONS, SET_PERMISSIONS)
- `domain/selectors.ts` — selectRealAgents, selectPendingPermissions, selectRecentTimeline, selectActiveAlerts
- `domain/wsProtocol.ts` — tipos tipados para los mensajes del protocolo domain WS

### Dashboard

- `AgentCard` — nombre, fuente, estado con dot, tarea actual, permiso pendiente, barra de contexto (contextUsage), errores, tiempo relativo
- `AgentGrid` — lista de cards + PermissionPanel al pie
- `TimelinePanel` — narrativa cronológica, auto-scroll, dot de severidad
- `AlertsPanel` — alertas WARNING/ERROR, aparece solo cuando hay contenido
- `PermissionPanel` — botones Aprobar/Rechazar **activos** via `sendDomainMessage`

### Protocolo domain conectado

**`websocketClient.ts`**:

- `activeWs` module-level, asignado en `open`, limpiado en `close`
- `sendDomainMessage(msg)` — envía al servidor vía WS activo
- **Auto-reconexión**: después de una primera conexión exitosa, reconecta cada 3s al desconectarse
- Emite `CustomEvent('pixelagents:ws-disconnected')` al perder conexión
- Re-despacha `settingsLoaded` en cada reconexión (re-habilita sonidos)

**`hooks/useAgentControlCenter.ts`** — dos useEffects:

1. **Domain listener** (stable, deps vacías):
   - Maneja los 6 mensajes del protocolo domain con tipos de `wsProtocol.ts`
   - `domainSnapshot` → hydrate completo + `hasDomainSourceRef = true`
   - `domainAgentUpserted` → speech de transición de estado (standalone mode)
   - `domainAgentRemoved` → REMOVE_AGENT + limpia caches
   - `domainTimelineAppended`, `domainAlertRaised`, `domainPermissions` → despachan al reducer
   - `agentTokenUsage` → detecta umbral de contexto, genera timeline + alert + speech
   - `pixelagents:ws-disconnected` → `hasDomainSourceRef = false` (fallback a legacy bridge)

2. **Legacy bridge** (deps: legacyAgents, agentTools, agentStatuses):
   - Siempre upsertea agentes con `contextUsage` desde `contextUsageRef`
   - Cuando `hasDomainSourceRef = true`: solo upsertea (canvas/OfficeState)
   - Cuando `hasDomainSourceRef = false`: genera timeline, alerts, speech, permisos sintéticos

### Migración de speech completada

| Evento               | Antes                                          | Ahora                            |
| -------------------- | ---------------------------------------------- | -------------------------------- |
| `turn_started`       | `useExtensionMessages`                         | bridge legacy o domain listener  |
| `task_completed`     | `useExtensionMessages`                         | bridge legacy o domain listener  |
| `permission_request` | `useExtensionMessages`                         | bridge legacy o domain listener  |
| `task_failed`        | —                                              | bridge legacy o domain listener  |
| `context_warning`    | `useExtensionMessages` → `checkContextWarning` | domain listener → `speechMapper` |
| NPC speech           | independiente                                  | sin cambios                      |

`useExtensionMessages` ya no importa ni llama nada de `agentSpeech.js`.

### Lint + calidad

- Todos los `rgba()` inline reemplazados por CSS variables en `index.css`:
  - `--color-status-success-bg`, `--color-status-error-bg`, `--color-status-permission-bg`, `--color-border-faint`
- Import sort corregido en todos los archivos nuevos y en los de Codex (`agentStateStore.ts`, `eventNormalizer.ts`, `standalone.ts`, `SettingsModal.tsx`, `VoiceSettingsPanel.tsx`, `demoMode.ts`)
- Fallbacks inline en `VoiceSettingsPanel.tsx` reemplazados por variables sin fallback

### Estado final del proyecto

- `npm run lint` → ✅ sin errores
- `npx tsc --noEmit` → ✅ sin errores
- `npm run test:server` → ✅ 157/157 tests pasando
- `vite build` → ✅ sin errores (warning de chunk splitting es inofensivo)

---

## Archivos modificados/creados (total)

```
webview-ui/src/
  index.css                               ← nuevas CSS vars para dashboard
  App.tsx                                 ← 3 columnas + domain store
  websocketClient.ts                      ← activeWs + sendDomainMessage + reconexión
  components/
    TopBar.tsx                            ← nuevo header bar
    ui/Dropdown.tsx                       ← direction prop
    dashboard/
      AgentCard.tsx                       ← con contextUsage bar
      AgentGrid.tsx
      AlertsPanel.tsx
      PermissionPanel.tsx                 ← botones activos
      TimelinePanel.tsx
  domain/
    types.ts                              ← mirror server
    reducer.ts                            ← REMOVE_AGENT + SET_PERMISSIONS
    selectors.ts
    speechMapper.ts
    wsProtocol.ts                         ← tipos WS tipados
  hooks/
    useAgentControlCenter.ts              ← domain listener + legacy bridge + context
    useExtensionMessages.ts               ← limpiado de speech dev

server/src/
  domain/agentStateStore.ts              ← import sort fixed
  domain/eventNormalizer.ts              ← import sort fixed
  standalone.ts                          ← import sort fixed
```

---

## Qué queda pendiente

### Permisos reales en Claude/Codex

`domainPermissionDecision` actualiza el dashboard correctamente via WS. El ciclo completo (server recibe → broadcastea `domainPermissions` → UI actualiza) funciona. Lo que falta es que el servidor intercepte la decisión y la reenvíe al proceso CLI real.

### `contextUsage` en standalone mode

En modo standalone, `contextUsage` llega via `domainAgentUpserted` si el servidor lo emite. El servidor no lo calcula actualmente desde hooks — sería necesario parsear los token counts del output de Claude/Codex si se quiere mostrarlo en ese modo.

### `domainEvent` no consumido en UI

El servidor emite `domainEvent` (evento crudo normalizado) en cada hook. El frontend lo ignora — solo consume los mensajes derivados. Si querés un log de eventos raw o necesitás deducir algo de `domainEvent` que los otros mensajes no cubren, es el siguiente paso.

### Resolución automática de permisos en el canvas

Cuando un permiso se resuelve desde el dashboard, `OfficeState` (canvas) todavía muestra la burbuja de permiso hasta que el agente cambia de estado por el protocolo legacy. Esto es visual — no afecta la lógica — pero podría mejorar la consistencia cuando ambos protocolos corren en paralelo.
