import { useEffect, useRef, useState } from 'react';

import { ZOOM_MAX, ZOOM_MIN } from '../constants.js';
import type { WorkspaceFolder } from '../hooks/useExtensionMessages.js';
import { vscode } from '../vscodeApi.js';
import { Button } from './ui/Button.js';
import { Dropdown, DropdownItem } from './ui/Dropdown.js';

interface TopBarProps {
  isEditMode: boolean;
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onToggleEditMode: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onReset: () => void;
  showRotateHint: boolean;
  isSettingsOpen: boolean;
  onToggleSettings: () => void;
  isDashboardOpen: boolean;
  onToggleDashboard: () => void;
  workspaceFolders: WorkspaceFolder[];
  zoom: number;
  onZoomChange: (zoom: number) => void;
}

export function TopBar({
  isEditMode,
  isDirty,
  canUndo,
  canRedo,
  onToggleEditMode,
  onUndo,
  onRedo,
  onSave,
  onReset,
  showRotateHint,
  isSettingsOpen,
  onToggleSettings,
  isDashboardOpen,
  onToggleDashboard,
  workspaceFolders,
  zoom,
  onZoomChange,
}: TopBarProps) {
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);
  const [isBypassMenuOpen, setIsBypassMenuOpen] = useState(false);
  const agentMenuRef = useRef<HTMLDivElement>(null);
  const pendingBypassRef = useRef(false);
  const pendingProviderIdRef = useRef('claude');

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    if (!isFolderPickerOpen && !isBypassMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (agentMenuRef.current && !agentMenuRef.current.contains(e.target as Node)) {
        setIsFolderPickerOpen(false);
        setIsBypassMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isFolderPickerOpen, isBypassMenuOpen]);

  const hasMultipleFolders = workspaceFolders.length > 1;

  const handleAgentClick = () => {
    setIsBypassMenuOpen(false);
    pendingBypassRef.current = false;
    pendingProviderIdRef.current = 'claude';
    if (hasMultipleFolders) {
      setIsFolderPickerOpen((v) => !v);
    } else {
      vscode.postMessage({ type: 'openClaude', providerId: 'claude' });
    }
  };

  const handleAgentHover = () => {
    if (!isFolderPickerOpen) setIsBypassMenuOpen(true);
  };

  const handleAgentLeave = () => {
    if (!isFolderPickerOpen) setIsBypassMenuOpen(false);
  };

  const handleFolderSelect = (folder: WorkspaceFolder) => {
    setIsFolderPickerOpen(false);
    vscode.postMessage({
      type: 'openClaude',
      providerId: pendingProviderIdRef.current,
      folderPath: folder.path,
      bypassPermissions: pendingBypassRef.current,
    });
    pendingBypassRef.current = false;
    pendingProviderIdRef.current = 'claude';
  };

  const handleProviderSelect = (providerId: string, bypassPermissions: boolean) => {
    setIsBypassMenuOpen(false);
    if (hasMultipleFolders) {
      pendingProviderIdRef.current = providerId;
      pendingBypassRef.current = bypassPermissions;
      setIsFolderPickerOpen(true);
    } else {
      vscode.postMessage({ type: 'openClaude', providerId, bypassPermissions });
    }
  };

  return (
    <div className="flex items-center h-48 px-12 gap-8 bg-bg-dark border-b-2 border-border flex-shrink-0">
      {/* Logo */}
      <span className="text-base text-accent select-none whitespace-nowrap">Pixel Agents</span>

      <div className="w-1 h-24 bg-border mx-4" />

      {/* + Agent button */}
      <div
        ref={agentMenuRef}
        className="relative"
        onMouseEnter={handleAgentHover}
        onMouseLeave={handleAgentLeave}
      >
        <Button
          variant="accent"
          size="md"
          onClick={handleAgentClick}
          className={isFolderPickerOpen || isBypassMenuOpen ? 'bg-accent-bright!' : ''}
        >
          + Agent
        </Button>
        <Dropdown isOpen={isBypassMenuOpen} direction="down">
          <DropdownItem onClick={() => handleProviderSelect('claude', true)}>
            Skip permissions <span className="text-2xs text-warning">⚠</span>
          </DropdownItem>
          <DropdownItem onClick={() => handleProviderSelect('codex', false)}>Codex</DropdownItem>
          <DropdownItem onClick={() => handleProviderSelect('codex', true)}>
            Codex bypass <span className="text-2xs text-warning">(danger)</span>
          </DropdownItem>
        </Dropdown>
        <Dropdown isOpen={isFolderPickerOpen} direction="down" className="min-w-128">
          {workspaceFolders.map((folder) => (
            <DropdownItem key={folder.path} onClick={() => handleFolderSelect(folder)}>
              {folder.name}
            </DropdownItem>
          ))}
        </Dropdown>
      </div>

      {/* Dashboard toggle */}
      <Button
        variant={isDashboardOpen ? 'active' : 'default'}
        size="md"
        onClick={onToggleDashboard}
        title="Mostrar/ocultar panel de agentes"
      >
        Dashboard
      </Button>

      {/* Layout toggle */}
      <Button variant={isEditMode ? 'active' : 'default'} size="md" onClick={onToggleEditMode}>
        Layout
      </Button>

      {/* Settings */}
      <Button variant={isSettingsOpen ? 'active' : 'default'} size="md" onClick={onToggleSettings}>
        Settings
      </Button>

      {/* Center — edit actions or rotate hint */}
      <div className="flex-1 flex items-center justify-center gap-8">
        {isEditMode && isDirty && !showResetConfirm && (
          <>
            <Button
              size="md"
              variant={canUndo ? 'default' : 'disabled'}
              onClick={canUndo ? onUndo : undefined}
              title="Undo (Ctrl+Z)"
            >
              Undo
            </Button>
            <Button
              size="md"
              variant={canRedo ? 'default' : 'disabled'}
              onClick={canRedo ? onRedo : undefined}
              title="Redo (Ctrl+Y)"
            >
              Redo
            </Button>
            <Button size="md" onClick={onSave} title="Save layout">
              Save
            </Button>
            <Button size="md" onClick={() => setShowResetConfirm(true)} title="Reset to last saved">
              Reset
            </Button>
          </>
        )}
        {isEditMode && isDirty && showResetConfirm && (
          <div className="flex items-center gap-8">
            <span className="text-sm text-reset-text">Reset layout?</span>
            <Button
              size="md"
              className="bg-danger! text-white"
              onClick={() => {
                setShowResetConfirm(false);
                onReset();
              }}
            >
              Yes
            </Button>
            <Button size="md" onClick={() => setShowResetConfirm(false)}>
              No
            </Button>
          </div>
        )}
        {showRotateHint && (
          <div className="bg-accent-bright text-white text-sm py-3 px-8 border-2 border-accent shadow-pixel pointer-events-none">
            Rotate (R)
          </div>
        )}
      </div>

      {/* Zoom controls */}
      <div className="flex items-center gap-4">
        <Button
          size="icon_lg"
          onClick={() => onZoomChange(zoom - 1)}
          disabled={zoom <= ZOOM_MIN}
          className="border-border! shadow-pixel disabled:opacity-(--btn-disabled-opacity) disabled:cursor-default"
          title="Zoom out (Ctrl+Scroll)"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <line
              x1="2"
              y1="7"
              x2="12"
              y2="7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </Button>
        <span className="text-sm select-none w-20 text-center tabular-nums">{zoom}x</span>
        <Button
          size="icon_lg"
          onClick={() => onZoomChange(zoom + 1)}
          disabled={zoom >= ZOOM_MAX}
          className="border-border! shadow-pixel disabled:opacity-(--btn-disabled-opacity) disabled:cursor-default"
          title="Zoom in (Ctrl+Scroll)"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <line
              x1="7"
              y1="2"
              x2="7"
              y2="12"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <line
              x1="2"
              y1="7"
              x2="12"
              y2="7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </Button>
      </div>
    </div>
  );
}
