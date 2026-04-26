# Claude Current Handoff

## Archivo vigente

Este es el unico handoff operativo vigente para Claude.

Ignorar archivos de handoff anteriores. Fueron eliminados para evitar confusion.

## Contexto actual

El backend ya avanzó hasta este punto:

- contrato de dominio en `server/src/domain/types.ts`
- normalizador de dominio en `server/src/domain/eventNormalizer.ts`
- store de dominio en `server/src/domain/agentStateStore.ts`
- protocolo WS documentado en `DOMAIN_WS_PROTOCOL.md`
- `server/src/standalone.ts` ya emite:
  - `domainSnapshot`
  - `domainEvent`
  - `domainAgentUpserted`
  - `domainAgentRemoved`
  - `domainTimelineAppended`
  - `domainAlertRaised`
  - `domainPermissions`
- `server/src/standalone.ts` ya acepta desde cliente:
  - `domainPermissionDecision`

Importante:

- la UI legacy sigue viva
- el protocolo legacy pixel-art sigue existiendo en paralelo
- la resolucion de permisos es mock solamente por ahora

## Lo que tiene que hacer Claude ahora

### 1. Conectar la UI al protocolo nuevo

Objetivo:

- consumir `domainSnapshot` al conectar
- consumir updates incrementales del dominio
- alimentar el `domainReducer` desde esos mensajes
- reducir dependencia del bridge legacy actual

Archivos esperables:

- `webview-ui/src/websocketClient.ts`
- `webview-ui/src/hooks/useAgentControlCenter.ts`
- `webview-ui/src/domain/reducer.ts`
- `webview-ui/src/domain/types.ts`

### 2. Activar Aprobar / Rechazar en UI

Objetivo:

- en `PermissionPanel`, dejar de mostrar botones deshabilitados
- enviar por WebSocket:

```json
{
  "type": "domainPermissionDecision",
  "permissionId": "...",
  "decision": "approved"
}
```

o

```json
{
  "type": "domainPermissionDecision",
  "permissionId": "...",
  "decision": "rejected"
}
```

Importante:

- esto solo actualiza el dashboard
- no controla Claude/Codex real todavia

### 3. Mover `context_warning` al dominio

Objetivo:

- sacar `checkContextWarning` como trigger directo de speech desde el flujo legacy
- representar `context_warning` como evento de dominio
- dejar que speech dev salga desde el mapper de dominio

## Restricciones

- no romper el canvas actual
- no romper los NPCs
- no sacar todavia el protocolo legacy
- no mezclar logs crudos con timeline humana
- no inventar controles reales donde todavia no existe backend seguro

## Archivos de referencia

- `PLAN_DE_ACCION.md`
- `DOMAIN_WS_PROTOCOL.md`
- `server/src/domain/types.ts`
- `server/src/domain/agentStateStore.ts`
- `server/src/domain/eventNormalizer.ts`

## Prioridad

Orden recomendado:

1. conectar `domainSnapshot` + incremental updates al frontend
2. activar Aprobar/Rechazar usando `domainPermissionDecision`
3. migrar `context_warning` al dominio
