import type { MouseEvent as ReactMouseEvent, ReactNode, SyntheticEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  canPickProjectFileHandle,
  pickProjectFileWithHandle,
} from '../../projects/projectFiles';
import type { WebsterFileHandle } from '../../projects/projectFiles';
import type { SaveStatus } from '../hooks/useProjectFileActions';
import type { MaskBrushOptions } from '../../tools/mask-brush/MaskBrushTypes';
import type { LayerSummary } from '../../app/EditorApp';
import type { ShapeKind } from '../../layers/ShapeLayer';
import type { StrokeStyle } from '../../layers/StrokeLayer';
import type { SelectionCommand } from '../../app/EditorApp';
import type { SelectionMode } from '../../selection/SelectionManager';
import { cn } from '../classNames';
import Image from 'next/image';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar';
import Link from 'next/link';
import { useAuth0 } from '@auth0/auth0-react';
import { Circle, Cloud, Ruler, Users } from 'lucide-react';
import {
  getCurrentUser,
  toAbsoluteAvatarUrl,
} from '../../collaboration/sharedProjectApi';

type ToolbarProps = {
  canEditDocument: boolean;
  canDownloadSharedProject: boolean;
  canGroupSelectedLayers: boolean;
  canManageSharing: boolean;
  canRedo: boolean;
  canUndo: boolean;
  canvasSize: { height: number; width: number } | null;
  collaborationStatus:
    | 'connected'
    | 'connecting'
    | 'disconnected'
    | 'reconnecting';
  documentTitle: string;
  isSharedMode: boolean;
  onCopy: () => void;
  onCut: () => void;
  onDeleteSelectedLayer: () => void;
  onDownloadSharedProject: () => void;
  onDuplicateSelectedLayer: () => void;
  onGroupSelectedLayers: () => void;
  onNewDocument: () => void;
  onOpenCanvasResize: () => void;
  onOpenImageDocument: (file: File) => void;
  onOpenExportDialog: () => void;
  onOpenImageResize: () => void;
  onOpenProject: (file: File, handle?: WebsterFileHandle | null) => void;
  onOpenSharedProject: () => void;
  onOpenVersionHistory: () => void;
  onImportFont: (file: File) => void;
  onPaste: () => void;
  onRedo: () => void;
  onRestoreImageOriginal: () => void;
  onExportTemplate: () => void;
  onSaveAsProject: () => void;
  onSaveProject: () => void;
  onShareProject: () => void;
  onSaveTemplate: () => void;
  onAddAdjustmentLayer: () => void;
  onAddObject3DLayer: () => void;
  onSelectionCommand: (command: SelectionCommand) => void;
  onSelectTool: (tool: string) => void;
  onShowCanvasBorderChange: (show: boolean) => void;
  onUndo: () => void;
  onUploadImage: (file: File) => void;
  maskBrushOptions: MaskBrushOptions;
  magicSelectionTolerance: number;
  onMagicSelectionToleranceChange: (tolerance: number) => void;
  onMaskBrushOptionsChange: (options: Partial<MaskBrushOptions>) => void;
  onSelectionModeChange: (mode: SelectionMode) => void;
  onStrokeColorChange: (color: [number, number, number, number]) => void;
  onStrokeModeChange: (mode: 'draw' | 'erase') => void;
  onStrokeStyleChange: (style: StrokeStyle) => void;
  onStrokeTargetChange: (target: StrokeTargetSelection) => void;
  onStrokeWidthChange: (width: number) => void;
  saveStatus: SaveStatus;
  onlineUserCount: number;
  pendingCommitCount: number;
  projectStorageLabel: string;
  projectRole: string | null;
  selectedLayer: LayerSummary | null;
  selectedSelectionMode: SelectionMode;
  selectedShape: ShapeKind;
  selectedStrokeColor: [number, number, number, number];
  selectedStrokeMode: 'draw' | 'erase';
  selectedStrokeStyle: StrokeStyle;
  selectedStrokeTargetLayerId: string | null;
  selectedStrokeTargetMode: 'layer' | 'new' | 'selected';
  selectedStrokeWidth: number;
  selectedTool: string;
  showCanvasBorder: boolean;
  strokeLayers: LayerSummary[];
  onSelectShape: (shape: ShapeKind) => void;
  redoLabel: string | null;
  undoLabel: string | null;
  zoomPercentage: number;
};

export type StrokeTargetSelection = {
  layerId: string | null;
  mode: 'layer' | 'new' | 'selected';
};

const shortcutMenuGroups = [
  {
    label: 'Tools',
    shortcuts: [
      ['V', 'Move'],
      ['Q', 'Transform'],
      ['C', 'Crop'],
      ['H', 'Pan'],
      ['B', 'Mask brush'],
      ['T', 'Text'],
      ['D', 'Draw'],
      ['S', 'Shape'],
      ['R', 'Rectangle'],
      ['E', 'Ellipse'],
      ['L', 'Lasso'],
      ['W', 'Magic'],
    ],
  },
  {
    label: 'Layer',
    shortcuts: [
      ['Arrows', 'Nudge'],
      ['Shift+Arrows', '10 px'],
      ['Del', 'Delete'],
      ['Ctrl/Cmd+C', 'Copy'],
      ['Ctrl/Cmd+X', 'Cut'],
      ['Ctrl/Cmd+V', 'Paste'],
      ['Ctrl/Cmd+J', 'Duplicate'],
      ['Ctrl/Cmd+G', 'Group'],
    ],
  },
  {
    label: 'Selection',
    shortcuts: [
      ['Shift', 'Add mode'],
      ['Alt', 'Subtract mode'],
      ['Shift+Alt', 'Intersect mode'],
      ['Ctrl/Cmd+D', 'Clear'],
    ],
  },
  {
    label: 'History',
    shortcuts: [
      ['Ctrl/Cmd+Z', 'Undo'],
      ['Shift+Ctrl/Cmd+Z', 'Redo'],
      ['Ctrl/Cmd+S', 'Save'],
    ],
  },
];

