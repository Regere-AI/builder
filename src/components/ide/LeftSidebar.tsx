import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react'
import { Folder, ChevronRight, FilePlus, FolderPlus, FileJson, ChevronDown, FolderOpen, Search, Package, LayoutDashboard, GitBranch, FileText, Layers, Plus, Trash2, X, Sparkles } from 'lucide-react'
import { Tree } from 'react-arborist'
import type { NodeRendererProps } from 'react-arborist'
import type { TreeApi } from 'react-arborist'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { cn } from '@/lib/utils'
import {
  appReadDir,
  appReadTextFile,
  appWriteTextFile,
  appCreateDir,
  appRename,
  appMove,
  appDelete,
} from '@/desktop'
import type { ActiveApp } from './IDELayout'
import { GitPanel } from './GitPanel'

function pathJoin(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .join('/')
    .replace(/\\/g, '/')
}

function pathDirname(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  return idx <= 0 ? normalized : normalized.slice(0, idx)
}

function findNode(nodes: TreeNode[], path: string): TreeNode | null {
  for (const node of nodes) {
    if (node.path === path) return node
    if (node.children) {
      const found = findNode(node.children, path)
      if (found) return found
    }
  }
  return null
}

type FileIconComponent = typeof FileJson
function getFileIcon(name: string): FileIconComponent {
  const n = name.toLowerCase()
  if (n.endsWith('.app.manifest.json')) return Package
  if (n.endsWith('.ui.json')) return LayoutDashboard
  if (n.endsWith('.workflow.json')) return GitBranch
  return FileJson
}

function getFileIconClass(name: string): string {
  const n = name.toLowerCase()
  if (n.endsWith('.app.manifest.json')) return 'text-amber-500/90'
  if (n.endsWith('.ui.json')) return 'text-blue-400/90'
  if (n.endsWith('.workflow.json')) return 'text-emerald-500/90'
  return 'text-blue-400/90'
}

async function loadDirRecursive(dirPath: string): Promise<TreeNode[]> {
  const entries = await appReadDir(dirPath)
  const nodes: TreeNode[] = []
  for (const e of entries) {
    const fullPath = pathJoin(dirPath, e.name)
    const node: TreeNode = {
      name: e.name,
      path: fullPath,
      isDir: e.isDir,
    }
    if (e.isDir) {
      try {
        node.children = await loadDirRecursive(fullPath)
      } catch {
        node.children = []
      }
    }
    nodes.push(node)
  }
  return nodes.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
}

const PENDING_FILE = '__pending_file__'
const PENDING_FOLDER = '__pending_folder__'

function injectPendingNode(
  nodes: TreeNode[],
  parentPath: string,
  rootPath: string,
  pendingNode: TreeNode
): TreeNode[] {
  if (parentPath === rootPath) {
    return [...nodes, pendingNode]
  }
  return nodes.map((node) => {
    if (node.path === parentPath) {
      const children = [...(node.children || []), pendingNode]
      children.sort((a, b) =>
        a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1
      )
      return { ...node, children }
    }
    if (node.children) {
      return {
        ...node,
        children: injectPendingNode(node.children, parentPath, rootPath, pendingNode),
      }
    }
    return node
  })
}

interface SidebarNodeProps extends NodeRendererProps<TreeNode> {
  selectedPath: string | null
  onSelectPath: (path: string) => void
  isPendingNode?: boolean
  pendingNewItem?: { type: 'file' | 'folder'; parentPath: string } | null
  pendingNewItemName?: string
  pendingInputRef?: React.RefObject<HTMLInputElement | null>
  onPendingKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onPendingBlur?: () => void
  onPendingChange?: (value: string) => void
  onDeleteNodes?: (ids: string[]) => void
  onNewFile?: (parentPath: string) => void
  onNewFolder?: (parentPath: string) => void
}

