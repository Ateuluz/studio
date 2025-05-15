
"use client";

import type { Node, Edge, EdgeTag } from '@/lib/types';
import React, { useState, useCallback, useRef, useEffect } from 'react';

const PRESS_HOLD_THRESHOLD = 700; // ms
const DRAG_MOVE_THRESHOLD = 5; // pixels

interface UseNodeInteractionsProps {
  nodes: Node[];
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  edges: Edge[];
  openEditNodeDialog: (node: Node) => void;
  openCreateEdgeDialog: (sourceNodeId: string, targetNodeId: string) => void;
  openEditEdgeDialog: (edge: Edge) => void;
  findExistingEdge: (nodeId1: string, nodeId2: string) => Edge | undefined;
  getNodeDimension: (nodeOrType: Node | Node['type']) => number;
  screenToWorld: (screenX: number, screenY: number) => { x: number; y: number };
  saveNodesToFileCallback: (currentNodes: Node[]) => Promise<void>;
  isLayoutLocked: boolean;
  isFocusModeActive: boolean;
  focusModeVisibleNodeIds: Set<string>;
  focusModeStartNodeId: string | null;
  toggleNodeInFocusMode: (nodeId: string) => void; // New callback for focus mode clicks
}

interface UseNodeInteractionsReturn {
  activeInteractionNodeId: string | null;
  linkingLinePreview: { x1: number; y1: number; x2: number; y2: number } | null;
  handleNodeInteractionStart: (
    event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>,
    node: Node
  ) => void;
  handleNodeInteractionMove: (
    event: MouseEvent | TouchEvent,
    currentScale: number // Pass scale for accurate worldMousePos
  ) => void;
  handleNodeInteractionEnd: (
    event: MouseEvent | TouchEvent,
    currentScale: number // Pass scale
  ) => void;
  isDraggingForReposition: boolean;
  isLinkingModeActive: boolean;
  clearNodeInteractionStates: () => void; 
}