export function Toolbar({
  canEditDocument,
  canDownloadSharedProject,
  canGroupSelectedLayers,
  canManageSharing,
  canRedo,
  canUndo,
  canvasSize,
  collaborationStatus,
  documentTitle,
  isSharedMode,
  onCopy,
  onCut,
  onDeleteSelectedLayer,
  onDownloadSharedProject,
  onDuplicateSelectedLayer,
  onGroupSelectedLayers,
  onNewDocument,
  onOpenCanvasResize,
  onOpenImageDocument,
  onOpenExportDialog,
  onOpenImageResize,
  onOpenProject,
  onOpenSharedProject,
  onOpenVersionHistory,
  onImportFont,
  onPaste,
  onRedo,
  onRestoreImageOriginal,
  onExportTemplate,
  onSaveAsProject,
  onSaveProject,
  onShareProject,
  onSaveTemplate,
  onAddAdjustmentLayer,
  onAddObject3DLayer,
  onSelectionCommand,
  onSelectTool,
  onShowCanvasBorderChange,
  onUndo,
  onUploadImage,
  maskBrushOptions,
  magicSelectionTolerance,
  onMagicSelectionToleranceChange,
  onMaskBrushOptionsChange,
  onSelectionModeChange,
  onStrokeColorChange,
  onStrokeModeChange,
  onStrokeStyleChange,
  onStrokeTargetChange,
  onStrokeWidthChange,
  saveStatus,
  onlineUserCount,
  pendingCommitCount,
  projectStorageLabel,
  projectRole,
  selectedLayer,
  selectedSelectionMode,
  selectedShape,
  selectedStrokeColor,
  selectedStrokeMode,
  selectedStrokeStyle,
  selectedStrokeTargetLayerId,
  selectedStrokeTargetMode,
  selectedStrokeWidth,
  selectedTool,
  showCanvasBorder,
  strokeLayers,
  redoLabel,
  undoLabel,
  zoomPercentage,
  onSelectShape,
}: ToolbarProps) {
  const [isShortcutDialogOpen, setIsShortcutDialogOpen] = useState(false);
  const toolbarRef = useRef<HTMLElement | null>(null);
  const documentImageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fontInputRef = useRef<HTMLInputElement | null>(null);
  const fileMenuRef = useRef<HTMLDetailsElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function closeOpenMenus(event: PointerEvent) {
      if (
        !toolbarRef.current ||
        toolbarRef.current.contains(event.target as Node)
      ) {
        return;
      }

      closeAllMenus(toolbarRef.current);
    }

    function closeMenusOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return;
      }

      if (toolbarRef.current) {
        closeAllMenus(toolbarRef.current);
      }

      setIsShortcutDialogOpen(false);
    }

    document.addEventListener('pointerdown', closeOpenMenus);
    document.addEventListener('keydown', closeMenusOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeOpenMenus);
      document.removeEventListener('keydown', closeMenusOnEscape);
    };
  }, []);

  function openImageDocumentPicker() {
    fileMenuRef.current?.removeAttribute('open');
    documentImageInputRef.current?.click();
  }

  function openImagePicker() {
    fileMenuRef.current?.removeAttribute('open');
    fileInputRef.current?.click();
  }

  function openFontPicker() {
    fileMenuRef.current?.removeAttribute('open');
    fontInputRef.current?.click();
  }

  async function openProjectPicker() {
    fileMenuRef.current?.removeAttribute('open');

    if (canPickProjectFileHandle()) {
      try {
        const pickedProject = await pickProjectFileWithHandle();

        if (pickedProject) {
          onOpenProject(pickedProject.file, pickedProject.handle);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        throw error;
      }

      return;
    }

    projectInputRef.current?.click();
  }

  function closeMenu(event: ReactMouseEvent<HTMLElement>) {
    event.currentTarget.closest('details')?.removeAttribute('open');
  }

  function closeSiblingMenus(event: SyntheticEvent<HTMLDetailsElement>) {
    const openedMenu = event.currentTarget;

    if (!openedMenu.open || !toolbarRef.current) {
      return;
    }

    for (const menu of toolbarRef.current.querySelectorAll(
      'details.toolbar-menu',
    )) {
      if (menu !== openedMenu) {
        menu.removeAttribute('open');
      }
    }
  }

  const {
    getAccessTokenSilently,
    getIdTokenClaims,
    user,
    isAuthenticated,
    loginWithRedirect,
    logout,
  } = useAuth0();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isEmailConfirmationDismissed, setIsEmailConfirmationDismissed] =
    useState(false);
  const [emailConfirmationMessage, setEmailConfirmationMessage] =
    useState<string | null>(null);
  const [isCheckingEmailConfirmation, setIsCheckingEmailConfirmation] =
    useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function closeUserMenu(event: PointerEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener('pointerdown', closeUserMenu);
    return () => document.removeEventListener('pointerdown', closeUserMenu);
  }, []);

  useEffect(() => {
    if (user?.email_verified === false) {
      setIsEmailConfirmationDismissed(false);
      setEmailConfirmationMessage(null);
    }
  }, [user?.email_verified]);
  const [profile, setProfile] = useState<{
    displayName: string | null;
    avatarUrl: string | null;
  } | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    let cancelled = false;
    getCurrentUser()
      .then((p) => {
        if (!cancelled) {
          setProfile({ displayName: p.displayName, avatarUrl: p.avatarUrl });
        }
      })
      .catch(() => {
        // fall back to Auth0 values
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const displayName =
    profile?.displayName ||
    user?.name ||
    user?.nickname ||
    user?.email ||
    'Account';
  const avatarSrc =
    toAbsoluteAvatarUrl(profile?.avatarUrl) || user?.picture || null;
  const avatarFallback = getAvatarInitials(displayName);
  const shouldShowEmailConfirmation =
    isAuthenticated &&
    user?.email_verified === false &&
    !isEmailConfirmationDismissed;

  async function refreshEmailVerificationStatus() {
    setIsCheckingEmailConfirmation(true);
    setEmailConfirmationMessage(null);

    try {
      await getAccessTokenSilently({ cacheMode: 'off' });
      const claims = await getIdTokenClaims();

      if (claims?.email_verified === true) {
        window.location.reload();
        return;
      }

      setEmailConfirmationMessage(
        'Still waiting on Auth0. If you just clicked the email link, give it a moment and check again.',
      );
    } catch (error) {
      setEmailConfirmationMessage(
        error instanceof Error ? error.message : 'Unable to refresh email status.',
      );
    } finally {
      setIsCheckingEmailConfirmation(false);
    }
  }

  return (
    <header
      className='flex min-h-15 items-center gap-3 border-b border-[#2a2d31] bg-[#17191d] px-4 py-2 max-[760px]:gap-2 max-[760px]:px-2'
      aria-label='Top toolbar'
      ref={toolbarRef}
    >
      <div className='flex min-w-0 items-center gap-3'>
        <a
          href='/'
          aria-label='Go to home page'
          title='Home'
          className='grid h-9 w-9 flex-none place-items-center rounded-lg border border-[#4aa391] bg-[#276f63] font-extrabold text-white transition hover:border-[#6fd6c1] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fd6c1]'
        >
          W
        </a>
        <div className='grid min-w-0 gap-0.5'>
          <div className='flex min-w-0 items-center gap-1.5'>
            <a
              href='/'
              className='m-0 block w-fit shrink-0 text-[11px] font-bold uppercase tracking-normal text-[#8b929b] hover:text-[#dff3ea]'
            >
              Webster
            </a>
          </div>
          <div className='flex min-w-0 items-center gap-1.5'>
            <h1 className='m-0 max-w-[170px] truncate text-[17px] font-bold tracking-normal text-[#f2f4f7]'>
              {documentTitle}
            </h1>
            <span className={titleBadgeClass}>{projectStorageLabel}</span>
            {projectRole ? <span className={titleBadgeClass}>{capitalizeRole(projectRole)}</span> : null}
          </div>
        </div>
      </div>
      <nav
        className='flex min-w-0 flex-1 items-center justify-start gap-2 overflow-visible border-l border-[#2b3037] pl-3'
        aria-label='Editor menus'
      >
        <details
          className='toolbar-menu relative'
          onToggle={closeSiblingMenus}
          ref={fileMenuRef}
        >
          <summary className={toolbarButtonClass}>File</summary>
          <div className={toolbarMenuClass} role='menu'>
            <button
              className={toolbarMenuItemClass}
              onClick={() => {
                fileMenuRef.current?.removeAttribute('open');
                onNewDocument();
              }}
              type='button'
            >
              New
            </button>
            <button
              className={toolbarMenuItemClass}
              onClick={openProjectPicker}
              type='button'
            >
              Open .webster...
            </button>
            <button
              className={toolbarMenuItemClass}
              onClick={(event) => {
                closeMenu(event);
                onOpenSharedProject();
              }}
              type='button'
            >
              Open shared project...
            </button>
            <button
              className={toolbarMenuItemClass}
              onClick={openImageDocumentPicker}
              type='button'
            >
              Open image as document...
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={openImagePicker}
              type='button'
            >
              Import image as layer...
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={openFontPicker}
              type='button'
            >
              Import font...
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={() => {
                fileMenuRef.current?.removeAttribute('open');
                onSaveProject();
              }}
              type='button'
            >
              Save
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={isSharedMode ? !canManageSharing : !canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                onShareProject();
              }}
              type='button'
            >
              {isSharedMode ? 'Share project...' : 'Upload & share...'}
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={() => {
                fileMenuRef.current?.removeAttribute('open');
                onSaveAsProject();
              }}
              type='button'
            >
              Save as .webster...
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={() => {
                fileMenuRef.current?.removeAttribute('open');
                onSaveTemplate();
              }}
              type='button'
            >
              Save as template...
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={() => {
                fileMenuRef.current?.removeAttribute('open');
                onExportTemplate();
              }}
              type='button'
            >
              Export template...
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canvasSize}
              onClick={(event) => {
                closeMenu(event);
                onOpenExportDialog();
              }}
              type='button'
            >
              Export image...
            </button>
            {isSharedMode ? (
              <button
                className={toolbarMenuItemClass}
                disabled={!canDownloadSharedProject}
                onClick={(event) => {
                  closeMenu(event);
                  onDownloadSharedProject();
                }}
                type='button'
              >
                Download cloud .webster...
              </button>
            ) : null}
            <button
              className={toolbarMenuItemClass}
              disabled={!isSharedMode}
              onClick={() => {
                fileMenuRef.current?.removeAttribute('open');
                onOpenVersionHistory();
              }}
              type='button'
            >
              Version history...
            </button>
          </div>
        </details>
        <details className='toolbar-menu relative' onToggle={closeSiblingMenus}>
          <summary className={toolbarButtonClass}>Edit</summary>
          <div className={toolbarMenuClass} role='menu'>
            <button
              className={toolbarMenuItemClass}
              disabled={!canUndo}
              onClick={(event) => {
                closeMenu(event);
                onUndo();
              }}
              type='button'
            >
              <span>{undoLabel ? `Undo ${undoLabel}` : 'Undo'}</span>
              <span className={toolbarMenuHintClass}>Ctrl/Cmd+Z</span>
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canRedo}
              onClick={(event) => {
                closeMenu(event);
                onRedo();
              }}
              type='button'
            >
              <span>{redoLabel ? `Redo ${redoLabel}` : 'Redo'}</span>
              <span className={toolbarMenuHintClass}>Shift+Ctrl/Cmd+Z</span>
            </button>
            <MenuSeparator />
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument || !selectedLayer}
              onClick={(event) => {
                closeMenu(event);
                onDuplicateSelectedLayer();
              }}
              type='button'
            >
              <span>Duplicate layer</span>
              <span className={toolbarMenuHintClass}>Ctrl/Cmd+J</span>
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument || !selectedLayer}
              onClick={(event) => {
                closeMenu(event);
                onDeleteSelectedLayer();
              }}
              type='button'
            >
              <span>Delete layer</span>
              <span className={toolbarMenuHintClass}>Del / Backspace</span>
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument || !canGroupSelectedLayers}
              onClick={(event) => {
                closeMenu(event);
                onGroupSelectedLayers();
              }}
              type='button'
            >
              <span>Group selected</span>
              <span className={toolbarMenuHintClass}>Ctrl/Cmd+G</span>
            </button>
            <MenuSeparator />
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                onCut();
              }}
              type='button'
            >
              <span>Cut</span>
              <span className={toolbarMenuHintClass}>Ctrl/Cmd+X</span>
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                onCopy();
              }}
              type='button'
            >
              <span>Copy</span>
              <span className={toolbarMenuHintClass}>Ctrl/Cmd+C</span>
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                onPaste();
              }}
              type='button'
            >
              <span>Paste</span>
              <span className={toolbarMenuHintClass}>Ctrl/Cmd+V</span>
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={
                !canEditDocument ||
                !isImageLayerSummary(selectedLayer) ||
                selectedLayer.locked
              }
              onClick={(event) => {
                closeMenu(event);
                onOpenImageResize();
              }}
              type='button'
            >
              Resize image pixels...
              <span className={toolbarMenuHintClass}>Image</span>
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={
                !canEditDocument ||
                !isImageLayerSummary(selectedLayer) ||
                selectedLayer.locked ||
                !selectedLayer.canRestoreOriginalPixels
              }
              onClick={(event) => {
                closeMenu(event);
                onRestoreImageOriginal();
              }}
              type='button'
            >
              Revert image to original pixels
              <span className={toolbarMenuHintClass}>Image</span>
            </button>
          </div>
        </details>
        <details className='toolbar-menu relative' onToggle={closeSiblingMenus}>
          <summary className={toolbarButtonClass}>Layer</summary>
          <div className={toolbarMenuClass} role='menu'>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                onAddObject3DLayer();
              }}
              type='button'
            >
              Add 3D object layer
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                onAddAdjustmentLayer();
              }}
              type='button'
            >
              Add adjustment layer
            </button>
          </div>
        </details>
        <details className='toolbar-menu relative' onToggle={closeSiblingMenus}>
          <summary className={toolbarButtonClass}>View</summary>
          <div className={toolbarMenuClass} role='menu'>
            <button className={toolbarMenuItemClass} disabled type='button'>
              Canvas:{' '}
              {canvasSize ? formatCanvasSize(canvasSize) : 'No document'}
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                onOpenCanvasResize();
              }}
              type='button'
            >
              Resize canvas...
            </button>
            <MenuSeparator />
            <button className={toolbarMenuItemClass} disabled type='button'>
              Zoom: {zoomPercentage}%
            </button>
            <button className={toolbarMenuItemClass} disabled type='button'>
              Zoom in <span className={toolbarMenuHintClass}>TODO</span>
            </button>
            <button className={toolbarMenuItemClass} disabled type='button'>
              Zoom out <span className={toolbarMenuHintClass}>TODO</span>
            </button>
            <button className={toolbarMenuItemClass} disabled type='button'>
              Fit canvas <span className={toolbarMenuHintClass}>TODO</span>
            </button>
            <MenuSeparator />
            <button
              className={toolbarMenuItemClass}
              onClick={(event) => {
                closeMenu(event);
                setIsShortcutDialogOpen(true);
              }}
              type='button'
            >
              <span>Keyboard shortcuts...</span>
              <span className={toolbarMenuHintClass}>Keys</span>
            </button>
            <MenuSeparator />
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                onSelectTool('Pan');
              }}
              type='button'
            >
              Pan workspace
            </button>
            <button className={toolbarMenuItemClass} disabled type='button'>
              Toggle checkerboard{' '}
              <span className={toolbarMenuHintClass}>TODO</span>
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={() => onShowCanvasBorderChange(!showCanvasBorder)}
              type='button'
            >
              Canvas glow border
              <span className={toolbarMenuHintClass}>
                {showCanvasBorder ? 'On' : 'Off'}
              </span>
            </button>
            <button className={toolbarMenuItemClass} disabled type='button'>
              Rulers and guides{' '}
              <span className={toolbarMenuHintClass}>TODO</span>
            </button>
          </div>
        </details>
        <details className='toolbar-menu relative' onToggle={closeSiblingMenus}>
          <summary className={toolbarButtonClass}>Filter</summary>
          <div className={toolbarMenuClass} role='menu'>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                onAddAdjustmentLayer();
              }}
              type='button'
            >
              Add adjustment layer
            </button>
            <button className={toolbarMenuItemClass} disabled type='button'>
              Layer filters live in Properties
            </button>
            <MenuSeparator />
            <button className={toolbarMenuItemClass} disabled type='button'>
              Brightness / Contrast{' '}
              <span className={toolbarMenuHintClass}>Implemented</span>
            </button>
            <button className={toolbarMenuItemClass} disabled type='button'>
              Hue / Saturation{' '}
              <span className={toolbarMenuHintClass}>Implemented</span>
            </button>
            <button className={toolbarMenuItemClass} disabled type='button'>
              Blur / Drop shadow{' '}
              <span className={toolbarMenuHintClass}>Implemented</span>
            </button>
            <MenuSeparator />
            <button className={toolbarMenuItemClass} disabled type='button'>
              Filter gallery <span className={toolbarMenuHintClass}>TODO</span>
            </button>
            <button className={toolbarMenuItemClass} disabled type='button'>
              Clip adjustment to layer{' '}
              <span className={toolbarMenuHintClass}>TODO</span>
            </button>
          </div>
        </details>
        <details className='toolbar-menu relative' onToggle={closeSiblingMenus}>
          <summary className={toolbarButtonClass}>Select</summary>
          <div className={toolbarMenuClass} role='menu'>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                onSelectionCommand('clear');
              }}
              type='button'
            >
              <span>Clear selection</span>
              <span className={toolbarMenuHintClass}>Ctrl/Cmd+D</span>
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                onSelectionCommand('invert');
              }}
              type='button'
            >
              Invert selection
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                onSelectionCommand('convert-to-mask');
              }}
              type='button'
            >
              Convert to mask
            </button>
            <MenuSeparator />
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                const radius = promptPositiveNumber('Feather radius', 8);

                if (radius !== null) {
                  onSelectionCommand({ radius, type: 'feather' });
                }
              }}
              type='button'
            >
              Feather selection...
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                const amount = promptPositiveNumber('Grow by pixels', 8);

                if (amount !== null) {
                  onSelectionCommand({ amount, type: 'grow' });
                }
              }}
              type='button'
            >
              Grow selection...
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                const amount = promptPositiveNumber('Shrink by pixels', 8);

                if (amount !== null) {
                  onSelectionCommand({ amount, type: 'shrink' });
                }
              }}
              type='button'
            >
              Shrink selection...
            </button>
            <MenuSeparator />
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                const name = window.prompt('Selection name', 'Selection');

                if (name) {
                  onSelectionCommand({ name, type: 'save' });
                }
              }}
              type='button'
            >
              Save selection...
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                const name = window.prompt(
                  'Selection name to load',
                  'Selection',
                );

                if (name) {
                  onSelectionCommand({
                    name,
                    mode: selectedSelectionMode,
                    type: 'load',
                  });
                }
              }}
              type='button'
            >
              Load selection...
            </button>
          </div>
        </details>
        {hasContextualToolOptions(selectedTool) ? (
          <details
            className='toolbar-menu relative hidden max-[1500px]:block'
            onToggle={closeSiblingMenus}
          >
            <summary className={toolbarButtonClass}>Tool options</summary>
            <div className={toolbarOptionsMenuClass} role='menu'>
              <ToolbarToolOptions
                canEditDocument={canEditDocument}
                magicSelectionTolerance={magicSelectionTolerance}
                maskBrushOptions={maskBrushOptions}
                onMagicSelectionToleranceChange={onMagicSelectionToleranceChange}
                onMaskBrushOptionsChange={onMaskBrushOptionsChange}
                onSelectShape={onSelectShape}
                onSelectTool={onSelectTool}
                onSelectionModeChange={onSelectionModeChange}
                onStrokeColorChange={onStrokeColorChange}
                onStrokeModeChange={onStrokeModeChange}
                onStrokeStyleChange={onStrokeStyleChange}
                onStrokeTargetChange={onStrokeTargetChange}
                onStrokeWidthChange={onStrokeWidthChange}
                selectedSelectionMode={selectedSelectionMode}
                selectedShape={selectedShape}
                selectedStrokeColor={selectedStrokeColor}
                selectedStrokeMode={selectedStrokeMode}
                selectedStrokeStyle={selectedStrokeStyle}
                selectedStrokeTargetLayerId={selectedStrokeTargetLayerId}
                selectedStrokeTargetMode={selectedStrokeTargetMode}
                selectedStrokeWidth={selectedStrokeWidth}
                selectedTool={selectedTool}
                strokeLayers={strokeLayers}
              />
            </div>
          </details>
        ) : null}
        {selectedTool === 'Mask Brush' ? (
          <div
            className='flex items-center gap-2 pl-1.5 max-[1500px]:hidden'
            aria-label='Mask brush options'
          >
            <label className='flex items-center gap-1.25 text-xs font-bold text-[#c9cdd2]'>
              Size
              <input
                className={maskBrushInputClass}
                min='1'
                max='256'
                onChange={(event) =>
                  onMaskBrushOptionsChange({ size: Number(event.target.value) })
                }
                type='number'
                value={maskBrushOptions.size}
              />
            </label>
            <label className='flex items-center gap-1.25 text-xs font-bold text-[#c9cdd2]'>
              Opacity
              <input
                className={maskBrushInputClass}
                min='1'
                max='100'
                onChange={(event) =>
                  onMaskBrushOptionsChange({
                    opacity: Number(event.target.value) / 100,
                  })
                }
                type='number'
                value={Math.round(maskBrushOptions.opacity * 100)}
              />
            </label>
            <label className='flex items-center gap-1.25 text-xs font-bold text-[#c9cdd2]'>
              Mode
              <select
                className={cn(maskBrushInputClass, 'w-30.5')}
                onChange={(event) =>
                  onMaskBrushOptionsChange({
                    mode: event.target.value === 'hide' ? 'hide' : 'reveal',
                  })
                }
                value={maskBrushOptions.mode}
              >
                <option value='reveal'>Reveal white</option>
                <option value='hide'>Hide black</option>
              </select>
            </label>
          </div>
        ) : null}
        {selectedTool === 'Draw' ? (
          <div
            className='flex items-center gap-2 pl-1.5 max-[1500px]:hidden'
            aria-label='Draw options'
          >
            <label className='flex items-center gap-1.25 text-xs font-bold text-[#c9cdd2]'>
              Target
              <select
                className={cn(maskBrushInputClass, 'w-39')}
                onChange={(event) =>
                  onStrokeTargetChange(parseStrokeTarget(event.target.value))
                }
                value={formatStrokeTargetValue(
                  selectedStrokeTargetMode,
                  selectedStrokeTargetLayerId,
                )}
              >
                <option value='new'>New layer</option>
                <option value='selected'>Selected stroke layer</option>
                {strokeLayers.map((layer) => (
                  <option key={layer.id} value={`layer:${layer.id}`}>
                    {layer.name}
                  </option>
                ))}
              </select>
            </label>
            <label className='flex items-center gap-1.25 text-xs font-bold text-[#c9cdd2]'>
              Type
              <select
                className={cn(maskBrushInputClass, 'w-29.5')}
                onChange={(event) =>
                  onStrokeStyleChange(toStrokeStyle(event.target.value))
                }
                value={selectedStrokeStyle}
              >
                <option value='pencil'>Pencil</option>
                <option value='pen'>Pen</option>
                <option value='brush'>Brush</option>
                <option value='marker'>Marker</option>
                <option value='highlighter'>Highlighter</option>
              </select>
            </label>
            <label className='flex items-center gap-1.25 text-xs font-bold text-[#c9cdd2]'>
              Color
              <input
                aria-label='Draw color'
                className='h-8.5 w-12 rounded-md border border-[#33373d] bg-[#101113] p-1'
                onChange={(event) =>
                  onStrokeColorChange(
                    hexToColor(event.target.value, selectedStrokeColor[3]),
                  )
                }
                type='color'
                value={colorToHex(selectedStrokeColor)}
              />
            </label>
            <label className='flex items-center gap-1.25 text-xs font-bold text-[#c9cdd2]'>
              Size
              <input
                className={maskBrushInputClass}
                min='1'
                max='256'
                onChange={(event) =>
                  onStrokeWidthChange(Number(event.target.value))
                }
                type='number'
                value={selectedStrokeWidth}
              />
            </label>
            <button
              className={cn(
                toolbarButtonClass,
                selectedStrokeMode === 'erase' &&
                  'border-[#4aa391] bg-[#203731]',
              )}
              onClick={() =>
                onStrokeModeChange(
                  selectedStrokeMode === 'erase' ? 'draw' : 'erase',
                )
              }
              type='button'
            >
              {selectedStrokeMode === 'erase' ? 'Draw' : 'Eraser'}
            </button>
          </div>
        ) : null}
        {isSelectionToolSelected(selectedTool) ? (
          <div
            className='flex items-center gap-2 pl-1.5 max-[1500px]:hidden'
            aria-label='Selection options'
          >
            <label className='flex items-center gap-1.25 text-xs font-bold text-[#c9cdd2]'>
              Mode
              <select
                className={cn(maskBrushInputClass, 'w-29.5')}
                onChange={(event) =>
                  onSelectionModeChange(toSelectionMode(event.target.value))
                }
                value={selectedSelectionMode}
              >
                <option value='replace'>Replace</option>
                <option value='add'>Add</option>
                <option value='subtract'>Subtract</option>
                <option value='intersect'>Intersect</option>
              </select>
            </label>
            {selectedTool === 'Magic Select' ? (
              <label className='flex items-center gap-1.25 text-xs font-bold text-[#c9cdd2]'>
                Similarity
                <input
                  className={maskBrushInputClass}
                  min='0'
                  max='100'
                  onChange={(event) =>
                    onMagicSelectionToleranceChange(Number(event.target.value))
                  }
                  type='number'
                  value={magicSelectionTolerance}
                />
              </label>
            ) : null}
          </div>
        ) : null}
        {selectedTool === 'Shape' ? (
          <div
            className='flex items-center gap-0.5 pl-1.5 pr-1 max-[1500px]:hidden'
            aria-label='Shape options'
          >
            <span className='text-xs font-bold text-[#8b929b] mr-1'>Type:</span>
            <button
              className={cn(
                'rounded-md border border-transparent p-1.5 transition-colors',
                selectedShape === 'rectangle'
                  ? 'border-[#4aa391] bg-[#25453e]'
                  : 'bg-transparent hover:bg-[#252930] border-[#2a2d31]',
              )}
              onClick={() => {
                onSelectTool('Shape');
                onSelectShape('rectangle' as ShapeKind);
              }}
              title='Rectangle'
              type='button'
              disabled={!canEditDocument}
            >
              <svg
                className='w-5 h-5'
                viewBox='0 0 24 24'
                fill='currentColor'
                style={{
                  color: selectedShape === 'rectangle' ? '#4aa391' : '#d9dde3',
                }}
              >
                <rect x='3' y='6' width='18' height='12' rx='1' />
              </svg>
            </button>
            <button
              className={cn(
                'rounded-md border border-transparent p-1.5 transition-colors',
                selectedShape === 'circle'
                  ? 'border-[#4aa391] bg-[#25453e]'
                  : 'bg-transparent hover:bg-[#252930] border-[#2a2d31]',
              )}
              onClick={() => {
                onSelectTool('Shape');
                onSelectShape('circle' as ShapeKind);
              }}
              title='Circle'
              type='button'
              disabled={!canEditDocument}
            >
              <svg
                className='w-5 h-5'
                viewBox='0 0 24 24'
                fill='currentColor'
                style={{
                  color: selectedShape === 'circle' ? '#4aa391' : '#d9dde3',
                }}
              >
                <circle cx='12' cy='12' r='9' />
              </svg>
            </button>
            <button
              className={cn(
                'rounded-md border border-transparent p-1.5 transition-colors',
                selectedShape === 'line'
                  ? 'border-[#4aa391] bg-[#25453e]'
                  : 'bg-transparent hover:bg-[#252930] border-[#2a2d31]',
              )}
              onClick={() => {
                onSelectTool('Shape');
                onSelectShape('line' as ShapeKind);
              }}
              title='Line'
              type='button'
              disabled={!canEditDocument}
            >
              <svg
                className='w-5 h-5'
                viewBox='0 0 24 24'
                stroke='currentColor'
                strokeWidth='2'
                fill='none'
                style={{
                  color: selectedShape === 'line' ? '#4aa391' : '#d9dde3',
                }}
              >
                <line x1='3' y1='21' x2='21' y2='3' />
              </svg>
            </button>
            <button
              className={cn(
                'rounded-md border border-transparent p-1.5 transition-colors',
                selectedShape === 'triangle'
                  ? 'border-[#4aa391] bg-[#25453e]'
                  : 'bg-transparent hover:bg-[#252930] border-[#2a2d31]',
              )}
              onClick={() => {
                onSelectTool('Shape');
                onSelectShape('triangle' as ShapeKind);
              }}
              title='Triangle'
              type='button'
              disabled={!canEditDocument}
            >
              <svg
                className='w-5 h-5'
                viewBox='0 0 24 24'
                fill='currentColor'
                style={{
                  color: selectedShape === 'triangle' ? '#4aa391' : '#d9dde3',
                }}
              >
                <polygon points='12,3 21,21 3,21' />
              </svg>
            </button>
            <button
              className={cn(
                'rounded-md border border-transparent p-1.5 transition-colors',
                selectedShape === 'diamond'
                  ? 'border-[#4aa391] bg-[#25453e]'
                  : 'bg-transparent hover:bg-[#252930] border-[#2a2d31]',
              )}
              onClick={() => {
                onSelectTool('Shape');
                onSelectShape('diamond' as ShapeKind);
              }}
              title='Diamond'
              type='button'
              disabled={!canEditDocument}
            >
              <svg
                className='w-5 h-5'
                viewBox='0 0 24 24'
                fill='currentColor'
                style={{
                  color: selectedShape === 'diamond' ? '#4aa391' : '#d9dde3',
                }}
              >
                <polygon points='12,2 22,12 12,22 2,12' />
              </svg>
            </button>
            <button
              className={cn(
                'rounded-md border border-transparent p-1.5 transition-colors',
                selectedShape === 'arrow'
                  ? 'border-[#4aa391] bg-[#25453e]'
                  : 'bg-transparent hover:bg-[#252930] border-[#2a2d31]',
              )}
              onClick={() => {
                onSelectTool('Shape');
                onSelectShape('arrow' as ShapeKind);
              }}
              title='Arrow'
              type='button'
              disabled={!canEditDocument}
            >
              <svg
                className='w-5 h-5'
                viewBox='0 0 24 24'
                fill='currentColor'
                style={{
                  color: selectedShape === 'arrow' ? '#4aa391' : '#d9dde3',
                }}
              >
                <path d='M5 12l9-7v4h6v6h-6v4z' />
              </svg>
            </button>
            <button
              className={cn(
                'rounded-md border border-transparent p-1.5 transition-colors',
                selectedShape === 'custom'
                  ? 'border-[#4aa391] bg-[#25453e]'
                  : 'bg-transparent hover:bg-[#252930] border-[#2a2d31]',
              )}
              onClick={() => {
                onSelectTool('Shape');
                onSelectShape('custom' as ShapeKind);
              }}
              title='Custom'
              type='button'
              disabled={!canEditDocument}
            >
              <svg
                className='w-5 h-5'
                viewBox='0 0 24 24'
                fill='currentColor'
                style={{
                  color: selectedShape === 'custom' ? '#4aa391' : '#d9dde3',
                }}
              >
                <path d='M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 9.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z' />
              </svg>
            </button>
          </div>
        ) : null}
        <input
          ref={documentImageInputRef}
          accept='image/*'
          className='absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0_0_0_0)]'
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (file) {
              onOpenImageDocument(file);
              event.target.value = '';
            }
          }}
          type='file'
        />
        <input
          ref={fileInputRef}
          accept='image/*'
          className='absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0_0_0_0)]'
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (file) {
              onUploadImage(file);
              event.target.value = '';
            }
          }}
          type='file'
        />
        <input
          ref={fontInputRef}
          accept='.ttf,.otf,.woff,font/ttf,font/otf,font/woff,application/font-woff,application/x-font-ttf,application/x-font-opentype'
          className='absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0_0_0_0)]'
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (file) {
              onImportFont(file);
              event.target.value = '';
            }
          }}
          type='file'
        />
        <input
          ref={projectInputRef}
          accept='.webster,application/zip,application/vnd.webster.project'
          className='absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0_0_0_0)]'
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (file) {
              onOpenProject(file, null);
              event.target.value = '';
            }
          }}
          type='file'
        />
      </nav>
      {isShortcutDialogOpen && typeof document !== 'undefined' ? createPortal(
        <div
          aria-label='Keyboard shortcuts'
          aria-modal='true'
          className='fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#050607]/72 px-5 py-8 backdrop-blur-md'
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsShortcutDialogOpen(false);
            }
          }}
          role='dialog'
        >
          <div className='grid w-[min(760px,100%)] max-h-[calc(100vh-64px)] gap-5 overflow-y-auto rounded-lg border border-[#3a414a] bg-[#17191d] p-5 shadow-[0_28px_72px_rgba(0,0,0,0.58)]'>
            <div className='flex items-center justify-between gap-4'>
              <h2 className='m-0 text-[20px] font-extrabold text-[#f2f4f7]'>
                Keyboard shortcuts
              </h2>
              <button
                aria-label='Close keyboard shortcuts'
                className='grid h-9 w-9 place-items-center rounded-md border border-[#333941] bg-[#202329] text-lg font-bold text-[#dce1e6] hover:border-[#4aa391] hover:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731]'
                onClick={() => setIsShortcutDialogOpen(false)}
                type='button'
              >
                x
              </button>
            </div>
            <div className='grid gap-4 sm:grid-cols-2'>
              {shortcutMenuGroups.map((group) => (
                <section className='grid content-start gap-2' key={group.label}>
                  <h3 className='m-0 text-[11px] font-extrabold uppercase tracking-normal text-[#8b929b]'>
                    {group.label}
                  </h3>
                  <div className='grid gap-2'>
                    {group.shortcuts.map(([keys, action]) => (
                      <div
                        className='grid min-h-10 grid-cols-[minmax(120px,auto)_1fr] items-center gap-3 rounded-md border border-[#30353d] bg-[#202329] px-3 py-2'
                        key={`${group.label}-${keys}`}
                      >
                        <kbd className='justify-self-start rounded border border-[#3b5f58] bg-[#10231f] px-2 py-1 text-[12px] font-extrabold text-[#79dac7]'>
                          {keys}
                        </kbd>
                        <span className='text-[13px] font-bold text-[#dce1e6]'>
                          {action}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
      {shouldShowEmailConfirmation && typeof document !== 'undefined' ? createPortal(
        <div
          aria-label='Confirm email'
          aria-modal='true'
          className='fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#050607]/72 px-5 py-8 backdrop-blur-md'
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsEmailConfirmationDismissed(true);
            }
          }}
          role='dialog'
        >
          <div className='grid w-[min(420px,100%)] gap-4 rounded-lg border border-[#3a414a] bg-[#17191d] p-5 shadow-[0_28px_72px_rgba(0,0,0,0.58)]'>
            <div className='grid gap-2'>
              <h2 className='m-0 text-[20px] font-extrabold text-[#f2f4f7]'>
                Confirm your email
              </h2>
              <p className='m-0 text-[13px] font-bold leading-5 text-[#a7b0b9]'>
                Check your inbox for the Auth0 verification email. Webster cloud
                projects, sharing, and comments unlock after your email is
                confirmed.
              </p>
              {user.email ? (
                <p className='m-0 rounded-md border border-[#33373d] bg-[#202329] px-3 py-2 text-[13px] font-bold text-[#dce1e6]'>
                  {user.email}
                </p>
              ) : null}
              {emailConfirmationMessage ? (
                <p className='m-0 text-[13px] font-bold leading-5 text-[#f0c98d]'>
                  {emailConfirmationMessage}
                </p>
              ) : null}
            </div>
            <div className='flex justify-end gap-2'>
              <button
                className='rounded-lg border border-[#333941] bg-[#202329] px-3 py-2 font-bold text-[#eef1f4] hover:border-[#4c535c] hover:bg-[#252930]'
                onClick={() => setIsEmailConfirmationDismissed(true)}
                type='button'
              >
                Continue local
              </button>
              <button
                className='rounded-lg border border-[#4aa391] bg-[#203731] px-3 py-2 font-bold text-[#eef1f4] hover:bg-[#25453e] disabled:cursor-wait disabled:opacity-70'
                disabled={isCheckingEmailConfirmation}
                onClick={() => void refreshEmailVerificationStatus()}
                type='button'
              >
                {isCheckingEmailConfirmation ? 'Checking...' : 'I confirmed it'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
      <div
        className='ml-auto flex min-w-0 shrink-0 items-center justify-end gap-2 overflow-visible text-[13px] text-[#c9cdd2] max-[760px]:hidden'
        aria-label='Current editor status'
      >
        <CompactStatusPill
          icon={<Cloud className='h-3.5 w-3.5' aria-hidden='true' />}
          label={
            isSharedMode
              ? getCollaborationStatusLabel(collaborationStatus, pendingCommitCount)
              : 'Local'
          }
          className='max-[1320px]:hidden'
        />
        {isSharedMode ? (
          <CompactStatusPill
            icon={<Users className='h-3.5 w-3.5' aria-hidden='true' />}
            label={`${onlineUserCount || 1}`}
            title={`${projectRole ?? 'shared'} - ${onlineUserCount || 1} online`}
            className='max-[1180px]:hidden'
          />
        ) : null}
        {canvasSize ? (
          <CompactStatusPill
            icon={<Ruler className='h-3.5 w-3.5' aria-hidden='true' />}
            label={formatCanvasSize(canvasSize)}
            onClick={onOpenCanvasResize}
            className='max-[1450px]:hidden'
          />
        ) : null}
        {canvasSize ? (
          <CompactStatusPill
            icon={<Circle className='h-3 w-3 fill-current' aria-hidden='true' />}
            label={`${zoomPercentage}%`}
            className='max-[1100px]:hidden'
          />
        ) : null}
        {saveStatus !== 'idle' ? (
          <span className={statusPillClass}>
            {getSaveStatusLabel(saveStatus)}
          </span>
        ) : null}
        {isAuthenticated ? (
          <div className='relative pl-1' ref={userMenuRef}>
            <button
              type='button'
              className='flex items-center gap-2'
              aria-label={`Account menu for ${displayName}`}
              title={displayName}
              onClick={() => setIsUserMenuOpen((o) => !o)}
            >
              <Avatar>
                {avatarSrc ? (
                  <AvatarImage src={avatarSrc} alt={displayName} className='grayscale' />
                ) : null}
                <AvatarFallback>{avatarFallback}</AvatarFallback>
              </Avatar>
            </button>
            {isUserMenuOpen ? (
              <div className='absolute right-0 top-[calc(100%+8px)] z-20 w-44 rounded-lg border border-[#33373d] bg-[#17191d] p-1.5 shadow-[0_18px_34px_rgba(0,0,0,0.35)]'>
                <Link
                  href='/profile'
                  className={toolbarMenuItemClass}
                  onClick={() => setIsUserMenuOpen(false)}
                >
                  Profile
                </Link>
                <button
                  type='button'
                  className={toolbarMenuItemClass}
                  onClick={() => logout({ logoutParams: { returnTo: typeof window !== 'undefined' ? window.location.origin : '' } })}
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <button
            type='button'
            onClick={() => void loginWithRedirect()}
            className='flex items-center gap-2 hover:bg-[#252930] rounded-lg border border-transparent hover:border-[#4c535c] px-2.5 py-2 '
          >
            <Image
              src='/icons/user-icon.svg'
              alt='User'
              width={16}
              height={16}
            />
            <p className='text-[13px] text-[#c9cdd2] hover:text-[#dce1e6]'>
              Registration/Login
            </p>
          </button>
        )}
      </div>
    </header>
  );
}

function formatStrokeTargetValue(
  mode: 'layer' | 'new' | 'selected',
  layerId: string | null,
) {
  if (mode === 'layer' && layerId) {
    return `layer:${layerId}`;
  }

  return mode;
}

function parseStrokeTarget(value: string): StrokeTargetSelection {
  if (value === 'selected') {
    return { layerId: null, mode: 'selected' };
  }

  if (value.startsWith('layer:')) {
    return { layerId: value.slice('layer:'.length), mode: 'layer' };
  }

  return { layerId: null, mode: 'new' };
}

function toStrokeStyle(value: string): StrokeStyle {
  if (
    value === 'pen' ||
    value === 'brush' ||
    value === 'marker' ||
    value === 'highlighter'
  ) {
    return value;
  }

  return 'pencil';
}

function colorToHex(color: [number, number, number, number]) {
  return `#${color
    .slice(0, 3)
    .map((channel) =>
      Math.round(channel * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function hexToColor(hex: string, alpha = 1): [number, number, number, number] {
  const value = hex.replace('#', '');
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);

  return [
    Number.isFinite(red) ? red / 255 : 0,
    Number.isFinite(green) ? green / 255 : 0,
    Number.isFinite(blue) ? blue / 255 : 0,
    alpha,
  ];
}

function isSelectionToolSelected(tool: string) {
  return (
    tool === 'Rectangle Select' ||
    tool === 'Ellipse Select' ||
    tool === 'Lasso Select' ||
    tool === 'Magic Select'
  );
}

function toSelectionMode(value: string): SelectionMode {
  if (value === 'add' || value === 'subtract' || value === 'intersect') {
    return value;
  }

  return 'replace';
}

function toShapeKind(value: string): ShapeKind {
  if (
    value === 'circle' ||
    value === 'line' ||
    value === 'triangle' ||
    value === 'diamond' ||
    value === 'arrow' ||
    value === 'custom'
  ) {
    return value;
  }

  return 'rectangle';
}

function promptPositiveNumber(label: string, fallback: number) {
  const value = window.prompt(label, String(fallback));

  if (value === null) {
    return null;
  }

  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

function MenuSeparator() {
  return <div className='my-1 h-px bg-[#2b3037]' role='separator' />;
}

function CompactStatusPill({
  className,
  icon,
  label,
  onClick,
  title,
}: {
  className?: string;
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  title?: string;
}) {
  const content = (
    <>
      <span className='text-[#7bdac8]'>{icon}</span>
      <span className='truncate'>{label}</span>
    </>
  );
  const classes = cn(compactStatusPillClass, className);

  if (onClick) {
    return (
      <button className={classes} onClick={onClick} title={title ?? label} type='button'>
        {content}
      </button>
    );
  }

  return (
    <span className={classes} title={title ?? label}>
      {content}
    </span>
  );
}

function ToolbarToolOptions({
  canEditDocument,
  magicSelectionTolerance,
  maskBrushOptions,
  onMagicSelectionToleranceChange,
  onMaskBrushOptionsChange,
  onSelectShape,
  onSelectTool,
  onSelectionModeChange,
  onStrokeColorChange,
  onStrokeModeChange,
  onStrokeStyleChange,
  onStrokeTargetChange,
  onStrokeWidthChange,
  selectedSelectionMode,
  selectedShape,
  selectedStrokeColor,
  selectedStrokeMode,
  selectedStrokeStyle,
  selectedStrokeTargetLayerId,
  selectedStrokeTargetMode,
  selectedStrokeWidth,
  selectedTool,
  strokeLayers,
}: Pick<
  ToolbarProps,
  | 'canEditDocument'
  | 'magicSelectionTolerance'
  | 'maskBrushOptions'
  | 'onMagicSelectionToleranceChange'
  | 'onMaskBrushOptionsChange'
  | 'onSelectShape'
  | 'onSelectTool'
  | 'onSelectionModeChange'
  | 'onStrokeColorChange'
  | 'onStrokeModeChange'
  | 'onStrokeStyleChange'
  | 'onStrokeTargetChange'
  | 'onStrokeWidthChange'
  | 'selectedSelectionMode'
  | 'selectedShape'
  | 'selectedStrokeColor'
  | 'selectedStrokeMode'
  | 'selectedStrokeStyle'
  | 'selectedStrokeTargetLayerId'
  | 'selectedStrokeTargetMode'
  | 'selectedStrokeWidth'
  | 'selectedTool'
  | 'strokeLayers'
>) {
  if (selectedTool === 'Mask Brush') {
    return (
      <div className='grid gap-3' aria-label='Mask brush options'>
        <label className={toolbarOptionsLabelClass}>
          Size
          <input
            className={maskBrushInputClass}
            min='1'
            max='256'
            onChange={(event) =>
              onMaskBrushOptionsChange({ size: Number(event.target.value) })
            }
            type='number'
            value={maskBrushOptions.size}
          />
        </label>
        <label className={toolbarOptionsLabelClass}>
          Opacity
          <input
            className={maskBrushInputClass}
            min='1'
            max='100'
            onChange={(event) =>
              onMaskBrushOptionsChange({
                opacity: Number(event.target.value) / 100,
              })
            }
            type='number'
            value={Math.round(maskBrushOptions.opacity * 100)}
          />
        </label>
        <label className={toolbarOptionsLabelClass}>
          Mode
          <select
            className={cn(maskBrushInputClass, 'w-30.5')}
            onChange={(event) =>
              onMaskBrushOptionsChange({
                mode: event.target.value === 'hide' ? 'hide' : 'reveal',
              })
            }
            value={maskBrushOptions.mode}
          >
            <option value='reveal'>Reveal white</option>
            <option value='hide'>Hide black</option>
          </select>
        </label>
      </div>
    );
  }

  if (selectedTool === 'Draw') {
    return (
      <div className='grid gap-3' aria-label='Draw options'>
        <label className={toolbarOptionsLabelClass}>
          Target
          <select
            className={cn(maskBrushInputClass, 'w-39')}
            onChange={(event) =>
              onStrokeTargetChange(parseStrokeTarget(event.target.value))
            }
            value={formatStrokeTargetValue(
              selectedStrokeTargetMode,
              selectedStrokeTargetLayerId,
            )}
          >
            <option value='new'>New layer</option>
            <option value='selected'>Selected stroke layer</option>
            {strokeLayers.map((layer) => (
              <option key={layer.id} value={`layer:${layer.id}`}>
                {layer.name}
              </option>
            ))}
          </select>
        </label>
        <label className={toolbarOptionsLabelClass}>
          Type
          <select
            className={cn(maskBrushInputClass, 'w-29.5')}
            onChange={(event) =>
              onStrokeStyleChange(toStrokeStyle(event.target.value))
            }
            value={selectedStrokeStyle}
          >
            <option value='pencil'>Pencil</option>
            <option value='pen'>Pen</option>
            <option value='brush'>Brush</option>
            <option value='marker'>Marker</option>
            <option value='highlighter'>Highlighter</option>
          </select>
        </label>
        <label className={toolbarOptionsLabelClass}>
          Color
          <input
            aria-label='Draw color'
            className='h-8.5 w-12 rounded-md border border-[#33373d] bg-[#101113] p-1'
            onChange={(event) =>
              onStrokeColorChange(
                hexToColor(event.target.value, selectedStrokeColor[3]),
              )
            }
            type='color'
            value={colorToHex(selectedStrokeColor)}
          />
        </label>
        <label className={toolbarOptionsLabelClass}>
          Size
          <input
            className={maskBrushInputClass}
            min='1'
            max='256'
            onChange={(event) => onStrokeWidthChange(Number(event.target.value))}
            type='number'
            value={selectedStrokeWidth}
          />
        </label>
        <button
          className={cn(
            toolbarButtonClass,
            selectedStrokeMode === 'erase' && 'border-[#4aa391] bg-[#203731]',
          )}
          onClick={() =>
            onStrokeModeChange(selectedStrokeMode === 'erase' ? 'draw' : 'erase')
          }
          type='button'
        >
          {selectedStrokeMode === 'erase' ? 'Draw' : 'Eraser'}
        </button>
      </div>
    );
  }

  if (isSelectionToolSelected(selectedTool)) {
    return (
      <div className='grid gap-3' aria-label='Selection options'>
        <label className={toolbarOptionsLabelClass}>
          Mode
          <select
            className={cn(maskBrushInputClass, 'w-29.5')}
            onChange={(event) =>
              onSelectionModeChange(toSelectionMode(event.target.value))
            }
            value={selectedSelectionMode}
          >
            <option value='replace'>Replace</option>
            <option value='add'>Add</option>
            <option value='subtract'>Subtract</option>
            <option value='intersect'>Intersect</option>
          </select>
        </label>
        {selectedTool === 'Magic Select' ? (
          <label className={toolbarOptionsLabelClass}>
            Similarity
            <input
              className={maskBrushInputClass}
              min='0'
              max='100'
              onChange={(event) =>
                onMagicSelectionToleranceChange(Number(event.target.value))
              }
              type='number'
              value={magicSelectionTolerance}
            />
          </label>
        ) : null}
      </div>
    );
  }

  if (selectedTool === 'Shape') {
    const shapeOptions: Array<{ kind: ShapeKind; label: string }> = [
      { kind: 'rectangle', label: 'Rectangle' },
      { kind: 'circle', label: 'Circle' },
      { kind: 'line', label: 'Line' },
      { kind: 'triangle', label: 'Triangle' },
      { kind: 'diamond', label: 'Diamond' },
      { kind: 'arrow', label: 'Arrow' },
      { kind: 'custom', label: 'Custom' },
    ];

    return (
      <div className='grid gap-2' aria-label='Shape options'>
        <span className='text-xs font-bold text-[#8b929b]'>Type</span>
        <div className='flex flex-wrap gap-1'>
          {shapeOptions.map((shape) => (
            <button
              className={cn(
                'rounded-md border px-2.5 py-1.5 text-xs font-bold transition-colors',
                selectedShape === shape.kind
                  ? 'border-[#4aa391] bg-[#25453e] text-[#dff7f1]'
                  : 'border-[#2a2d31] bg-transparent text-[#d9dde3] hover:bg-[#252930]',
              )}
              disabled={!canEditDocument}
              key={shape.kind}
              onClick={() => {
                onSelectTool('Shape');
                onSelectShape(shape.kind);
              }}
              type='button'
            >
              {shape.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

function hasContextualToolOptions(tool: string) {
  return (
    tool === 'Mask Brush' ||
    tool === 'Draw' ||
    tool === 'Shape' ||
    isSelectionToolSelected(tool)
  );
}

function formatCanvasSize(size: { height: number; width: number }) {
  return `${Math.round(size.width)} x ${Math.round(size.height)} px`;
}

function isImageLayerSummary(
  layer: LayerSummary | null,
): layer is LayerSummary & {
  canRestoreOriginalPixels: boolean;
  imagePixelHeight: number;
  imagePixelWidth: number;
} {
  return Boolean(layer && layer.type === 'image' && 'imagePixelWidth' in layer);
}

function closeAllMenus(root: HTMLElement) {
  for (const menu of root.querySelectorAll('details.toolbar-menu')) {
    menu.removeAttribute('open');
  }
}

const toolbarButtonClass =
  'block cursor-default list-none rounded-lg border border-transparent bg-transparent px-2.5 py-2 text-[13px] text-[#d9dde3] hover:border-[#4c535c] hover:bg-[#252930] focus-visible:border-[#4c535c] focus-visible:bg-[#252930] [&::-webkit-details-marker]:hidden [.toolbar-menu[open]_&]:border-[#4c535c] [.toolbar-menu[open]_&]:bg-[#252930]';

const toolbarMenuClass =
  'absolute left-0 top-[calc(100%+14px)] z-50 grid w-[280px] rounded-lg border border-[#33373d] bg-[#17191d] p-1.5 shadow-[0_18px_34px_rgba(0,0,0,0.35)]';

const toolbarOptionsMenuClass =
  'absolute left-0 top-[calc(100%+14px)] z-50 grid w-[300px] rounded-lg border border-[#33373d] bg-[#17191d] p-3 shadow-[0_18px_34px_rgba(0,0,0,0.35)]';

const toolbarMenuItemClass =
  'flex w-full items-center justify-between gap-3 rounded-lg border border-transparent bg-transparent px-2.5 py-2 text-left text-[13px] text-[#eef1f4] hover:border-[#4c535c] hover:bg-[#252930] focus-visible:border-[#4c535c] focus-visible:bg-[#252930] disabled:cursor-not-allowed disabled:text-[#6f7680] disabled:hover:border-transparent disabled:hover:bg-transparent';

const toolbarMenuHintClass =
  'ml-auto text-[10px] uppercase tracking-normal text-[#7f8791]';

const maskBrushInputClass =
  'w-[74px] rounded-md border border-[#33373d] bg-[#101113] px-[7px] py-1.5 text-[#eef1f4] font-[inherit]';

const toolbarOptionsLabelClass =
  'flex items-center justify-between gap-3 text-xs font-bold text-[#c9cdd2]';

const statusPillClass =
  'rounded-lg border border-[#33373d] bg-[#22252a] px-2.5 py-[7px]';

const compactStatusPillClass =
  'flex h-6 max-w-36 shrink-0 items-center gap-1.5 rounded-md border border-[#33373d] bg-[#202329] px-2 text-[10px] font-extrabold uppercase tracking-normal text-[#cfd5dc]';

const titleBadgeClass =
  'rounded-md border border-[#33373d] bg-[#22252a] px-2 py-0.5 text-[10px] font-extrabold uppercase text-[#aeb6bf]';

const statusButtonClass =
  'rounded-lg border border-[#33373d] bg-[#22252a] px-2.5 py-[7px] text-[#c9cdd2] hover:border-[#4aa391] hover:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731]';

function getAvatarInitials(name: string) {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function capitalizeRole(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function getSaveStatusLabel(status: SaveStatus) {
  if (status === 'saving') {
    return 'Saving...';
  }

  if (status === 'saved') {
    return 'Saved';
  }

  return 'Save failed';
}

function getCollaborationStatusLabel(
  status: 'connected' | 'connecting' | 'disconnected' | 'reconnecting',
  pendingCommitCount: number,
) {
  if (pendingCommitCount > 0) {
    return `Unsynced ${pendingCommitCount}`;
  }

  switch (status) {
    case 'connected':
      return 'Shared connected';
    case 'connecting':
      return 'Shared connecting';
    case 'reconnecting':
      return 'Shared reconnecting';
    case 'disconnected':
      return 'Shared disconnected';
  }
}
