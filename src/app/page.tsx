
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Link2 } from "lucide-react";

interface Node {
  id: string;
  name: string;
  description: string;
  tags: string[];
  x: number;
  y: number;
  type: 'category' | 'entity';
  birthday?: string;
}

interface Edge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  tags: string[];
  creationDate: string;
}

const CATEGORY_NODE_DIMENSION = 160;
const ENTITY_NODE_DIMENSION = 128;

// const CONTAINER_MAX_WIDTH_PX = 768; // Removed
const CONTAINER_HEIGHT_PX = 500;

const PRESS_HOLD_THRESHOLD = 700;
const DRAG_MOVE_THRESHOLD = 10;
const MAX_PLACEMENT_ATTEMPTS = 30;

// Constants for repulsion
const REPULSION_STRENGTH = 0.5;
const MIN_SEPARATION = 15;
const REPULSION_ITERATIONS = 10;

export default function Home() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(768); // Default, will be updated

  // Create Node Dialog
  const [isCreateNodeDialogOpen, setIsCreateNodeDialogOpen] = useState(false);
  const [newNodeName, setNewNodeName] = useState("");
  const [newNodeDescription, setNewNodeDescription] = useState("");
  const [newNodeTags, setNewNodeTags] = useState("");
  const [newNodeType, setNewNodeType] = useState<'category' | 'entity'>('category');
  const [newNodeBirthday, setNewNodeBirthday] = useState("");

  // Edit Node Dialog
  const [isEditNodeDialogOpen, setIsEditNodeDialogOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const [editNodeName, setEditNodeName] = useState("");
  const [editNodeDescription, setEditNodeDescription] = useState("");
  const [editNodeTags, setEditNodeTags] = useState("");
  const [editNodeBirthday, setEditNodeBirthday] = useState("");

  // Create Edge Dialog
  const [isCreateEdgeDialogOpen, setIsCreateEdgeDialogOpen] = useState(false);
  const [newEdgeDataSourceNodeId, setNewEdgeDataSourceNodeId] = useState<string | null>(null);
  const [newEdgeDataTargetNodeId, setNewEdgeDataTargetNodeId] = useState<string | null>(null);
  const [newEdgeTags, setNewEdgeTags] = useState("");
  const [newEdgeDate, setNewEdgeDate] = useState(() => new Date().toISOString().split('T')[0]);


  // Interaction States
  const [activeInteractionNodeId, setActiveInteractionNodeId] = useState<string | null>(null);
  const [pressHoldTimer, setPressHoldTimer] = useState<NodeJS.Timeout | null>(null);
  const [interactionStartPos, setInteractionStartPos] = useState<{ x: number, y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number, y: number } | null>(null);

  const [isDraggingForReposition, setIsDraggingForReposition] = useState(false);
  const [isLinkingModeActive, setIsLinkingModeActive] = useState(false);
  const [linkingSourceNodeId, setLinkingSourceNodeId] = useState<string | null>(null);
  const [linkingLinePreview, setLinkingLinePreview] = useState<{x1: number, y1: number, x2: number, y2: number} | null>(null);

  const [showSearchBar, setShowSearchBar] = useState(false);

  useEffect(() => {
    if (containerRef.current) {
      setContainerWidth(containerRef.current.getBoundingClientRect().width);
    }
    // Optional: Add resize listener for fully dynamic resizing
    // const handleResize = () => {
    //   if (containerRef.current) {
    //     setContainerWidth(containerRef.current.getBoundingClientRect().width);
    //   }
    // };
    // window.addEventListener('resize', handleResize);
    // return () => window.removeEventListener('resize', handleResize);
  }, [containerRef]);


  const getNodeDimension = useCallback((nodeOrType: Node | Node['type']) => {
    const type = typeof nodeOrType === 'string' ? nodeOrType : nodeOrType.type;
    return type === 'category' ? CATEGORY_NODE_DIMENSION : ENTITY_NODE_DIMENSION;
  }, []);

  const createNode = () => {
    if (newNodeName) {
      const tagsArray = newNodeTags.split(',').map(tag => tag.trim()).filter(tag => tag);
      let newNodeX = 0;
      let newNodeY = 0;
      let placed = false;
      let attempts = 0;
      const newNodeDimension = getNodeDimension(newNodeType);

      do {
        newNodeX = Math.floor(Math.random() * (containerWidth - newNodeDimension));
        newNodeY = Math.floor(Math.random() * (CONTAINER_HEIGHT_PX - newNodeDimension));
        let overlap = false;
        for (const existingNode of nodes) {
          const existingNodeDimension = getNodeDimension(existingNode);
          if (
            newNodeX < existingNode.x + existingNodeDimension &&
            newNodeX + newNodeDimension > existingNode.x &&
            newNodeY < existingNode.y + existingNodeDimension &&
            newNodeY + newNodeDimension > existingNode.y
          ) {
            overlap = true;
            break;
          }
        }
        if (!overlap) placed = true;
        attempts++;
      } while (!placed && attempts < MAX_PLACEMENT_ATTEMPTS);

      if (!placed) {
        console.warn(`Could not find a non-overlapping position for new node "${newNodeName}" after ${MAX_PLACEMENT_ATTEMPTS} attempts. Placing at last attempted position.`);
      }

      const newNodeToAdd: Node = {
        id: crypto.randomUUID(),
        name: newNodeName,
        description: newNodeDescription,
        tags: tagsArray,
        x: newNodeX,
        y: newNodeY,
        type: newNodeType,
        birthday: newNodeType === 'entity' ? newNodeBirthday : undefined,
      };
      setNodes(prevNodes => [...prevNodes, newNodeToAdd]);
      setNewNodeName(""); setNewNodeDescription(""); setNewNodeTags(""); setNewNodeType('category'); setNewNodeBirthday("");
      setIsCreateNodeDialogOpen(false);
    }
  };

  const openEditNodeDialog = useCallback((node: Node) => {
    setEditingNode(node);
    setEditNodeName(node.name);
    setEditNodeDescription(node.description);
    setEditNodeTags(node.tags.join(', '));
    setEditNodeBirthday(node.birthday || "");
    setIsEditNodeDialogOpen(true);
    setActiveInteractionNodeId(null);
  }, []);

  const saveNodeChanges = () => {
    if (editingNode && editNodeName) {
      const tagsArray = editNodeTags.split(',').map(tag => tag.trim()).filter(tag => tag);
      setNodes(nodes.map(n =>
        n.id === editingNode.id
        ? { ...n, name: editNodeName, description: editNodeDescription, tags: tagsArray, birthday: editingNode.type === 'entity' ? editNodeBirthday : undefined }
        : n
      ));
      setEditingNode(null);
      setIsEditNodeDialogOpen(false);
    }
  };

  const createEdge = () => {
    if (newEdgeDataSourceNodeId && newEdgeDataTargetNodeId && newEdgeDate) {
      const tagsArray = newEdgeTags.split(',').map(tag => tag.trim()).filter(tag => tag);
      const newEdgeToAdd: Edge = {
        id: crypto.randomUUID(),
        sourceNodeId: newEdgeDataSourceNodeId,
        targetNodeId: newEdgeDataTargetNodeId,
        tags: tagsArray,
        creationDate: newEdgeDate,
      };
      setEdges([...edges, newEdgeToAdd]);
      setIsCreateEdgeDialogOpen(false);
      setNewEdgeDataSourceNodeId(null);
      setNewEdgeDataTargetNodeId(null);
      setNewEdgeTags("");
      setNewEdgeDate(new Date().toISOString().split('T')[0]);
    }
  };

  const handleNodeInteractionStart = (
    event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>,
    node: Node
  ) => {
    if (event.type.startsWith('touch') && event.cancelable) event.preventDefault();

    setActiveInteractionNodeId(node.id);
    const point = 'touches' in event ? event.touches[0] : event;
    setInteractionStartPos({ x: point.clientX, y: point.clientY });

    if (containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        setDragOffset({
            x: point.clientX - containerRect.left - node.x,
            y: point.clientY - containerRect.top - node.y
        });
    } else {
        setDragOffset({ x: point.clientX - node.x, y: point.clientY - node.y });
    }

    setIsDraggingForReposition(false);
    setIsLinkingModeActive(false);
    setLinkingSourceNodeId(null);
    setLinkingLinePreview(null);

    if (pressHoldTimer) clearTimeout(pressHoldTimer);

    const timer = setTimeout(() => {
      if (activeInteractionNodeId === node.id && !isDraggingForReposition && !showSearchBar) {
        setIsLinkingModeActive(true);
        setLinkingSourceNodeId(node.id);
      }
      setPressHoldTimer(null);
    }, PRESS_HOLD_THRESHOLD);
    setPressHoldTimer(timer);
  };

  useEffect(() => {
    const handleInteractionMove = (event: MouseEvent | TouchEvent) => {
      if (!activeInteractionNodeId || !interactionStartPos || !dragOffset || !containerRef.current) return;
      if (event.type.startsWith('touch') && event.cancelable) event.preventDefault();

      const point = 'touches' in event ? event.touches[0] : event;
      if (!point) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const relativeCursorX = point.clientX - containerRect.left;
      const relativeCursorY = point.clientY - containerRect.top;

      const dx = point.clientX - interactionStartPos.x;
      const dy = point.clientY - interactionStartPos.y;

      if (Math.abs(dx) > DRAG_MOVE_THRESHOLD || Math.abs(dy) > DRAG_MOVE_THRESHOLD) {
        if (pressHoldTimer) {
          clearTimeout(pressHoldTimer);
          setPressHoldTimer(null);
        }

        if (isLinkingModeActive && linkingSourceNodeId) {
          setIsDraggingForReposition(false);
          const sourceNode = nodes.find(n => n.id === linkingSourceNodeId);
          if (sourceNode) {
            const sourceDim = getNodeDimension(sourceNode);
            setLinkingLinePreview({
              x1: sourceNode.x + sourceDim / 2,
              y1: sourceNode.y + sourceDim / 2,
              x2: relativeCursorX,
              y2: relativeCursorY,
            });
          }
        } else {
          setIsDraggingForReposition(true);
          setNodes(prevNodes => prevNodes.map(n => {
            if (n.id === activeInteractionNodeId) {
              const nodeDim = getNodeDimension(n);
              let newX = relativeCursorX - dragOffset.x;
              let newY = relativeCursorY - dragOffset.y;

              newX = Math.max(0, Math.min(newX, containerWidth - nodeDim));
              newY = Math.max(0, Math.min(newY, CONTAINER_HEIGHT_PX - nodeDim));
              return { ...n, x: newX, y: newY };
            }
            return n;
          }));
        }
      }
    };

    const handleInteractionEnd = (event: MouseEvent | TouchEvent) => {
      if (pressHoldTimer) {
        clearTimeout(pressHoldTimer);
        setPressHoldTimer(null);
      }

      const point = 'changedTouches' in event ? event.changedTouches[0] : event;
      if (!point || !containerRef.current) {
         if (!showSearchBar && !isCreateEdgeDialogOpen && !isEditNodeDialogOpen) setActiveInteractionNodeId(null);
        setInteractionStartPos(null); setDragOffset(null); setIsDraggingForReposition(false);
        setIsLinkingModeActive(false); setLinkingSourceNodeId(null); setLinkingLinePreview(null);
        return;
      }
      const containerRect = containerRef.current.getBoundingClientRect();

      if (linkingLinePreview && linkingSourceNodeId) { // Finished a press-hold-drag for linking
        const sourceNode = nodes.find(n => n.id === linkingSourceNodeId);
        if(sourceNode){
            let targetNode: Node | null = null;
            const cursorX = point.clientX - containerRect.left;
            const cursorY = point.clientY - containerRect.top;

            for (const node of nodes) {
                if (node.id === linkingSourceNodeId) continue;
                const nodeDim = getNodeDimension(node);
                if (cursorX >= node.x && cursorX <= node.x + nodeDim &&
                    cursorY >= node.y && cursorY <= node.y + nodeDim) {
                    targetNode = node;
                    break;
                }
            }

            if (targetNode) {
                setNewEdgeDataSourceNodeId(linkingSourceNodeId);
                setNewEdgeDataTargetNodeId(targetNode.id);
                setIsCreateEdgeDialogOpen(true);
            } else { // Released in empty space after link attempt: move node
                const nodeDim = getNodeDimension(sourceNode);
                let newX = (point.clientX - containerRect.left) - (dragOffset?.x || 0) ;
                let newY = (point.clientY - containerRect.top) - (dragOffset?.y || 0);

                newX = Math.max(0, Math.min(newX, containerWidth - nodeDim));
                newY = Math.max(0, Math.min(newY, CONTAINER_HEIGHT_PX - nodeDim));
                setNodes(prevNodes => prevNodes.map(n => n.id === linkingSourceNodeId ? {...n, x: newX, y: newY} : n));
            }
        }
      } else if (isDraggingForReposition) { // Finished a simple drag for repositioning
        const draggedNodeId = activeInteractionNodeId;
        const draggedNode = nodes.find(n => n.id === draggedNodeId);

        if (draggedNode) { // Check if dropped on another node for edge creation
            const cursorReleaseX = point.clientX - containerRect.left;
            const cursorReleaseY = point.clientY - containerRect.top;

            let targetNodeUnderneath: Node | null = null;
            for (const otherNode of nodes) {
                if (otherNode.id === draggedNode.id) continue;
                const otherNodeDim = getNodeDimension(otherNode);
                if (
                    cursorReleaseX >= otherNode.x && cursorReleaseX <= otherNode.x + otherNodeDim &&
                    cursorReleaseY >= otherNode.y && cursorReleaseY <= otherNode.y + otherNodeDim
                ) {
                    targetNodeUnderneath = otherNode;
                    break;
                }
            }
            if (targetNodeUnderneath) {
                setNewEdgeDataSourceNodeId(draggedNode.id);
                setNewEdgeDataTargetNodeId(targetNodeUnderneath.id);
                setIsCreateEdgeDialogOpen(true);
            }
            // Node position is already updated during drag by handleInteractionMove
        }
      } else if (isLinkingModeActive && activeInteractionNodeId) { // Press-hold completed, no drag -> show search
        setShowSearchBar(true);
      } else if (activeInteractionNodeId && !isDraggingForReposition && !showSearchBar) { // Simple click/tap
        const nodeToEdit = nodes.find(n => n.id === activeInteractionNodeId);
        if (nodeToEdit) openEditNodeDialog(nodeToEdit);
      }

      if (!showSearchBar && !isCreateEdgeDialogOpen && !isEditNodeDialogOpen) {
         setActiveInteractionNodeId(null);
      }
      setInteractionStartPos(null);
      setDragOffset(null);
      setIsDraggingForReposition(false);
      setIsLinkingModeActive(false);
      setLinkingSourceNodeId(null);
      setLinkingLinePreview(null);
    };

    const currentContainer = containerRef.current;
    window.addEventListener('mousemove', handleInteractionMove);
    window.addEventListener('mouseup', handleInteractionEnd);
    if (currentContainer) {
        currentContainer.addEventListener('touchmove', handleInteractionMove, { passive: false });
        currentContainer.addEventListener('touchend', handleInteractionEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleInteractionMove);
      window.removeEventListener('mouseup',handleInteractionEnd);
      if (currentContainer) {
        currentContainer.removeEventListener('touchmove', handleInteractionMove);
        currentContainer.removeEventListener('touchend', handleInteractionEnd);
      }
      if (pressHoldTimer) clearTimeout(pressHoldTimer);
    };
  }, [activeInteractionNodeId, interactionStartPos, dragOffset, pressHoldTimer, nodes, isDraggingForReposition, showSearchBar, openEditNodeDialog, isLinkingModeActive, linkingSourceNodeId, linkingLinePreview, isCreateEdgeDialogOpen, isEditNodeDialogOpen, edges, getNodeDimension, containerWidth]);


  const applyRepulsion = useCallback((currentNodes: Node[], fixedNodeId: string | null): Node[] => {
    if (currentNodes.length < 2) return currentNodes;

    let newNodes = currentNodes.map(n => ({ ...n }));

    for (let iter = 0; iter < REPULSION_ITERATIONS; iter++) {
      let systemMoved = false;
      for (let i = 0; i < newNodes.length; i++) {
        for (let j = i + 1; j < newNodes.length; j++) {
          const nodeA = newNodes[i];
          const nodeB = newNodes[j];

          // If either node is the fixedNodeId (being interacted with), it should not exert repulsion.
          // This allows the user to drag a node "through" others or close to others for linking
          // without the target node being pushed away by the dragged node.
          if (nodeA.id === fixedNodeId || nodeB.id === fixedNodeId) {
            // However, if nodeA is fixed, nodeB should still be repelled by nodeA if nodeB is NOT fixed.
            // And vice-versa. But if BOTH are fixed (which shouldn't happen if fixedNodeId is singular) or
            // if the non-fixed node is being repelled by a fixed one, we need to handle that.
            // The current logic: if nodeA is fixed, nodeB (not fixed) moves. If nodeB is fixed, nodeA (not fixed) moves.
            // If neither is fixed, both move. This seems okay.
            // The constraint is that the fixedNodeId itself is not *moved* by repulsion,
            // but it *can* repel non-fixed nodes.
            // Let's refine: if one of the nodes is the fixedNodeId, it doesn't get pushed.
            // The other node gets pushed by the full force.
            // If the fixedNodeId is the one *exerting* the force, this is handled by checking if the node to be moved is fixed.
          }

          const dimA = getNodeDimension(nodeA);
          const dimB = getNodeDimension(nodeB);
          const radiusA = dimA / 2;
          const radiusB = dimB / 2;

          const centerAx = nodeA.x + radiusA;
          const centerAy = nodeA.y + radiusA;
          const centerBx = nodeB.x + radiusB;
          const centerBy = nodeB.y + radiusB;

          const dx = centerBx - centerAx;
          const dy = centerBy - centerAy;
          const distanceSquared = dx * dx + dy * dy;

          const targetSeparation = radiusA + radiusB + MIN_SEPARATION;
          const targetSeparationSquared = targetSeparation * targetSeparation;

          if (distanceSquared < targetSeparationSquared && distanceSquared > 0) {
            const distance = Math.sqrt(distanceSquared);
            const overlap = targetSeparation - distance;
            const forceMagnitude = overlap * REPULSION_STRENGTH;
            const normDx = dx / distance;
            const normDy = dy / distance;

            let moveAx = 0, moveAy = 0, moveBx = 0, moveBy = 0;

            if (nodeA.id !== fixedNodeId && nodeB.id !== fixedNodeId) {
                // Both nodes are not fixed, they share the movement
                moveAx = -normDx * forceMagnitude / 2;
                moveAy = -normDy * forceMagnitude / 2;
                moveBx = normDx * forceMagnitude / 2;
                moveBy = normDy * forceMagnitude / 2;
            } else if (nodeA.id !== fixedNodeId && nodeB.id === fixedNodeId) {
                // Node B is fixed, only Node A moves (by the full force)
                moveAx = -normDx * forceMagnitude;
                moveAy = -normDy * forceMagnitude;
            } else if (nodeA.id === fixedNodeId && nodeB.id !== fixedNodeId) {
                // Node A is fixed, only Node B moves (by the full force)
                moveBx = normDx * forceMagnitude;
                moveBy = normDy * forceMagnitude;
            }
            // If both are fixed (nodeA.id === fixedNodeId && nodeB.id === fixedNodeId), no movement.
            // This case implies fixedNodeId might be an array or a different logic,
            // but with a single fixedNodeId, this specific sub-condition is effectively covered.

            if (nodeA.id !== fixedNodeId) {
                const prevXA = nodeA.x;
                const prevYA = nodeA.y;
                nodeA.x += moveAx;
                nodeA.y += moveAy;
                nodeA.x = Math.max(0, Math.min(nodeA.x, containerWidth - dimA));
                nodeA.y = Math.max(0, Math.min(nodeA.y, CONTAINER_HEIGHT_PX - dimA));
                if (nodeA.x !== prevXA || nodeA.y !== prevYA) systemMoved = true;
            }

            if (nodeB.id !== fixedNodeId) {
                const prevXB = nodeB.x;
                const prevYB = nodeB.y;
                nodeB.x += moveBx;
                nodeB.y += moveBy;
                nodeB.x = Math.max(0, Math.min(nodeB.x, containerWidth - dimB));
                nodeB.y = Math.max(0, Math.min(nodeB.y, CONTAINER_HEIGHT_PX - dimB));
                if (nodeB.x !== prevXB || nodeB.y !== prevYB) systemMoved = true;
            }
          }
        }
      }
      if (!systemMoved && iter > 0) break;
    }
    return newNodes;
  }, [getNodeDimension, containerWidth]);


  useEffect(() => {
    if (nodes.length < 2 || containerWidth === 0) return; // Also wait for containerWidth to be set

    const repulsedNodes = applyRepulsion(nodes, activeInteractionNodeId);

    let changed = false;
    if (nodes.length === repulsedNodes.length) {
        for (let i = 0; i < nodes.length; i++) {
            if (Math.abs(nodes[i].x - repulsedNodes[i].x) > 0.1 || Math.abs(nodes[i].y - repulsedNodes[i].y) > 0.1) {
                changed = true;
                break;
            }
        }
    } else {
        changed = true;
    }

    if (changed) {
      const timeoutId = setTimeout(() => {
        setNodes(repulsedNodes);
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [nodes, activeInteractionNodeId, applyRepulsion, containerWidth]);


  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  return (
    <main className="flex flex-col items-center justify-start min-h-screen p-4 sm:p-6 md:p-8 lg:p-10 bg-background text-foreground">
      <h1 className="text-3xl font-bold tracking-tight mb-6 text-center">Node Weaver</h1>

      <div
        ref={containerRef}
        className="relative w-full max-w-3xl border rounded-lg shadow-inner bg-card touch-none"
        style={{ height: `${CONTAINER_HEIGHT_PX}px` }} // Removed maxWidth here, Tailwind handles it
      >
        <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-0">
          {isClient && edges.map(edge => {
            const sourceNode = nodes.find(n => n.id === edge.sourceNodeId);
            const targetNode = nodes.find(n => n.id === edge.targetNodeId);
            if (!sourceNode || !targetNode) return null;

            const sourceDim = getNodeDimension(sourceNode);
            const targetDim = getNodeDimension(targetNode);

            return (
              <line
                key={edge.id}
                x1={sourceNode.x + sourceDim / 2}
                y1={sourceNode.y + sourceDim / 2}
                x2={targetNode.x + targetDim / 2}
                y2={targetNode.y + targetDim / 2}
                stroke="hsl(var(--ring))"
                strokeWidth="2"
                opacity="0.6"
              />
            );
          })}
          {linkingLinePreview && (
            <line
              x1={linkingLinePreview.x1}
              y1={linkingLinePreview.y1}
              x2={linkingLinePreview.x2}
              y2={linkingLinePreview.y2}
              stroke="hsl(var(--primary))"
              strokeWidth="2"
              strokeDasharray="5,5"
            />
          )}
        </svg>

        {isClient && nodes.map((node) => {
          const nodeDimension = getNodeDimension(node);
          const nodeStyles: React.CSSProperties = {
            backgroundColor: "hsl(var(--node-color))",
            left: `${node.x}px`,
            top: `${node.y}px`,
            width: `${nodeDimension}px`,
            height: `${nodeDimension}px`,
            color: "hsl(var(--card-foreground))",
            zIndex: 1,
          };
          if (node.type === 'entity') {
            nodeStyles.borderColor = 'hsl(var(--ring))';
            nodeStyles.borderWidth = '2px';
          }

          return (
            <div
              key={node.id}
              className={`absolute p-3 rounded-full flex flex-col items-center justify-center text-center cursor-pointer shadow-xl transition-shadow duration-300 hover:shadow-2xl select-none border`}
              style={nodeStyles}
              onMouseDown={(e) => handleNodeInteractionStart(e, node)}
              onTouchStart={(e) => handleNodeInteractionStart(e, node)}
              title={`Interact with ${node.name}`}
            >
              <h2 className="text-md font-semibold truncate w-full">{node.name}</h2>
              {node.tags.length > 0 && (
                <div className="mt-1 flex flex-wrap justify-center gap-1">
                  {node.tags.slice(0, 2).map(tag => (
                    <span key={tag} className="text-xs bg-black/20 text-white px-2 py-0.5 rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              {node.tags.length > 2 && (
                <span className="text-xs mt-1 opacity-70">+{node.tags.length - 2} more</span>
              )}
            </div>
          );
        })}
      </div>

      {showSearchBar && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[90%] max-w-md z-50 p-1 bg-background/80 backdrop-blur-sm rounded-lg shadow-2xl border border-border">
          <div className="relative p-3">
            <Input
              placeholder="Search nodes or type to connect..."
              className="bg-card shadow-md text-lg p-3 pr-12 border-input focus:ring-primary"
              onFocus={() => {
                if(pressHoldTimer) clearTimeout(pressHoldTimer);
              }}
            />
            <Button
              onClick={() => {
                setShowSearchBar(false);
                setActiveInteractionNodeId(null);
              }}
              variant="ghost"
              size="sm"
              className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground h-8 w-8 p-0"
              aria-label="Close search bar"
            >
              <Plus className="h-5 w-5 rotate-45" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={isCreateNodeDialogOpen} onOpenChange={(isOpen) => {
          setIsCreateNodeDialogOpen(isOpen);
          if (!isOpen) setActiveInteractionNodeId(null);
      }}>
        <DialogTrigger asChild>
          <Button className="mt-8 bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg text-lg px-6 py-3 rounded-lg">
            <Plus className="mr-2 h-5 w-5" />
            Create New Node
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[480px] bg-background text-foreground border-border shadow-2xl rounded-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl">Add New Node</DialogTitle>
            <DialogDescription>Define attributes for the new node. Click create when you're done.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 py-6">
            <div className="grid gap-3">
              <Label htmlFor="create-node-name" className="text-md">Name</Label>
              <Input id="create-node-name" placeholder="Node Name" value={newNodeName} onChange={(e) => setNewNodeName(e.target.value)} className="text-md p-3" />
            </div>
            <div className="grid gap-3">
                <Label className="text-md">Type</Label>
                <RadioGroup defaultValue="category" onValueChange={(value: 'category' | 'entity') => setNewNodeType(value)} value={newNodeType} className="flex space-x-4 pt-1">
                    <div className="flex items-center space-x-2"><RadioGroupItem value="category" id="type-category-create-node" /><Label htmlFor="type-category-create-node">Category</Label></div>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="entity" id="type-entity-create-node" /><Label htmlFor="type-entity-create-node">Entity</Label></div>
                </RadioGroup>
            </div>
            {newNodeType === 'entity' && (
              <div className="grid gap-3">
                <Label htmlFor="create-node-birthday" className="text-md">Birthday</Label>
                <Input id="create-node-birthday" type="date" value={newNodeBirthday} onChange={(e) => setNewNodeBirthday(e.target.value)} className="text-md p-3" />
              </div>
            )}
            <div className="grid gap-3">
              <Label htmlFor="create-node-description" className="text-md">Description</Label>
              <Input id="create-node-description" placeholder="Brief description" value={newNodeDescription} onChange={(e) => setNewNodeDescription(e.target.value)} className="text-md p-3" />
            </div>
            <div className="grid gap-3">
              <Label htmlFor="create-node-tags" className="text-md">Tags</Label>
              <Input id="create-node-tags" placeholder="tag1, tag2" value={newNodeTags} onChange={(e) => setNewNodeTags(e.target.value)} className="text-md p-3" />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" className="text-md px-5 py-2.5">Cancel</Button></DialogClose>
            <Button type="submit" onClick={createNode} className="bg-primary text-primary-foreground hover:bg-primary/90 text-md px-5 py-2.5">Create Node</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editingNode && (
        <Dialog open={isEditNodeDialogOpen} onOpenChange={(isOpen) => {
            setIsEditNodeDialogOpen(isOpen);
            if (!isOpen) { setEditingNode(null); setActiveInteractionNodeId(null); }
        }}>
          <DialogContent className="sm:max-w-[480px] bg-background text-foreground border-border shadow-2xl rounded-lg">
            <DialogHeader>
              <DialogTitle className="text-2xl">Edit Node: {editingNode.name}</DialogTitle>
              <DialogDescription>Modify attributes. Click save when done.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-6">
              <div className="grid gap-3">
                <Label htmlFor="edit-node-name" className="text-md">Name</Label>
                <Input id="edit-node-name" value={editNodeName} onChange={(e) => setEditNodeName(e.target.value)} className="text-md p-3" />
              </div>
              <div className="grid gap-3">
                <Label className="text-md">Type</Label>
                <p className="text-md p-3 bg-muted/50 rounded-md border border-input capitalize select-none">{editingNode?.type}</p>
              </div>
              {editingNode?.type === 'entity' && (
                <div className="grid gap-3">
                  <Label htmlFor="edit-node-birthday" className="text-md">Birthday</Label>
                  <Input id="edit-node-birthday" type="date" value={editNodeBirthday} onChange={(e) => setEditNodeBirthday(e.target.value)} className="text-md p-3" />
                </div>
              )}
              <div className="grid gap-3">
                <Label htmlFor="edit-node-description" className="text-md">Description</Label>
                <Input id="edit-node-description" value={editNodeDescription} onChange={(e) => setEditNodeDescription(e.target.value)} className="text-md p-3" />
              </div>
              <div className="grid gap-3">
                <Label htmlFor="edit-node-tags" className="text-md">Tags</Label>
                <Input id="edit-node-tags" value={editNodeTags} onChange={(e) => setEditNodeTags(e.target.value)} placeholder="tag1, tag2" className="text-md p-3" />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline" onClick={() => { setIsEditNodeDialogOpen(false); setEditingNode(null); setActiveInteractionNodeId(null);}} className="text-md px-5 py-2.5">Cancel</Button></DialogClose>
              <Button type="submit" onClick={saveNodeChanges} className="bg-primary text-primary-foreground hover:bg-primary/90 text-md px-5 py-2.5">Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={isCreateEdgeDialogOpen} onOpenChange={(isOpen) => {
          setIsCreateEdgeDialogOpen(isOpen);
          if (!isOpen) {
            setNewEdgeDataSourceNodeId(null);
            setNewEdgeDataTargetNodeId(null);
            setActiveInteractionNodeId(null);
          }
      }}>
        <DialogContent className="sm:max-w-[480px] bg-background text-foreground border-border shadow-2xl rounded-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl">Create New Edge</DialogTitle>
            <DialogDescription>
              Connecting '{nodes.find(n=>n.id===newEdgeDataSourceNodeId)?.name}' to '{nodes.find(n=>n.id===newEdgeDataTargetNodeId)?.name}'. Add details.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 py-6">
            <div className="grid gap-3">
              <Label htmlFor="create-edge-tags" className="text-md">Tags</Label>
              <Input id="create-edge-tags" placeholder="tag1, tag2 (optional)" value={newEdgeTags} onChange={(e) => setNewEdgeTags(e.target.value)} className="text-md p-3" />
            </div>
            <div className="grid gap-3">
              <Label htmlFor="create-edge-date" className="text-md">Creation Date</Label>
              <Input id="create-edge-date" type="date" value={newEdgeDate} onChange={(e) => setNewEdgeDate(e.target.value)} className="text-md p-3" />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" className="text-md px-5 py-2.5">Cancel</Button></DialogClose>
            <Button type="submit" onClick={createEdge} className="bg-primary text-primary-foreground hover:bg-primary/90 text-md px-5 py-2.5"><Link2 className="mr-2 h-5 w-5" />Create Edge</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </main>
  );
}

