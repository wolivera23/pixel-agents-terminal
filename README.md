# Pixel Agents

Oficina pixel art para agentes de programación con IA. Cada sesión de Claude Code o Codex CLI puede aparecer como un personaje animado con estado de herramientas en vivo, burbujas de espera/permisos, timeline, alertas y notificaciones de sonido opcionales.

Este repositorio es un fork de [pixel-agents](https://github.com/pablodelucca/pixel-agents), adaptado para soportar tanto el flujo original como extensión de VS Code como un modo standalone en el browser para agentes usados desde la terminal.

![Captura de Pixel Agents](webview-ui/public/Screenshot.jpg)

## Qué Hace

- Muestra agentes de programación con IA como personajes pixel art en una oficina virtual.
- Sigue herramientas activas, turnos completados, estados de espera, permisos, alertas y actividad en timeline.
- Soporta eventos de hooks de Claude Code y Codex mediante adaptadores de provider.
- Corre como webview de extensión de VS Code o como UI standalone en el browser.
- Mantiene funcionando el protocolo visual legacy mientras se introduce un modelo normalizado de Agent Control Center.

## Arquitectura Actual

```text
src/                         Backend de la extensión VS Code
server/src/                  Servidor standalone de hooks + puente de dominio
webview-ui/src/              UI React para webview/browser
webview-ui/src/core/         Helpers normalizados de eventos/estado de agentes
webview-ui/src/domain/       Estado de dominio y protocolo WS del Agent Control Center
```

### Flujo de Mensajes

1. Claude Code o Codex emite eventos de hooks.
2. Los adaptadores de provider normalizan los payloads crudos en eventos de provider.
3. El servidor standalone o la extensión VS Code mapea esos eventos a mensajes legacy de UI y mensajes de dominio.
4. El webview recibe mensajes por `postMessage` de VS Code o por WebSocket en el browser.
5. `useExtensionMessages` mantiene funcionando el canvas existente y también normaliza mensajes a `AgentEvent`.
6. `useAgentControlCenter` proyecta eventos normalizados a agentes, timeline, alertas y permisos para el dashboard.

El flujo visual legacy sigue presente a propósito. El modelo de Agent Control Center se está migrando en pasos chicos para conservar el comportamiento actual de la UI y los sonidos.

## Modos

### Extensión de VS Code

El `package.json` raíz declara la metadata de extensión de VS Code, comandos y vista de panel.

Comandos útiles:

- `Pixel Agents: Show Panel`
- `Pixel Agents: Export Layout as Default`

### Modo Standalone en Browser

El modo standalone levanta un receptor de hooks y un puente WebSocket para la UI del browser.

```bash
npm run standalone:dev
```

En otra terminal:

```bash
cd webview-ui
npm run dev
```

Luego abrir:

```text
http://localhost:5173
```

Al iniciar, el modo standalone toma ownership de `~/.pixel-agents/server.json` para que los hooks lleguen al servidor conectado al browser. El browser también puede pedir una sincronización nueva por WebSocket con `requestSync`, que vuelve a enviar los agentes existentes y el snapshot actual del dominio.

## Instalación

```bash
git clone https://github.com/wolivera23/pixel-agents-terminal.git
cd pixel-agents-terminal
npm install
cd webview-ui && npm install && cd ..
npm run build
```

## Desarrollo

```bash
npm run build
npm run test
npm run test:webview
npm run test:server
```

Desarrollo standalone:

```bash
npm run dev
```

Ese comando corre en paralelo el servidor standalone y la UI web.

## Trabajo del Agent Control Center

La nueva capa de dominio se está introduciendo gradualmente.

Piezas actuales:

- `webview-ui/src/types/agentControl.ts` define tipos compartidos de agentes, eventos y timeline.
- `webview-ui/src/core/eventNormalizer.ts` convierte mensajes existentes en `AgentEvent`.
- `webview-ui/src/core/agentState.ts` reduce `AgentEvent` a un mapa de agentes.
- `webview-ui/src/core/timeline.ts` convierte eventos de agente en entradas de timeline.
- `webview-ui/src/core/speechAdapter.ts` mapea eventos de agente a tipos de speech.
- `webview-ui/src/hooks/useAgentControlCenter.ts` proyecta datos normalizados al estado del dashboard.

El dashboard puede usar datos legacy normalizados como fallback mientras madura el camino de dominio por WebSocket.

## Protocolo WebSocket de Dominio

El servidor standalone envía mensajes de dominio en paralelo con los mensajes legacy de UI:

- `domainSnapshot`
- `domainEvent`
- `domainAgentUpserted`
- `domainAgentRemoved`
- `domainTimelineAppended`
- `domainAlertRaised`
- `domainPermissions`

El browser puede enviar:

- `domainPermissionDecision`
- `requestSync`

Ver [DOMAIN_WS_PROTOCOL.md](DOMAIN_WS_PROTOCOL.md) para los detalles del protocolo.

## Notas

- La persistencia de layout y configuración sigue usando las rutas existentes de Pixel Agents.
- Los hooks son el camino preferido para eventos en vivo; el polling de filesystem sigue siendo parte de la historia y estrategia de fallback del proyecto.
- Las decisiones de permisos en el dashboard todavía afectan solo el estado de UI/dominio, salvo que se conecten explícitamente a un provider real.

## Créditos

- Proyecto original: [pixel-agents](https://github.com/pablodelucca/pixel-agents) por [@pablodelucca](https://github.com/pablodelucca), MIT License.
- Assets de personajes basados en [JIK-A-4, Metro City](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack).

## Licencia

MIT. Ver [LICENSE](LICENSE).
