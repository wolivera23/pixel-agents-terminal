import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { toMajorMinor } from './changelogData.js';
import { ChangelogModal } from './components/ChangelogModal.js';
import { AgentGrid } from './components/dashboard/AgentGrid.js';
import { AlertsPanel } from './components/dashboard/AlertsPanel.js';
import { TimelinePanel } from './components/dashboard/TimelinePanel.js';
import { DebugView } from './components/DebugView.js';
import { DemoControls } from './components/DemoControls.js';
import { MigrationNotice } from './components/MigrationNotice.js';
import { SettingsModal } from './components/SettingsModal.js';
import { Tooltip } from './components/Tooltip.js';
import { TopBar } from './components/TopBar.js';
import { Modal } from './components/ui/Modal.js';
import { AGENT_DISPLAY_NAME_MAX_LENGTH } from './constants.js';
import {
  selectActiveAlerts,
  selectPendingPermissions,
  selectRealAgents,
  selectRecentTimeline,
} from './domain/selectors.js';
import { useAgentControlCenter } from './hooks/useAgentControlCenter.js';
import { useEditorActions } from './hooks/useEditorActions.js';
import { useEditorKeyboard } from './hooks/useEditorKeyboard.js';
import { useExtensionMessages } from './hooks/useExtensionMessages.js';
import { useNormalizedAgentDebugState } from './hooks/useNormalizedAgentDebugState.js';
import { OfficeCanvas } from './office/components/OfficeCanvas.js';
import { ToolOverlay } from './office/components/ToolOverlay.js';
import { EditorState } from './office/editor/editorState.js';
import { EditorToolbar } from './office/editor/EditorToolbar.js';
import { OfficeState } from './office/engine/officeState.js';
import { isRotatable } from './office/layout/furnitureCatalog.js';
import { EditTool } from './office/types.js';
import { isBrowserRuntime } from './runtime.js';
import { isStandaloneMode } from './standaloneState.js';
import { vscode } from './vscodeApi.js';

// Game state lives outside React — updated imperatively by message handlers
const officeStateRef = { current: null as OfficeState | null };
const editorState = new EditorState();

function getOfficeState(): OfficeState {
  if (!officeStateRef.current) {
    officeStateRef.current = new OfficeState();
  }
  return officeStateRef.current;
}