export function useNodeInteractions({
  nodes,
  setNodes,
  edges,
  openEditNodeDialog,
  openCreateEdgeDialog,
  openEditEdgeDialog,
  findExistingEdge,
  getNodeDimension,
  screenToWorld,
  saveNodesToFileCallback,
  isLayoutLocked,
  isFocusModeActive,
  focusModeVisibleNodeIds,
  focusModeStartNodeId,
  toggleNodeInFocusMode,
}: UseNodeInteractionsProps): UseNodeInteractionsReturn {
  const [activeInteractionNodeId, setActiveInteractionNodeId] = useState<string | null>(null);
  const pressHoldTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [interactionStartPos, setInteractionStartPos] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingForReposition, setIsDraggingForReposition] = useState(false);
  const [isLinkingModeActive, setIsLinkingModeActive] = useState(false);
  const [linkingSourceNodeId, setLinkingSourceNodeId] = useState<string | null>(null);
  const [linkingLinePreview, setLinkingLinePreview] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  
  const activeInteractionNodeIdRef = useRef(activeInteractionNodeId);
  const isDraggingForRepositionRef = useRef(isDraggingForReposition);

  useEffect(() => { activeInteractionNodeIdRef.current = activeInteractionNodeId; }, [activeInteractionNodeId]);
  useEffect(() => { isDraggingForRepositionRef.current = isDraggingForReposition; }, [isDraggingForReposition]);


  const clearNodeInteractionStates = useCallback(() => {
    if (pressHoldTimerRef.current) {
      clearTimeout(pressHoldTimerRef.current);
      pressHoldTimerRef.current = null;
    }
    setActiveInteractionNodeId(null);
    setInteractionStartPos(null);
    setDragOffset(null);
    setIsDraggingForReposition(false);
    setIsLinkingModeActive(false);
    setLinkingSourceNodeId(null);
    setLinkingLinePreview(null);
  }, []);


  const handleNodeInteractionStart = useCallback(
    (
      event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>,
      node: Node
    ) => {
      // This function is now only called if it's determined NOT to be a canvas-level interaction
      // or if layout lock specific node interactions are handled elsewhere.
      // For now, assume it's called when a node is directly interacted with and not layout locked.
      
      if (event.type.startsWith('touch') && event.cancelable) event.preventDefault();
      const point = 'touches' in event ? event.touches[0] : event;

      setActiveInteractionNodeId(node.id);
      setInteractionStartPos({ x: point.clientX, y: point.clientY });
      
      // Calculate dragOffset using currentScale from page.tsx (will need to pass scale if this logic remains here)
      // For simplicity, if screenToWorld is correctly passed and uses current scale from page.tsx, this is fine.
      const worldMousePos = screenToWorld(point.clientX, point.clientY);
      setDragOffset({
          x: worldMousePos.x - node.x,
          y: worldMousePos.y - node.y
      });

      setIsDraggingForReposition(false);
      setIsLinkingModeActive(false);
      setLinkingSourceNodeId(null);
      setLinkingLinePreview(null);

      if (pressHoldTimerRef.current) clearTimeout(pressHoldTimerRef.current);
      
      // Only set press-hold timer if not in Focus Mode (where click means toggle)
      // and not in layout lock (where press-hold for linking might still be desired if not for search bar)
      // The search bar on press-hold-release is a node interaction.
      if (!isFocusModeActive) { // In focus mode, press-hold for search/link is disabled.
        pressHoldTimerRef.current = setTimeout(() => {
          if (activeInteractionNodeIdRef.current === node.id && !isDraggingForRepositionRef.current) {
            setIsLinkingModeActive(true);
            setLinkingSourceNodeId(node.id);
            // If linking mode is activated by press-hold, it implies not a drag for reposition
            setIsDraggingForReposition(false); 
          }
          pressHoldTimerRef.current = null;
        }, PRESS_HOLD_THRESHOLD);
      }
    },
    [screenToWorld, isFocusModeActive, setActiveInteractionNodeId, setInteractionStartPos, setDragOffset, setIsDraggingForReposition, setIsLinkingModeActive, setLinkingSourceNodeId, setLinkingLinePreview]
  );

  const handleNodeInteractionMove = useCallback(
    (event: MouseEvent | TouchEvent, currentScale: number) => {
      if (!activeInteractionNodeIdRef.current || !interactionStartPos) return;
      if (isLayoutLocked && !isLinkingModeActive) return; // Allow linking drag in layout lock, but not reposition

      if (event.type.startsWith('touch') && event.cancelable) event.preventDefault();
      const point = 'touches' in event ? event.touches[0] : event;
      if (!point) return;

      const worldMousePos = screenToWorld(point.clientX, point.clientY);
      const screenDx = point.clientX - interactionStartPos.x;
      const screenDy = point.clientY - interactionStartPos.y;

      if (Math.abs(screenDx) > DRAG_MOVE_THRESHOLD || Math.abs(screenDy) > DRAG_MOVE_THRESHOLD) {
        if (pressHoldTimerRef.current) {
          clearTimeout(pressHoldTimerRef.current);
          pressHoldTimerRef.current = null;
        }

        if (isLinkingModeActive && linkingSourceNodeId) {
          setIsDraggingForReposition(false); // Ensure this is false if we are in linking mode
          const sourceNode = nodes.find(n => n.id === linkingSourceNodeId);
          if (sourceNode) {
            const sourceDim = getNodeDimension(sourceNode);
            setLinkingLinePreview({
              x1: sourceNode.x + sourceDim / 2,
              y1: sourceNode.y + sourceDim / 2,
              x2: worldMousePos.x,
              y2: worldMousePos.y,
            });
          }
        } else if (dragOffset && !isLayoutLocked) { // Node repositioning only if layout is not locked
          setIsDraggingForReposition(true);
          setNodes(prevNodes =>
            prevNodes.map(n => {
              if (n.id === activeInteractionNodeIdRef.current) {
                let newX = worldMousePos.x - dragOffset.x;
                let newY = worldMousePos.y - dragOffset.y;
                return { ...n, x: newX, y: newY };
              }
              return n;
            })
          );
        }
      }
    },
    [
      interactionStartPos,
      isLinkingModeActive,
      linkingSourceNodeId,
      dragOffset,
      nodes,
      setNodes,
      getNodeDimension,
      screenToWorld,
      isLayoutLocked, // Added isLayoutLocked
      setIsDraggingForReposition // Added setIsDraggingForReposition
    ]
  );

  const handleNodeInteractionEnd = useCallback(
    async (event: MouseEvent | TouchEvent, currentScale: number) => {
      if (!activeInteractionNodeIdRef.current) return; // Should be guarded by page.tsx calling this

      if (pressHoldTimerRef.current) {
        clearTimeout(pressHoldTimerRef.current);
        pressHoldTimerRef.current = null;
      }

      const point = 'changedTouches' in event ? (event as TouchEvent).changedTouches[0] : (event as MouseEvent);
      if (!point) {
        clearNodeInteractionStates();
        return;
      }
      
      const worldMouseReleasePos = screenToWorld(point.clientX, point.clientY);
      let targetNodeUnderneath: Node | null = null;

      for (const node of nodes) {
        if (node.id === activeInteractionNodeIdRef.current) continue;
        const nodeDim = getNodeDimension(node);
        if (
          worldMouseReleasePos.x >= node.x && worldMouseReleasePos.x <= node.x + nodeDim &&
          worldMouseReleasePos.y >= node.y && worldMouseReleasePos.y <= node.y + nodeDim
        ) {
          targetNodeUnderneath = node;
          break;
        }
      }
      
      const currentActiveNodeId = activeInteractionNodeIdRef.current; // Capture before potential clear
      const wasDragging = isDraggingForRepositionRef.current;
      const wasLinkingFromPreview = !!(linkingLinePreview && linkingSourceNodeId);
      const wasLinkingFromPressHoldNoDrag = isLinkingModeActive && !linkingLinePreview && linkingSourceNodeId; //Ensure linkingSourceNodeId was set

      // This is the click/tap part
      const isSimpleClick = !wasDragging && !wasLinkingFromPreview && !wasLinkingFromPressHoldNoDrag;

      if (isFocusModeActive) {
        if (isSimpleClick && currentActiveNodeId) {
          const clickedNode = nodes.find(n => n.id === currentActiveNodeId);
          if (clickedNode && focusModeVisibleNodeIds.has(clickedNode.id)) {
             // Focus mode click delegates to toggleNodeInFocusMode
            toggleNodeInFocusMode(clickedNode.id);
          }
        } else if (wasLinkingFromPreview && linkingSourceNodeId) { // Handle linking in focus mode
            const sourceNode = nodes.find(n => n.id === linkingSourceNodeId);
            if (sourceNode) {
                if (targetNodeUnderneath) {
                    const existingEdge = findExistingEdge(linkingSourceNodeId, targetNodeUnderneath.id);
                    if (existingEdge) openEditEdgeDialog(existingEdge);
                    else openCreateEdgeDialog(linkingSourceNodeId, targetNodeUnderneath.id);
                } else {
                    // No specific node move on empty space release during linking in focus mode
                    // unless it's part of a general "allow node movement if layout lock is off"
                    // For now, Focus Mode implies Layout Lock, so node doesn't move.
                }
            }
        }
        // Other drag/link actions in Focus Mode might be restricted by Layout Lock
      } else { // Not in Focus Mode
        if (wasLinkingFromPreview && linkingSourceNodeId) {
          const sourceNode = nodes.find(n => n.id === linkingSourceNodeId);
          if (sourceNode) {
            if (targetNodeUnderneath) {
              const existingEdge = findExistingEdge(linkingSourceNodeId, targetNodeUnderneath.id);
              if (existingEdge) openEditEdgeDialog(existingEdge);
              else openCreateEdgeDialog(linkingSourceNodeId, targetNodeUnderneath.id);
            } else {
              // Move source node to release point if not layout locked
              if (!isLayoutLocked) {
                setNodes(prevNodes => prevNodes.map(n => {
                    if (n.id === linkingSourceNodeId) {
                        const nodeDim = getNodeDimension(n);
                        return { ...n, x: worldMouseReleasePos.x - nodeDim / 2, y: worldMouseReleasePos.y - nodeDim / 2 };
                    }
                    return n;
                }));
                await saveNodesToFileCallback(nodes.map(n => n.id === linkingSourceNodeId ? {...n, x: worldMouseReleasePos.x - getNodeDimension(n)/2, y: worldMouseReleasePos.y - getNodeDimension(n)/2 } : n));
              }
            }
          }
        } else if (wasDragging && currentActiveNodeId && !isLayoutLocked) { // Repositioning drag
          if (targetNodeUnderneath) {
            const existingEdge = findExistingEdge(currentActiveNodeId, targetNodeUnderneath.id);
            if (existingEdge) openEditEdgeDialog(existingEdge);
            else openCreateEdgeDialog(currentActiveNodeId, targetNodeUnderneath.id);
          }
          await saveNodesToFileCallback(nodes); // Save nodes after repositioning
        } else if (wasLinkingFromPressHoldNoDrag && linkingSourceNodeId) {
          // This was press-hold and release on the node without dragging to link.
          // Previously showed search bar; now, this case is less likely if focus mode handles clicks
          // Or, if we want, it could still trigger something specific like node-context search
          // For now, let's assume a simple click below handles it or focus mode logic.
          // This path implies it's not a focus mode click.
          const nodeToEdit = nodes.find(n => n.id === currentActiveNodeId);
          if (nodeToEdit) openEditNodeDialog(nodeToEdit); // Default to edit if not other action
        } else if (isSimpleClick && currentActiveNodeId) {
          const nodeToEdit = nodes.find(n => n.id === currentActiveNodeId);
          if (nodeToEdit) openEditNodeDialog(nodeToEdit);
        }
      }
      
      // Clear states, unless a dialog was opened that relies on activeInteractionNodeId (EditNodeDialog)
      // For now, let's clear always and let dialogs re-set if needed or manage their own active node.
      // This might need refinement if dialogs need to know which node triggered them directly from this state.
      clearNodeInteractionStates();

    },
    [
      nodes, // nodes is a dependency now for saveNodesToFileCallback
      edges, // for findExistingEdge
      screenToWorld,
      getNodeDimension,
      isLinkingModeActive,
      linkingSourceNodeId,
      linkingLinePreview,
      isFocusModeActive,
      focusModeVisibleNodeIds,
      // focusModeStartNodeId, // Not directly used here, but related to focus mode logic
      toggleNodeInFocusMode,
      openEditNodeDialog,
      openCreateEdgeDialog,
      openEditEdgeDialog,
      findExistingEdge,
      saveNodesToFileCallback,
      setNodes, // if moving node on link-to-empty
      isLayoutLocked, // for conditional node movement
      clearNodeInteractionStates
    ]
  );

  return {
    activeInteractionNodeId,
    linkingLinePreview,
    handleNodeInteractionStart,
    handleNodeInteractionMove,
    handleNodeInteractionEnd,
    isDraggingForReposition,
    isLinkingModeActive,
    clearNodeInteractionStates,
  };
}

    