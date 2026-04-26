# Pixel Agents — Terminal Standalone Fork

> **Fork** de [pixel-agents](https://github.com/pablodelucca/pixel-agents) por [@pablodelucca](https://github.com/pablodelucca), licenciado bajo MIT.  
> Este repo adapta el proyecto original para correr **sin VS Code**, directamente desde la terminal.

![Pixel Agents screenshot](webview-ui/public/Screenshot.jpg)

## ¿Qué es esto?

[Pixel Agents](https://github.com/pablodelucca/pixel-agents) es una extensión de VS Code que convierte cada agente de Claude Code en un personaje pixel art animado dentro de una oficina virtual. Los personajes caminan, se sientan, muestran burbujas de diálogo y reflejan visualmente lo que el agente está haciendo en tiempo real.

**Este fork** elimina la dependencia de VS Code. Si usás Claude Code desde la terminal (no desde el editor), podés tener la misma interfaz visual corriendo en el browser mientras trabajás.

## Diferencias respecto al proyecto original

|                   | [Original](https://github.com/pablodelucca/pixel-agents) | Este fork                         |
| ----------------- | -------------------------------------------------------- | --------------------------------- |
| Plataforma        | Extensión de VS Code                                     | Browser (standalone)              |
| Requiere VS Code  | Sí                                                       | No                                |
| Lanzamiento       | Panel dentro de VS Code                                  | `start.bat` + browser             |
| Comunicación      | VS Code postMessage API                                  | WebSocket (`ws://localhost:3000`) |
| Estado del agente | JSONL + hooks                                            | Solo hooks de Claude Code         |

### Archivos nuevos en este fork

- **`server/src/standalone.ts`** — servidor Node.js que recibe los hook events de Claude Code vía HTTP y los retransmite al browser vía WebSocket
- **`webview-ui/src/websocketClient.ts`** — cliente WebSocket en el browser que recibe eventos reales del servidor
- **`webview-ui/src/standaloneState.ts`** — flag compartido que distingue modo mock (sin servidor) de modo live
- **`start.bat`** — script de Windows para levantar ambos servidores y abrir el browser automáticamente

### Modificaciones al código original

- **`webview-ui/src/main.tsx`** — intenta conectar al WebSocket al iniciar; si falla cae al modo mock
- **`webview-ui/src/App.tsx`** — siempre despacha los mensajes de inicialización de assets (tiles, sprites, layout), independientemente del modo
- **`esbuild.js`** — corregido el path del hook script (`providers/hook/claude` en lugar de `providers/file`)
- **`server/package.json`** — agregado `ws` como dependencia

## Cómo usarlo

### Requisitos

- Node.js 18+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) instalado
- Windows (el `start.bat` es para Windows; en Linux/Mac se puede adaptar)

### Instalación

```bash
git clone https://github.com/wolivera23/pixel-agents-terminal.git
cd pixel-agents-terminal
npm install
cd webview-ui && npm install && cd ..
npm run build
```

### Uso

Doble click en `start.bat` o desde la terminal:

```bat
start.bat
```

Esto abre tres ventanas:

1. **Servidor standalone** — recibe hooks de Claude Code y expone WebSocket en `ws://localhost:3000`
2. **UI (Vite)** — sirve la interfaz en `http://localhost:5173`
3. **Browser** — se abre automáticamente en `http://localhost:5173`

Una vez abierto el browser, cualquier sesión de Claude Code activa en el sistema va a aparecer como un personaje animado.

### Modo manual (dos terminales separadas)

Terminal 1:

```bash
npm run standalone:dev
```

Terminal 2:

```bash
cd webview-ui && npm run dev
```

## Cómo funciona

Claude Code tiene un sistema de hooks que ejecuta scripts en respuesta a eventos (`PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`, etc.). El servidor standalone:

1. Al iniciarse, instala automáticamente los hooks en `~/.claude/settings.json` y copia el script en `~/.pixel-agents/hooks/`
2. Levanta un servidor HTTP que recibe los eventos de Claude Code
3. Mapea esos eventos al formato de mensajes que espera la interfaz (`agentCreated`, `agentToolStart`, `agentToolDone`, etc.)
4. Los transmite al browser vía WebSocket

Si el servidor no está corriendo, la interfaz carga igual en **modo mock** (animaciones de demostración).

## Créditos

- **Proyecto original**: [pixel-agents](https://github.com/pablodelucca/pixel-agents) por [@pablodelucca](https://github.com/pablodelucca) — MIT License
- **Personajes**: basados en el trabajo de [JIK-A-4, Metro City](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack)

## Licencia

MIT — igual que el proyecto original. Ver [LICENSE](LICENSE).