function App() {
  useEffect(() => {
    if (isBrowserRuntime) {
      void import('./browserMock.js').then(({ dispatchMockMessages }) => {
        dispatchMockMessages();
        if (isStandaloneMode) {
          window.dispatchEvent(
            new MessageEvent('message', {
              data: {
                type: 'settingsLoaded',
                soundEnabled: true,
                extensionVersion: '1.3.0',
                lastSeenVersion: '1.3.0',
              },
            }),
          );
        }
      });
    }
  }, []);

  const editor = useEditorActions(getOfficeState, editorState);

  const isEditDirty = useCallback(
    () => editor.isEditMode && editor.isDirty,
    [editor.isEditMode, editor.isDirty],
  );

  const {
    agents,
    selectedAgent,
    agentTools,
    agentStatuses,
    subagentTools,
    subagentCharacters,
    layoutReady,
    layoutWasReset,
    loadedAssets,
    workspaceFolders,
    externalAssetDirectories,
    lastSeenVersion,
    extensionVersion,
    watchAllSessions,
    setWatchAllSessions,
    alwaysShowLabels,
    hooksEnabled,
    setHooksEnabled,
    hooksInfoShown,
    normalizedAgents,
    normalizedTimeline,
    recentAgentEvents,
  } = useExtensionMessages(getOfficeState, editor.setLastSavedLayout, isEditDirty);
  const normalizedDebugState = useNormalizedAgentDebugState(
    normalizedAgents,
    normalizedTimeline,
    recentAgentEvents,
  );
  const normalizedLegacyInput = useMemo(
    () => ({
      agents: normalizedDebugState.agents,
      events: normalizedDebugState.recentEvents,
      timeline: normalizedDebugState.timeline,
    }),
    [normalizedDebugState.agents, normalizedDebugState.recentEvents, normalizedDebugState.timeline],
  );
  const [mutedAgentIds, setMutedAgentIds] = useState<Set<string>>(() => new Set());
  const mutedAgentIdSet = useMemo(() => new Set(mutedAgentIds), [mutedAgentIds]);
  const [renamedAgentNames, setRenamedAgentNames] = useState<Record<string, string>>({});

  // Domain store — bridges legacy state into normalized Agent/Timeline/Alert model
  const domainState = useAgentControlCenter(
    agents,
    agentTools,
    agentStatuses,
    getOfficeState,
    normalizedLegacyInput,
    mutedAgentIdSet,
  );
  const realAgents = selectRealAgents(domainState);
  const pendingPermissions = selectPendingPermissions(domainState);
  const recentTimeline = selectRecentTimeline(domainState);
  const activeAlerts = selectActiveAlerts(domainState);
  const fallbackDashboardAgents = normalizedDebugState.agents.filter(
    (agent) => agent.type === 'dev',
  );
  const dashboardAgents = (realAgents.length > 0 ? realAgents : fallbackDashboardAgents).map(
    (agent) => ({
      ...agent,
      name: renamedAgentNames[agent.id] ?? agent.name,
      muted: mutedAgentIds.has(agent.id),
    }),
  );
  const dashboardTimeline =
    recentTimeline.length > 0 ? recentTimeline : normalizedDebugState.timeline.slice().reverse();

  const [migrationNoticeDismissed, setMigrationNoticeDismissed] = useState(false);
  const showMigrationNotice = layoutWasReset && !migrationNoticeDismissed;

  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHooksInfoOpen, setIsHooksInfoOpen] = useState(false);
  const [hooksTooltipDismissed, setHooksTooltipDismissed] = useState(false);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [alwaysShowOverlay, setAlwaysShowOverlay] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [selectedDomainAgent, setSelectedDomainAgent] = useState<string | undefined>();

  const currentMajorMinor = toMajorMinor(extensionVersion);

  const handleWhatsNewDismiss = useCallback(() => {
    vscode.postMessage({ type: 'setLastSeenVersion', version: currentMajorMinor });
  }, [currentMajorMinor]);

  const handleOpenChangelog = useCallback(() => {
    setIsChangelogOpen(true);
    vscode.postMessage({ type: 'setLastSeenVersion', version: currentMajorMinor });
  }, [currentMajorMinor]);

  useEffect(() => {
    setAlwaysShowOverlay(alwaysShowLabels);
  }, [alwaysShowLabels]);

  const handleToggleDebugMode = useCallback(() => setIsDebugMode((prev) => !prev), []);
  const handleToggleAlwaysShowOverlay = useCallback(() => {
    setAlwaysShowOverlay((prev) => {
      const newVal = !prev;
      vscode.postMessage({ type: 'setAlwaysShowLabels', enabled: newVal });
      return newVal;
    });
  }, []);

  const handleSelectAgent = useCallback((id: number) => {
    vscode.postMessage({ type: 'focusAgent', id });
  }, []);

  // Points to the canvas container so ToolOverlay positions correctly
  const containerRef = useRef<HTMLDivElement>(null);

  const [editorTickForKeyboard, setEditorTickForKeyboard] = useState(0);
  useEditorKeyboard(
    editor.isEditMode,
    editorState,
    editor.handleDeleteSelected,
    editor.handleRotateSelected,
    editor.handleToggleState,
    editor.handleUndo,
    editor.handleRedo,
    useCallback(() => setEditorTickForKeyboard((n) => n + 1), []),
    editor.handleToggleEditMode,
  );

  const handleCloseAgent = useCallback((id: number) => {
    vscode.postMessage({ type: 'closeAgent', id });
  }, []);

  const handleFocusDashboardAgent = useCallback((id: string) => {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return;
    const os = getOfficeState();
    if (os.characters.has(numericId)) {
      os.selectedAgentId = numericId;
      os.cameraFollowId = numericId;
    }
    setSelectedDomainAgent(id);
    vscode.postMessage({ type: 'focusAgent', id: numericId });
  }, []);

  const handleToggleMuteDashboardAgent = useCallback((id: string) => {
    setMutedAgentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCloseDashboardAgent = useCallback((id: string) => {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return;
    setMutedAgentIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setRenamedAgentNames((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSelectedDomainAgent((prev) => (prev === id ? undefined : prev));
    vscode.postMessage({ type: 'closeAgent', id: numericId });
  }, []);

  const handleRenameDashboardAgent = useCallback((id: string, displayName: string) => {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return;
    const normalized = displayName
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, AGENT_DISPLAY_NAME_MAX_LENGTH);
    if (!normalized) return;

    const ch = getOfficeState().characters.get(numericId);
    if (ch) {
      ch.displayName = normalized;
    }

    setRenamedAgentNames((prev) => ({ ...prev, [id]: normalized }));
    vscode.postMessage({ type: 'renameAgent', id: numericId, displayName: normalized });
  }, []);

  const handleClick = useCallback((agentId: number) => {
    const os = getOfficeState();
    const meta = os.subagentMeta.get(agentId);
    const focusId = meta ? meta.parentAgentId : agentId;
    vscode.postMessage({ type: 'focusAgent', id: focusId });
  }, []);

  const officeState = getOfficeState();

  void editorTickForKeyboard;

  const showRotateHint =
    editor.isEditMode &&
    (() => {
      if (editorState.selectedFurnitureUid) {
        const item = officeState
          .getLayout()
          .furniture.find((f) => f.uid === editorState.selectedFurnitureUid);
        if (item && isRotatable(item.type)) return true;
      }
      if (
        editorState.activeTool === EditTool.FURNITURE_PLACE &&
        isRotatable(editorState.selectedFurnitureType)
      ) {
        return true;
      }
      return false;
    })();

  if (!layoutReady) {
    return <div className="w-full h-full flex items-center justify-center">Loading...</div>;
  }

  const showDashboard = isDashboardOpen && !isDebugMode;

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <TopBar
        isEditMode={editor.isEditMode}
        isDirty={editor.isDirty}
        canUndo={editorState.undoStack.length > 0}
        canRedo={editorState.redoStack.length > 0}
        onToggleEditMode={editor.handleToggleEditMode}
        onUndo={editor.handleUndo}
        onRedo={editor.handleRedo}
        onSave={editor.handleSave}
        onReset={editor.handleReset}
        showRotateHint={showRotateHint}
        isSettingsOpen={isSettingsOpen}
        onToggleSettings={() => setIsSettingsOpen((v) => !v)}
        isDashboardOpen={isDashboardOpen}
        onToggleDashboard={() => setIsDashboardOpen((v) => !v)}
        workspaceFolders={workspaceFolders}
        zoom={editor.zoom}
        onZoomChange={editor.handleZoomChange}
        currentVersion={extensionVersion}
        lastSeenVersion={lastSeenVersion}
        onDismissVersion={handleWhatsNewDismiss}
        onOpenChangelog={handleOpenChangelog}
      />

      {/* Main area: optional sidebars + canvas */}
      <div className="flex-1 flex overflow-hidden bg-bg">
        {/* Left sidebar — Agent cards + permissions */}
        {showDashboard && (
          <div
            className="flex-shrink-0 border-r-2 border-border overflow-hidden bg-bg"
            style={{ width: 220 }}
          >
            <AgentGrid
              agents={dashboardAgents}
              pendingPermissions={pendingPermissions}
              selectedAgentId={selectedDomainAgent}
              onSelectAgent={setSelectedDomainAgent}
              onFocusAgent={handleFocusDashboardAgent}
              onToggleMuteAgent={handleToggleMuteDashboardAgent}
              onCloseAgent={handleCloseDashboardAgent}
              onRenameAgent={handleRenameDashboardAgent}
            />
          </div>
        )}

        {/* Canvas area */}
        <div ref={containerRef} className="flex-1 relative overflow-hidden">
          <OfficeCanvas
            officeState={officeState}
            onClick={handleClick}
            isEditMode={editor.isEditMode}
            editorState={editorState}
            onEditorTileAction={editor.handleEditorTileAction}
            onEditorEraseAction={editor.handleEditorEraseAction}
            onEditorSelectionChange={editor.handleEditorSelectionChange}
            onDeleteSelected={editor.handleDeleteSelected}
            onRotateSelected={editor.handleRotateSelected}
            onDragMove={editor.handleDragMove}
            editorTick={editor.editorTick}
            zoom={editor.zoom}
            onZoomChange={editor.handleZoomChange}
            panRef={editor.panRef}
          />

          {!isDebugMode ? (
            <>
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: 'var(--vignette)' }}
              />

              {editor.isEditMode &&
                (() => {
                  const selUid = editorState.selectedFurnitureUid;
                  const selColor = selUid
                    ? (officeState.getLayout().furniture.find((f) => f.uid === selUid)?.color ??
                      null)
                    : null;
                  return (
                    <EditorToolbar
                      activeTool={editorState.activeTool}
                      selectedTileType={editorState.selectedTileType}
                      selectedFurnitureType={editorState.selectedFurnitureType}
                      selectedFurnitureUid={selUid}
                      selectedFurnitureColor={selColor}
                      floorColor={editorState.floorColor}
                      wallColor={editorState.wallColor}
                      selectedWallSet={editorState.selectedWallSet}
                      onToolChange={editor.handleToolChange}
                      onTileTypeChange={editor.handleTileTypeChange}
                      onFloorColorChange={editor.handleFloorColorChange}
                      onWallColorChange={editor.handleWallColorChange}
                      onWallSetChange={editor.handleWallSetChange}
                      onSelectedFurnitureColorChange={editor.handleSelectedFurnitureColorChange}
                      onFurnitureTypeChange={editor.handleFurnitureTypeChange}
                      loadedAssets={loadedAssets}
                    />
                  );
                })()}

              <ToolOverlay
                officeState={officeState}
                agents={agents}
                agentTools={agentTools}
                subagentCharacters={subagentCharacters}
                containerRef={containerRef}
                zoom={editor.zoom}
                panRef={editor.panRef}
                onCloseAgent={handleCloseAgent}
                alwaysShowOverlay={alwaysShowOverlay}
              />
            </>
          ) : (
            <DebugView
              agents={agents}
              selectedAgent={selectedAgent}
              agentTools={agentTools}
              agentStatuses={agentStatuses}
              subagentTools={subagentTools}
              normalizedAgents={normalizedDebugState.agents}
              normalizedTimeline={normalizedDebugState.timeline}
              recentAgentEvents={normalizedDebugState.recentEvents}
              onSelectAgent={handleSelectAgent}
            />
          )}

          {/* Hooks first-run tooltip */}
          {!hooksInfoShown && !hooksTooltipDismissed && (
            <Tooltip
              title="Instant Detection Active"
              position="top-right"
              onDismiss={() => {
                setHooksTooltipDismissed(true);
                vscode.postMessage({ type: 'setHooksInfoShown' });
              }}
            >
              <span className="text-sm text-text leading-none">
                Your agents now respond in real-time.{' '}
                <span
                  className="text-accent cursor-pointer underline"
                  onClick={() => {
                    setIsHooksInfoOpen(true);
                    setHooksTooltipDismissed(true);
                    vscode.postMessage({ type: 'setHooksInfoShown' });
                  }}
                >
                  View more
                </span>
              </span>
            </Tooltip>
          )}

          {isBrowserRuntime && <DemoControls />}
        </div>

        {/* Right sidebar — Timeline + Alerts */}
        {showDashboard && (
          <div
            className="flex-shrink-0 border-l-2 border-border overflow-hidden flex flex-col bg-bg"
            style={{ width: 220 }}
          >
            <div className="flex-1 overflow-hidden">
              <TimelinePanel events={dashboardTimeline} />
            </div>
            {activeAlerts.length > 0 && (
              <div className="flex-shrink-0 border-t-2 border-border overflow-hidden">
                <AlertsPanel alerts={activeAlerts} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hooks info modal */}
      <Modal
        isOpen={isHooksInfoOpen}
        onClose={() => setIsHooksInfoOpen(false)}
        title="Instant Detection is ON"
        zIndex={52}
      >
        <div className="text-base text-text px-10" style={{ lineHeight: 1.4 }}>
          <p className="mb-8">Your Pixel Agents office now reacts in real-time:</p>
          <ul className="mb-8 pl-18 list-disc m-0">
            <li className="text-sm mb-2">Permission prompts appear instantly</li>
            <li className="text-sm mb-2">Turn completions detected the moment they happen</li>
            <li className="text-sm mb-2">Sound notifications play immediately</li>
          </ul>
          <p className="mb-12 text-text-muted">
            This works through Claude Code Hooks, small event listeners that notify Pixel Agents
            whenever something happens in your Claude sessions.
          </p>
          <div className="text-center">
            <button
              onClick={() => setIsHooksInfoOpen(false)}
              className="py-4 px-20 text-lg bg-accent text-white border-2 border-accent rounded-none cursor-pointer shadow-pixel"
            >
              Got it
            </button>
          </div>
          <p className="mt-8 text-xs text-text-muted text-center">
            To disable, go to Settings {'>'} Instant Detection
          </p>
        </div>
      </Modal>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        isDebugMode={isDebugMode}
        onToggleDebugMode={handleToggleDebugMode}
        alwaysShowOverlay={alwaysShowOverlay}
        onToggleAlwaysShowOverlay={handleToggleAlwaysShowOverlay}
        externalAssetDirectories={externalAssetDirectories}
        watchAllSessions={watchAllSessions}
        onToggleWatchAllSessions={() => {
          const newVal = !watchAllSessions;
          setWatchAllSessions(newVal);
          vscode.postMessage({ type: 'setWatchAllSessions', enabled: newVal });
        }}
        hooksEnabled={hooksEnabled}
        onToggleHooksEnabled={() => {
          const newVal = !hooksEnabled;
          setHooksEnabled(newVal);
          vscode.postMessage({ type: 'setHooksEnabled', enabled: newVal });
        }}
      />

      <ChangelogModal
        isOpen={isChangelogOpen}
        onClose={() => setIsChangelogOpen(false)}
        currentVersion={extensionVersion}
      />

      {showMigrationNotice && (
        <MigrationNotice onDismiss={() => setMigrationNoticeDismissed(true)} />
      )}
    </div>
  );
}

export default App;