function SidebarNode({
  node,
  style,
  dragHandle,
  selectedPath,
  onSelectPath,
  isPendingNode,
  pendingNewItem,
  pendingNewItemName = '',
  pendingInputRef,
  onPendingKeyDown,
  onPendingBlur,
  onPendingChange,
  onDeleteNodes,
  onNewFile,
  onNewFolder,
}: SidebarNodeProps) {
  const data = node.data
  const isSelected = data.path === selectedPath
  const parentPathForNew = data.isDir ? data.path : pathDirname(data.path)

  if (isPendingNode && pendingNewItem) {
    const isFile = pendingNewItem.type === 'file'
    return (
      <div
        style={style}
        className="flex items-center gap-1 py-0.5 px-1 rounded text-sm min-w-0"
        onKeyDownCapture={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter' || e.key === 'Escape') {
            e.preventDefault()
            onPendingKeyDown?.(e as unknown as React.KeyboardEvent<HTMLInputElement>)
          }
        }}
      >
        <span className="w-3.5 shrink-0" />
        {isFile ? (
          <FileJson className="w-4 h-4 shrink-0 text-blue-400/90" />
        ) : (
          <Folder className="w-4 h-4 shrink-0 text-amber-500/90" />
        )}
        <input
          ref={pendingInputRef}
          type="text"
          value={pendingNewItemName}
          onChange={(e) => onPendingChange?.(e.target.value)}
          onKeyDown={onPendingKeyDown}
          onBlur={onPendingBlur}
          placeholder={isFile ? 'New file name' : 'New folder name'}
          className="flex-1 min-w-0 bg-[#3c3c3c] border border-[#007acc] rounded px-1 py-0.5 text-gray-200 text-sm outline-none"
        />
      </div>
    )
  }

  if (node.isEditing) {
    return (
      <div
        style={style}
        className="flex items-center gap-1 py-0.5 px-1 rounded text-sm min-w-0"
      >
        {data.isDir ? (
          <>
            <span className="shrink-0 flex items-center justify-center w-3.5">
              <Folder className="w-4 h-4 shrink-0 text-amber-500/90" />
            </span>
            <span className="w-3.5 shrink-0" />
          </>
        ) : (
          <>
            <span className="w-3.5 shrink-0" />
            {(() => {
              const Icon = getFileIcon(data.name)
              return <Icon className={cn('w-4 h-4 shrink-0', getFileIconClass(data.name))} />
            })()}
          </>
        )}
        <input
          type="text"
          defaultValue={data.name}
          autoFocus
          className="flex-1 min-w-0 bg-[#3c3c3c] border border-[#007acc] rounded px-1 py-0.5 text-gray-200 text-sm outline-none"
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') {
              e.preventDefault()
              const value = (e.currentTarget.value || '').trim()
              if (value) node.submit(value)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              node.reset()
            }
          }}
          onBlur={(e) => {
            const value = (e.currentTarget.value || '').trim()
            if (value) node.submit(value)
            else node.reset()
          }}
        />
      </div>
    )
  }

  const rowContent = (
    <div
      className={cn(
        'flex items-center gap-1 py-0.5 px-1 rounded text-left text-sm cursor-pointer min-w-0 w-full overflow-hidden',
        isSelected ? 'bg-[#094771] hover:bg-[#094771]' : 'hover:bg-[#2a2d2e]'
      )}
      onClick={(e) => {
        e.stopPropagation()
        onSelectPath(data.path)
        if (data.isDir) {
          node.toggle()
        }
        node.handleClick(e)
      }}
    >
      {!data.isDir ? (
        <>
          <span className="w-3.5 shrink-0" />
          {(() => {
            const Icon = getFileIcon(data.name)
            return <Icon className={cn('w-4 h-4 shrink-0', getFileIconClass(data.name))} />
          })()}
        </>
      ) : (
        <>
          <span
            className="shrink-0 flex items-center justify-center w-3.5"
            onClick={(e) => {
              e.stopPropagation()
              node.toggle()
            }}
          >
            {node.isOpen ? (
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
            )}
          </span>
          {node.isOpen ? (
            <FolderOpen className="w-4 h-4 shrink-0 text-amber-500/90" />
          ) : (
            <Folder className="w-4 h-4 shrink-0 text-amber-500/90" />
          )}
        </>
      )}
      <span className="truncate min-w-0" title={data.name}>{data.name}</span>
    </div>
  )

  return (
    <div
      ref={isPendingNode ? undefined : dragHandle}
      style={style}
      className="flex items-center min-w-0"
    >
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>{rowContent}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className="min-w-[160px] rounded-md bg-[#252526] border border-[#3e3e3e] shadow-lg p-1 z-50"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <ContextMenu.Item
            className="rounded px-2 py-1.5 text-sm text-gray-200 outline-none cursor-pointer hover:bg-[#094771] focus:bg-[#094771]"
            onSelect={() => node.edit()}
          >
            Rename
          </ContextMenu.Item>
          <ContextMenu.Item
            className="rounded px-2 py-1.5 text-sm text-gray-200 outline-none cursor-pointer hover:bg-[#094771] focus:bg-[#094771]"
            onSelect={() => {
              if (navigator.clipboard?.writeText) navigator.clipboard.writeText(data.path)
            }}
          >
            Copy path
          </ContextMenu.Item>
          <ContextMenu.Item
            className="rounded px-2 py-1.5 text-sm text-gray-200 outline-none cursor-pointer hover:bg-[#094771] focus:bg-[#094771]"
            onSelect={() => {
              const sel = node.tree.state.nodes.selection
              const ids = sel.ids.size > 0 ? Array.from(sel.ids) as string[] : [node.id]
              onDeleteNodes?.(ids)
            }}
          >
            Delete
          </ContextMenu.Item>
          <ContextMenu.Separator className="h-px bg-[#3e3e3e] my-1" />
          <ContextMenu.Item
            className="rounded px-2 py-1.5 text-sm text-gray-200 outline-none cursor-pointer hover:bg-[#094771] focus:bg-[#094771]"
            onSelect={() => onNewFile?.(parentPathForNew)}
          >
            New File
          </ContextMenu.Item>
          <ContextMenu.Item
            className="rounded px-2 py-1.5 text-sm text-gray-200 outline-none cursor-pointer hover:bg-[#094771] focus:bg-[#094771]"
            onSelect={() => onNewFolder?.(parentPathForNew)}
          >
            New Folder
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
      </ContextMenu.Root>
    </div>
  )
}

