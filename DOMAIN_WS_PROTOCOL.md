# Domain WebSocket Protocol

## Objetivo

Protocolo incremental para exponer el nuevo modelo de dominio del `Agent Control Center` sin romper el protocolo legacy pixel-art actual.

Los mensajes legacy siguen existiendo en paralelo.

## Mensajes server -> client

### `domainSnapshot`

Se envia al conectar un cliente nuevo.

```json
{
  "type": "domainSnapshot",
  "protocolVersion": 1,
  "agents": [],
  "timeline": [],
  "alerts": [],
  "permissions": []
}
```

### `domainEvent`

Evento crudo del dominio ya normalizado.

```json
{
  "type": "domainEvent",
  "event": {
    "id": "sess-1:1710000000000:tool_use",
    "timestamp": 1710000000000,
    "source": "codex",
    "agentId": "1",
    "type": "tool_use",
    "severity": "info",
    "title": "Using shell_command"
  }
}
```

### `domainAgentUpserted`

Upsert incremental del estado actual de un agente.

```json
{
  "type": "domainAgentUpserted",
  "agent": {
    "id": "1",
    "name": "backend",
    "type": "dev",
    "source": "codex",
    "state": "running",
    "lastUpdate": 1710000000000
  }
}
```

### `domainAgentRemoved`

```json
{
  "type": "domainAgentRemoved",
  "agentId": "1"
}
```

### `domainTimelineAppended`

```json
{
  "type": "domainTimelineAppended",
  "event": {
    "id": "evt-1:timeline",
    "timestamp": 1710000000000,
    "agentId": "1",
    "severity": "info",
    "message": "Backend Agent uso shell_command."
  }
}
```

### `domainAlertRaised`

```json
{
  "type": "domainAlertRaised",
  "alert": {
    "id": "evt-2:alert",
    "timestamp": 1710000000001,
    "agentId": "1",
    "severity": "warning",
    "kind": "permission_request",
    "title": "Permission required"
  }
}
```

### `domainPermissions`

Estado actual de permisos pendientes.

```json
{
  "type": "domainPermissions",
  "permissions": []
}
```

## Mensajes client -> server

### `domainPermissionDecision`

Resolucion mock de permisos desde la UI.

Esto no aprueba ni rechaza nada en Claude/Codex real todavia. Solo actualiza el store de dominio y el dashboard.

```json
{
  "type": "domainPermissionDecision",
  "permissionId": "perm-event-1",
  "decision": "approved"
}
```

Valores permitidos para `decision`:

- `approved`
- `rejected`

## Notas

- El protocolo actual no esta versionado aun.
- `domainPermissionDecision` es mock-only hasta que exista una capa segura de control real.
- La UI puede migrar al dominio gradualmente y seguir usando el protocolo legacy mientras tanto.