interface LeftSidebarProps {
  expanded: boolean
  onToggle: () => void
  sidebarView: 'files' | 'git'
  onSidebarViewChange: (view: 'files' | 'git') => void
  activeApp: ActiveApp | null
  onOpenApp: (app: ActiveApp | null) => void
  onCloseApp: () => void
  onOpenFile?: (path: string, content: string, options?: { fromGit?: boolean }) => void
  /** Called after files/folders are deleted so the editor can close them. */
  onDeletePaths?: (paths: string[]) => void
  /** Increment to refresh the file tree (e.g. after chat creates a file in the app). */
  refreshTrigger?: number
}

interface TreeNode {
  name: string
  path: string
  isDir: boolean
  children?: TreeNode[]
}

export function LeftSidebar({
  expanded,
  onToggle,
  sidebarView,
  onSidebarViewChange,
  activeApp,
  onOpenApp: _onOpenApp,
  onCloseApp: _onCloseApp,
  onOpenFile,
  onDeletePaths,
  refreshTrigger,
}: LeftSidebarProps) {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [pendingNewItem, setPendingNewItem] = useState<{ type: 'file' | 'folder'; parentPath: string } | null>(null)
  const [pendingNewItemName, setPendingNewItemName] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [deleteConfirmPending, setDeleteConfirmPending] = useState<string[] | null>(null)
  const [showCreateFileDialog, setShowCreateFileDialog] = useState(false)
  const [createParentPathOverride, setCreateParentPathOverride] = useState<string | null>(null)
  const [createFileKind, setCreateFileKind] = useState<'app' | 'ui' | 'workflow' | null>(null)
  const [createAppName, setCreateAppName] = useState('')

  const [createAppUrlPathPrefix, setCreateAppUrlPathPrefix] = useState('')
  const [createFileName, setCreateFileName] = useState('')
  const pendingInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (pendingNewItem) {
      setPendingNewItemName('')
      setError(null)
      const t = setTimeout(() => pendingInputRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [pendingNewItem])

  // Restore focus when it is lost after typing (e.g. tree re-render unmounts/remounts the row)
  useLayoutEffect(() => {
    if (!pendingNewItem || !pendingInputRef.current) return
    const id = requestAnimationFrame(() => {
      if (pendingInputRef.current && document.activeElement !== pendingInputRef.current) {
        pendingInputRef.current.focus()
      }
    })
    return () => cancelAnimationFrame(id)
  }, [pendingNewItem, pendingNewItemName])

  const loadTree = useCallback(async (rootPath: string, options?: { silent?: boolean }) => {
    const silent = options?.silent === true
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const entries = await appReadDir(rootPath)
      const rootNodes: TreeNode[] = []
      for (const e of entries) {
        const fullPath = pathJoin(rootPath, e.name)
        const node: TreeNode = {
          name: e.name,
          path: fullPath,
          isDir: e.isDir,
        }
        if (e.isDir) {
          try {
            node.children = await loadDirRecursive(fullPath)
          } catch {
            node.children = []
          }
        }
        rootNodes.push(node)
      }
      rootNodes.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
      setTree(rootNodes)
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : String(e))
      if (!silent) setTree([])
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  // Initial load when app is selected (show loading state)
  useEffect(() => {
    if (activeApp?.rootPath) {
      loadTree(activeApp.rootPath)
    } else {
      setTree([])
      setError(null)
    }
  }, [activeApp?.rootPath, loadTree])

  // Silent refresh when e.g. chat creates a file (keep tree visible, no loading overlay)
  useEffect(() => {
    if (activeApp?.rootPath && refreshTrigger != null && refreshTrigger > 0) {
      loadTree(activeApp.rootPath, { silent: true })
    }
  }, [refreshTrigger, activeApp?.rootPath, loadTree])

  const getCreateTargetParentPath = useCallback((): string => {
    if (!activeApp) return ''
    if (!selectedPath) return activeApp.rootPath
    const node = findNode(tree, selectedPath)
    if (node?.isDir) return selectedPath
    return pathDirname(selectedPath)
  }, [activeApp, selectedPath, tree])

  const openCreateFileDialog = useCallback((parentPathOverride?: string) => {
    setCreateParentPathOverride(parentPathOverride ?? null)
    setCreateFileKind(null)
    setCreateAppName('')
    setCreateAppUrlPathPrefix('')
    setCreateFileName('')
    setShowCreateFileDialog(true)
  }, [])

  const handleCreateFile = () => {
    if (!activeApp) return
    openCreateFileDialog()
  }

  const handleCreateFolder = () => {
    if (!activeApp) return
    const parentPath = getCreateTargetParentPath()
    setPendingNewItem({ type: 'folder', parentPath })
  }

  const submitPendingNewItem = useCallback(async () => {
    const name = pendingNewItemName.trim()
    const type = pendingTypeRef.current
    if (!name || !pendingNewItem || !activeApp) return
    setError(null)
    const fullPath = pathJoin(pendingNewItem.parentPath, name)
    try {
      if (type === 'file') {
        const initialContent = name.endsWith('.json') ? '{}' : ''
        await appWriteTextFile(fullPath, initialContent)
        await loadTree(activeApp.rootPath)
        setPendingNewItem(null)
        setPendingNewItemName('')
        if (onOpenFile) onOpenFile(fullPath, initialContent)
      } else {
        await appCreateDir(fullPath, true)
        await loadTree(activeApp.rootPath)
        setPendingNewItem(null)
        setPendingNewItemName('')
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      setError(errMsg)
    }
  }, [pendingNewItem, pendingNewItemName, activeApp, onOpenFile, loadTree])

  const cancelPendingNewItem = useCallback(() => {
    setPendingNewItem(null)
    setPendingNewItemName('')
  }, [])

  const closeCreateFileDialog = useCallback(() => {
    setShowCreateFileDialog(false)
    setCreateParentPathOverride(null)
    setCreateFileKind(null)
    setCreateAppName('')
    setCreateAppUrlPathPrefix('')
    setCreateFileName('')
    setError(null)
  }, [])

  const getCreateParentPath = useCallback(() => {
    return createParentPathOverride ?? getCreateTargetParentPath()
  }, [createParentPathOverride, getCreateTargetParentPath])

  const submitCreateApp = useCallback(async () => {
    if (!activeApp) return
    const name = createAppName.trim()
    const urlPathPrefix = createAppUrlPathPrefix.trim()
    if (!name) return
    if (!urlPathPrefix) {
      setError('URL relative path prefix is required')
      return
    }
    setError(null)
    const slug = name.toLowerCase().replace(/\s+/g, '-')
    const basePath = getCreateParentPath()
    const appDir = pathJoin(basePath, slug)
    const manifestPath = pathJoin(appDir, `${slug}.app.manifest.json`)
    const manifestContent = JSON.stringify(
      { id: slug, name, version: '1.0.0', urlPathPrefix },
      null,
      2
    )
    try {
      await appCreateDir(appDir, true)
      await appWriteTextFile(manifestPath, manifestContent)
      await loadTree(activeApp.rootPath)
      closeCreateFileDialog()
      if (onOpenFile) onOpenFile(manifestPath, manifestContent)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [activeApp, createAppName, createAppUrlPathPrefix, getCreateParentPath, loadTree, onOpenFile, closeCreateFileDialog])

  const submitCreateUi = useCallback(async () => {
    if (!activeApp) return
    let name = createFileName.trim().toLowerCase()
    if (!name) return
    if (!name.endsWith('.ui.json')) name += '.ui.json'
    setError(null)
    const fullPath = pathJoin(getCreateParentPath(), name)
    try {
      await appWriteTextFile(fullPath, '{}')
      await loadTree(activeApp.rootPath)
      closeCreateFileDialog()
      if (onOpenFile) onOpenFile(fullPath, '{}')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [activeApp, createFileName, getCreateParentPath, loadTree, onOpenFile, closeCreateFileDialog])

  const submitCreateWorkflow = useCallback(async () => {
    if (!activeApp) return
    let name = createFileName.trim().toLowerCase()
    if (!name) return
    if (!name.endsWith('.workflow.json')) name += '.workflow.json'
    setError(null)
    const fullPath = pathJoin(getCreateParentPath(), name)
    try {
      await appWriteTextFile(fullPath, '{}')
      await loadTree(activeApp.rootPath)
      closeCreateFileDialog()
      if (onOpenFile) onOpenFile(fullPath, '{}')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [activeApp, createFileName, getCreateParentPath, loadTree, onOpenFile, closeCreateFileDialog])

  const handlePendingKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      submitPendingNewItem()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      cancelPendingNewItem()
    }
  }

  const handlePendingBlur = () => {
    if (pendingNewItemName.trim()) {
      submitPendingNewItem()
    } else {
      cancelPendingNewItem()
    }
  }

  const handleFileClick = async (path: string, options?: { fromGit?: boolean }) => {
    if (!onOpenFile) return
    try {
      const content = await appReadTextFile(path)
      onOpenFile(path, content, options)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleMove = useCallback(
    async (args: { dragIds: string[]; parentId: string | null; parentNode: unknown }) => {
      if (!activeApp?.rootPath) return
      const toDir = args.parentId ?? activeApp.rootPath
      setError(null)
      try {
        for (const id of args.dragIds) {
          await appMove(id, toDir)
        }
        await loadTree(activeApp.rootPath)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [activeApp?.rootPath, loadTree]
  )

  const handleRename = useCallback(
    async (args: { id: string; name: string }) => {
      if (!activeApp?.rootPath) return
      setError(null)
      try {
        await appRename(args.id, args.name)
        await loadTree(activeApp.rootPath)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [activeApp?.rootPath, loadTree]
  )

  const handleDelete = useCallback((args: { ids: string[] }) => {
    if (!activeApp?.rootPath) return
    setDeleteConfirmPending(args.ids)
  }, [activeApp?.rootPath])

  const executeDelete = useCallback(
    async (ids: string[]) => {
      if (!activeApp?.rootPath) return
      setError(null)
      try {
        for (const id of ids) {
          await appDelete(id, true)
        }
        onDeletePaths?.(ids)
        await loadTree(activeApp.rootPath)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setDeleteConfirmPending(null)
      }
    },
    [activeApp?.rootPath, loadTree, onDeletePaths]
  )

  const treeContainerRef = useRef<HTMLDivElement>(null)
  const treeRef = useRef<TreeApi<TreeNode> | null | undefined>(null)

  const pendingTypeRef = useRef<'file' | 'folder'>('file')
  if (pendingNewItem) pendingTypeRef.current = pendingNewItem.type

  const treeWithPending = useMemo(() => {
    if (!pendingNewItem || !activeApp) return tree
    return injectPendingNode(
      tree,
      pendingNewItem.parentPath,
      activeApp.rootPath,
      {
        name: '',
        path: `${pendingNewItem.type === 'folder' ? PENDING_FOLDER : PENDING_FILE}${pendingNewItem.parentPath}`,
        isDir: false,
      }
    )
  }, [tree, pendingNewItem, activeApp?.rootPath])

  useEffect(() => {
    if (pendingNewItem && treeRef.current && pendingNewItem.parentPath !== activeApp?.rootPath) {
      treeRef.current.open(pendingNewItem.parentPath)
    }
  }, [pendingNewItem, activeApp?.rootPath])
  const [treeHeight, setTreeHeight] = useState(400)

  useEffect(() => {
    const el = treeContainerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const { height } = entries[0]?.contentRect ?? {}
      if (typeof height === 'number' && height > 0) setTreeHeight(height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [activeApp, loading])

  return (
    <div
      className={cn(
        'bg-[#252526] border-r border-[#3e3e3e] transition-all duration-200 flex',
        expanded ? 'w-[304px]' : 'w-12'
      )}
    >
      {/* Activity bar */}
      <div className="w-12 shrink-0 flex flex-col border-r border-[#3e3e3e] bg-[#333333]">
        <button
          type="button"
          onClick={() => { onSidebarViewChange('files'); if (!expanded) onToggle() }}
          className={cn(
            'flex items-center justify-center p-3 transition-colors',
            sidebarView === 'files' ? 'bg-[#252526] text-[#007acc]' : 'text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d]'
          )}
          title="Explorer"
        >
          <FileText className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => { onSidebarViewChange('git'); if (!expanded) onToggle() }}
          className={cn(
            'flex items-center justify-center p-3 transition-colors',
            sidebarView === 'git' ? 'bg-[#252526] text-[#007acc]' : 'text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d]'
          )}
          title="Source Control"
        >
          <GitBranch className="w-5 h-5" />
        </button>
        <div className="flex-1 min-h-0" />
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center justify-center p-3 hover:bg-[#2d2d2d] text-gray-400 hover:text-gray-200 transition-colors"
          title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <ChevronRight
            className={cn('w-4 h-4 transition-transform', !expanded && 'rotate-180')}
          />
        </button>
      </div>

      {/* Content panel - Files or Git */}
      {expanded && (
        <div className="w-64 shrink-0 flex flex-col bg-[#252526] min-h-0">
          {sidebarView === 'files' ? (
            <>
              {activeApp && (
            <div className="p-2 border-b border-[#3e3e3e] flex flex-col gap-2">
              <div className="flex items-center gap-1 min-w-0">
                <span className="truncate text-sm font-medium text-gray-200" title={activeApp.name}>
                  {activeApp.name}
                </span>
                <div className="flex items-center gap-0.5 shrink-0 ml-auto">
                  <button
                    type="button"
                    onClick={handleCreateFile}
                    className="p-1.5 rounded hover:bg-[#2a2d2e] text-gray-400 hover:text-gray-200"
                    title="New file"
                  >
                    <FilePlus className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateFolder}
                    className="p-1.5 rounded hover:bg-[#2a2d2e] text-gray-400 hover:text-gray-200"
                    title="New folder"
                  >
                    <FolderPlus className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-1 py-0.5 rounded bg-[#2a2d2e] border border-transparent focus-within:border-[#007acc]/50">
                <Search className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search files..."
                  className="flex-1 min-w-0 bg-transparent text-sm text-gray-200 placeholder:text-gray-500 outline-none"
                />
              </div>
            </div>
          )}

          <div className="flex-1 flex flex-col overflow-hidden p-2 min-h-0">
            {error && (
              <p className="text-xs text-red-400 mb-2 px-1 shrink-0">{error}</p>
            )}
            {loading && (
              <p className="text-xs text-gray-500 px-1 shrink-0">Loading…</p>
            )}
            {activeApp && !loading && (
              <div ref={treeContainerRef} className="sidebar-tree-container flex-1 min-h-0 overflow-hidden -mx-1">
                <Tree<TreeNode>
                  ref={(api) => {
                    treeRef.current = api ?? null
                  }}
                  data={treeWithPending}
                  idAccessor="path"
                  childrenAccessor="children"
                  openByDefault
                  width="100%"
                  height={treeHeight}
                  rowHeight={24}
                  indent={12}
                  onMove={handleMove}
                  onRename={handleRename}
                  onDelete={handleDelete}
                  searchTerm={searchTerm || undefined}
                  searchMatch={(node, term) =>
                    node.data.name.toLowerCase().includes(term.toLowerCase())
                  }
                  disableEdit={(data) =>
                    data.path.startsWith(PENDING_FILE) ||
                    data.path.startsWith(PENDING_FOLDER)
                  }
                  disableDrag={(data) =>
                    data.path.startsWith(PENDING_FILE) ||
                    data.path.startsWith(PENDING_FOLDER)
                  }
                  disableDrop={({ parentNode, dragNodes }) =>
                    dragNodes.some((n) => parentNode && n.isAncestorOf(parentNode))
                  }
                  onActivate={(node) => {
                    if (
                      node.data.path.startsWith(PENDING_FILE) ||
                      node.data.path.startsWith(PENDING_FOLDER)
                    )
                      return
                    setSelectedPath(node.data.path)
                    if (node.isLeaf && !node.data.isDir) handleFileClick(node.data.path)
                  }}
                >
                  {(props) => (
                    <SidebarNode
                      {...props}
                      selectedPath={selectedPath}
                      onSelectPath={setSelectedPath}
                      isPendingNode={
                        props.node.data.path.startsWith(PENDING_FILE) ||
                        props.node.data.path.startsWith(PENDING_FOLDER)
                      }
                      pendingNewItem={pendingNewItem}
                      pendingNewItemName={pendingNewItemName}
                      pendingInputRef={pendingInputRef}
                      onPendingKeyDown={handlePendingKeyDown}
                      onPendingBlur={handlePendingBlur}
                      onPendingChange={(v) => setPendingNewItemName(v)}
                      onDeleteNodes={(ids) => handleDelete({ ids })}
                      onNewFile={(parentPath) => openCreateFileDialog(parentPath)}
                      onNewFolder={(parentPath) => setPendingNewItem({ type: 'folder', parentPath })}
                    />
                  )}
                </Tree>
              </div>
            )}

            {/* UI Registries collapsible pane */}
            <div className="shrink-0 border-t border-[#3e3e3e] mt-2 pt-2">
              <div className="flex items-center gap-0.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setUiRegistriesOpen(!uiRegistriesOpen)}
                  className="flex-1 flex items-center gap-2 px-1 py-1.5 rounded text-left text-sm text-gray-300 hover:bg-[#2a2d2e] hover:text-gray-200 transition-colors min-w-0"
                >
                  {uiRegistriesOpen ? (
                    <ChevronDown className="w-4 h-4 shrink-0 text-gray-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 shrink-0 text-gray-500" />
                  )}
                  <Layers className="w-4 h-4 shrink-0 text-gray-500" />
                  <span className="truncate font-medium">UI registry docs</span>
                </button>
                {uiRegistriesOpen && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddRegistry(true)
                      setNewRegistryPackage('')
                    }}
                    className="p-1.5 rounded hover:bg-[#2a2d2e] text-gray-400 hover:text-gray-200 shrink-0"
                    title="Add UI registry doc (npm package)"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>
              {uiRegistriesOpen && (
                <div className="mt-1 max-h-48 overflow-y-auto -mx-1 px-1 space-y-0.5">
                  {registryPackages.length === 0 && !showAddRegistry && (
                    <p className="py-2 text-xs text-gray-500 italic">No registry docs</p>
                  )}
                  {registryPackages.map((pkg) => (
                    <div
                      key={pkg}
                      className="group flex items-center gap-2 py-1.5 px-2 rounded text-xs hover:bg-[#2a2d2e] min-w-0"
                    >
                      <button
                        type="button"
                        onClick={() => openRegistryComponentsDialog(pkg)}
                        className="flex-1 min-w-0 flex items-center text-left truncate text-gray-400 hover:text-gray-200"
                        title={`View components in ${pkg}`}
                      >
                        <span className="truncate" title={pkg}>
                          {pkg}
                        </span>
                      </button>
                      <a
                        href={npmPackageUrl(pkg)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 text-[#007acc] hover:underline"
                        title={`View on npm: ${pkg}`}
                      >
                        npm
                      </a>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeRegistryPackage(pkg)
                        }}
                        className="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[#3e3e3e] text-gray-400 hover:text-red-400"
                        title="Remove registry doc"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {showAddRegistry && (
                    <div className="py-2 space-y-2">
                      <input
                        type="text"
                        value={newRegistryPackage}
                        onChange={(e) => setNewRegistryPackage(e.target.value)}
                        placeholder="e.g. @kaushik91/rupa"
                        className="w-full rounded border border-[#3e3e3e] bg-[#2a2d2e] px-2 py-1.5 text-xs text-gray-200 placeholder:text-gray-500 outline-none focus:border-[#007acc]/50"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const p = newRegistryPackage.trim()
                            if (p) {
                              addRegistryPackage(p)
                              setNewRegistryPackage('')
                              setShowAddRegistry(false)
                            }
                          }
                          if (e.key === 'Escape') setShowAddRegistry(false)
                        }}
                        autoFocus
                      />
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const p = newRegistryPackage.trim()
                            if (p) {
                              addRegistryPackage(p)
                              setNewRegistryPackage('')
                              setShowAddRegistry(false)
                            }
                          }}
                          className="rounded px-2 py-1 text-xs font-medium bg-[#007acc]/80 text-white hover:bg-[#007acc]"
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddRegistry(false)
                            setNewRegistryPackage('')
                          }}
                          className="rounded px-2 py-1 text-xs font-medium text-gray-400 hover:bg-[#2a2d2e] hover:text-gray-200"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
            </>
          ) : (
            <GitPanel
              isOpen={true}
              onClose={() => onSidebarViewChange('files')}
              repoPath={activeApp?.rootPath ?? null}
              embedded
              refreshTrigger={refreshTrigger}
              onOpenFileFromGit={(relativePath) => {
                if (!activeApp?.rootPath || !onOpenFile) return
                const fullPath = `${activeApp.rootPath}/${relativePath}`.replace(/\\/g, '/')
                handleFileClick(fullPath, { fromGit: true })
              }}
            />
          )}
        </div>
      )}

      {/* Create new file type dialog */}
      {showCreateFileDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity"
          onClick={closeCreateFileDialog}
        >
          <div
            className="w-full max-w-md mx-4 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-[#2d2d30] to-[#1e1e21] shadow-2xl shadow-black/40 ring-1 ring-white/5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-white/5">
              <h2 className="text-lg font-semibold tracking-tight text-white">
                {createFileKind == null
                  ? 'What will you create?'
                  : createFileKind === 'app'
                    ? 'New app'
                    : createFileKind === 'ui'
                      ? 'New UI config'
                      : 'New workflow'}
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                {createFileKind == null
                  ? 'Choose a configuration type — each shapes your project in a different way.'
                  : createFileKind === 'app'
                    ? 'Give your app an identity and a place on the web.'
                    : createFileKind === 'ui'
                      ? 'Define a new screen or layout configuration.'
                      : 'Add a workflow to orchestrate steps and automation.'}
              </p>
            </div>

            <div className="p-6">
              {createFileKind == null ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setCreateFileKind('app')}
                    className="group flex w-full items-center gap-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3.5 text-left transition-all hover:border-amber-500/40 hover:bg-amber-500/10 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20 transition-colors group-hover:bg-amber-500/25">
                      <Package className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="block font-medium text-gray-100">App manifest</span>
                      <span className="block text-xs text-gray-500">*.app.manifest.json — Your app’s identity, URL path, and metadata.</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateFileKind('ui')}
                    className="group flex w-full items-center gap-4 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3.5 text-left transition-all hover:border-blue-500/40 hover:bg-blue-500/10 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20 transition-colors group-hover:bg-blue-500/25">
                      <LayoutDashboard className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="block font-medium text-gray-100">UI config</span>
                      <span className="block text-xs text-gray-500">*.ui.json — Screens, layouts, and view structure.</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateFileKind('workflow')}
                    className="group flex w-full items-center gap-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3.5 text-left transition-all hover:border-emerald-500/40 hover:bg-emerald-500/10 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20 transition-colors group-hover:bg-emerald-500/25">
                      <GitBranch className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="block font-medium text-gray-100">Workflow</span>
                      <span className="block text-xs text-gray-500">*.workflow.json — Steps, flows, and automation.</span>
                    </div>
                  </button>
                </div>
              ) : createFileKind === 'app' ? (
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">App name</label>
                    <input
                      type="text"
                      value={createAppName}
                      onChange={(e) => setCreateAppName(e.target.value.toLowerCase())}
                      placeholder="e.g. my new app"
                      className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-gray-100 placeholder:text-gray-500 outline-none transition-colors focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">URL relative path prefix <span className="text-amber-400/90">(required)</span></label>
                    <input
                      type="text"
                      value={createAppUrlPathPrefix}
                      onChange={(e) => setCreateAppUrlPathPrefix(e.target.value)}
                      placeholder="e.g. /tenant-a/my-app"
                      className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-gray-100 placeholder:text-gray-500 outline-none transition-colors focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setCreateFileKind(null)}
                      className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-white/5 hover:text-gray-100"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => submitCreateApp()}
                      className="ml-auto rounded-lg bg-amber-500/90 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-amber-400"
                    >
                      Create app
                    </button>
                  </div>
                </div>
              ) : createFileKind === 'ui' ? (
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">File name</label>
                    <input
                      type="text"
                      value={createFileName}
                      onChange={(e) => setCreateFileName(e.target.value.toLowerCase())}
                      placeholder="e.g. dashboard.ui.json"
                      className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-gray-100 placeholder:text-gray-500 outline-none transition-colors focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setCreateFileKind(null)}
                      className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-white/5 hover:text-gray-100"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => submitCreateUi()}
                      className="ml-auto rounded-lg bg-blue-500/90 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-400"
                    >
                      Create
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">File name</label>
                    <input
                      type="text"
                      value={createFileName}
                      onChange={(e) => setCreateFileName(e.target.value.toLowerCase())}
                      placeholder="e.g. onboarding.workflow.json"
                      className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-gray-100 placeholder:text-gray-500 outline-none transition-colors focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setCreateFileKind(null)}
                      className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-white/5 hover:text-gray-100"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => submitCreateWorkflow()}
                      className="ml-auto rounded-lg bg-emerald-500/90 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-400"
                    >
                      Create
                    </button>
                  </div>
                </div>
              )}
            </div>

            {createFileKind == null && (
              <div className="border-t border-white/5 px-6 py-3 flex justify-end bg-black/10">
                <button
                  type="button"
                  onClick={closeCreateFileDialog}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-200"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirmPending && deleteConfirmPending.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setDeleteConfirmPending(null)}
        >
          <div
            className="bg-[#252526] border border-[#3e3e3e] rounded-lg shadow-xl p-4 max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-gray-200 mb-4">
              {deleteConfirmPending.length === 1
                ? 'Are you sure you want to delete this item?'
                : `Are you sure you want to delete these ${deleteConfirmPending.length} items?`}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmPending(null)}
                className="px-3 py-1.5 text-sm rounded bg-[#3e3e3e] text-gray-200 hover:bg-[#4e4e4e]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeDelete(deleteConfirmPending)}
                className="px-3 py-1.5 text-sm rounded bg-red-600/80 text-white hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
