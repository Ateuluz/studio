
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
import { Textarea } from "@/components/ui/textarea"; // Added Textarea
import { Plus, Link2, Trash2 } from "lucide-react"; // Added Trash2

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

interface EdgeTag {
  name: string;
  date?: string;
}

interface Edge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  tags: EdgeTag[];
}

const CATEGORY_NODE_DIMENSION = 160;
const ENTITY_NODE_DIMENSION = 128;

const CONTAINER_HEIGHT_PX = 500;

const PRESS_HOLD_THRESHOLD = 700;
const DRAG_MOVE_THRESHOLD = 10;
const MAX_PLACEMENT_ATTEMPTS = 30;

// Constants for repulsion
const REPULSION_STRENGTH = 0.5;
const MIN_SEPARATION = 15;
const REPULSION_ITERATIONS = 10;


function parseTagsWithDates(tagsInput: string): EdgeTag[] {
  if (!tagsInput.trim()) return [];
  const tagEntries = tagsInput.split(',').map(entry => entry.trim());
  const regex = /^(.*?)(?:\s*\((....-..-..)\))?$/;
  return tagEntries.map(entry => {
    const match = entry.match(regex);
    if (match) {
      const name = match[1].trim();
      const date = match[2];
      return { name, date: date || undefined };
    }
    // Fallback for simple tags or if regex fails for an entry
    return { name: entry.trim() };
  }).filter(tag => tag.name);
}

function formatTagsWithDates(tags: EdgeTag[]): string {
  return tags.map(tag => {
    let entry = tag.name;
    if (tag.date) {
      entry += ` (${tag.date})`;
    }
    return entry;
  }).join(', ');
}


export default function Home() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(768);

  const [isCreateNodeDialogOpen, setIsCreateNodeDialogOpen] = useState(false);
  const [newNodeName, setNewNodeName] = useState("");
  const [newNodeDescription, setNewNodeDescription] = useState("");
  const [newNodeTags, setNewNodeTags] = useState("");
  const [newNodeType, setNewNodeType] = useState<'category' | 'entity'>('category');
  const [newNodeBirthday, setNewNodeBirthday] = useState("");

  const [isEditNodeDialogOpen, setIsEditNodeDialogOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const [editNodeName, setEditNodeName] = useState("");
  const [editNodeDescription, setEditNodeDescription] = useState("");
  const [editNodeTags, setEditNodeTags] = useState("");
  const [editNodeBirthday, setEditNodeBirthday] = useState("");

  const [isCreateEdgeDialogOpen, setIsCreateEdgeDialogOpen] = useState(false);
  const [newEdgeDataSourceNodeId, setNewEdgeDataSourceNodeId] = useState<string | null>(null);
  const [newEdgeDataTargetNodeId, setNewEdgeDataTargetNodeId] = useState<string | null>(null);
  const [newEdgeTagsInput, setNewEdgeTagsInput] = useState("");

  const [isEditEdgeDialogOpen, setIsEditEdgeDialogOpen] = useState(false);
  const [editingEdge, setEditingEdge] = useState<Edge | null>(null);
  const [editEdgeTagsInput, setEditEdgeTagsInput] = useState("");


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
    const handleResize = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.getBoundingClientRect().width);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);


  const getNodeDimension = useCallback((nodeOrType: Node | Node['type']) => {
    const type = typeof nodeOrType === 'string' ? nodeOrType : nodeOrType.type;
    return type === 'category' ? CATEGORY_NODE_DIMENSION : ENTITY_NODE_DIMENSION;
  }, []);

  const createNode = () => {
    if (newNodeName && containerWidth > 0) {
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

  const findExistingEdge = useCallback((nodeId1: string, nodeId2: string): Edge | undefined => {
    return edges.find(edge =>
      (edge.sourceNodeId === nodeId1 && edge.targetNodeId === nodeId2) ||
      (edge.sourceNodeId === nodeId2 && edge.targetNodeId === nodeId1)
    );
  }, [edges]);

  const createEdge = () => {
    if (newEdgeDataSourceNodeId && newEdgeDataTargetNodeId) {
      const parsedTags = parseTagsWithDates(newEdgeTagsInput);
      const newEdgeToAdd: Edge = {
        id: crypto.randomUUID(),
        sourceNodeId: newEdgeDataSourceNodeId,
        targetNodeId: newEdgeDataTargetNodeId,
        tags: parsedTags,
      };
      setEdges([...edges, newEdgeToAdd]);
      setIsCreateEdgeDialogOpen(false);
      setNewEdgeDataSourceNodeId(null);
      setNewEdgeDataTargetNodeId(null);
      setNewEdgeTagsInput("");
    }
  };

  const saveEdgeChanges = () => {
    if (editingEdge) {
      const updatedTags = parseTagsWithDates(editEdgeTagsInput);
      setEdges(prevEdges => prevEdges.map(edge =>
        edge.id === editingEdge.id ? { ...edge, tags: updatedTags } : edge
      ));
      setEditingEdge(null);
      setIsEditEdgeDialogOpen(false);
    }
  };

  const deleteEdge = () => {
    if (editingEdge) {
      setEdges(prevEdges => prevEdges.filter(edge => edge.id !== editingEdge.id));
      setEditingEdge(null);
      setIsEditEdgeDialogOpen(false);
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
         if (!showSearchBar && !isCreateEdgeDialogOpen && !isEditNodeDialogOpen && !isEditEdgeDialogOpen) setActiveInteractionNodeId(null);
        setInteractionStartPos(null); setDragOffset(null); setIsDraggingForReposition(false);
        setIsLinkingModeActive(false); setLinkingSourceNodeId(null); setLinkingLinePreview(null);
        return;
      }
      const containerRect = containerRef.current.getBoundingClientRect();
      const cursorReleaseX = point.clientX - containerRect.left;
      const cursorReleaseY = point.clientY - containerRect.top;

      let targetNodeUnderneath: Node | null = null;
      for (const node of nodes) {
        if (node.id === activeInteractionNodeId) continue; // Cannot drop on itself for edge creation
        const nodeDim = getNodeDimension(node);
        if (cursorReleaseX >= node.x && cursorReleaseX <= node.x + nodeDim &&
            cursorReleaseY >= node.y && cursorReleaseY <= node.y + nodeDim) {
            targetNodeUnderneath = node;
            break;
        }
      }

      if (linkingLinePreview && linkingSourceNodeId) { // Finished a press-hold-drag for linking
        const sourceNode = nodes.find(n => n.id === linkingSourceNodeId);
        if(sourceNode){
            if (targetNodeUnderneath) {
                const existingEdge = findExistingEdge(linkingSourceNodeId, targetNodeUnderneath.id);
                if (existingEdge) {
                    setEditingEdge(existingEdge);
                    setEditEdgeTagsInput(formatTagsWithDates(existingEdge.tags));
                    setIsEditEdgeDialogOpen(true);
                } else {
                    setNewEdgeDataSourceNodeId(linkingSourceNodeId);
                    setNewEdgeDataTargetNodeId(targetNodeUnderneath.id);
                    setNewEdgeTagsInput("");
                    setIsCreateEdgeDialogOpen(true);
                }
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
        if (draggedNodeId && targetNodeUnderneath) { // Dropped on another node
            const existingEdge = findExistingEdge(draggedNodeId, targetNodeUnderneath.id);
            if (existingEdge) {
                setEditingEdge(existingEdge);
                setEditEdgeTagsInput(formatTagsWithDates(existingEdge.tags));
                setIsEditEdgeDialogOpen(true);
            } else {
                setNewEdgeDataSourceNodeId(draggedNodeId);
                setNewEdgeDataTargetNodeId(targetNodeUnderneath.id);
                setNewEdgeTagsInput("");
                setIsCreateEdgeDialogOpen(true);
            }
        }
        // Node position is already updated during drag by handleInteractionMove
      } else if (isLinkingModeActive && activeInteractionNodeId) { // Press-hold completed, no drag -> show search
        setShowSearchBar(true);
      } else if (activeInteractionNodeId && !isDraggingForReposition && !isLinkingModeActive && !showSearchBar) { // Simple click/tap
        const nodeToEdit = nodes.find(n => n.id === activeInteractionNodeId);
        if (nodeToEdit) openEditNodeDialog(nodeToEdit);
      }

      if (!showSearchBar && !isCreateEdgeDialogOpen && !isEditNodeDialogOpen && !isEditEdgeDialogOpen) {
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
  }, [activeInteractionNodeId, interactionStartPos, dragOffset, pressHoldTimer, nodes, isDraggingForReposition, showSearchBar, openEditNodeDialog, isLinkingModeActive, linkingSourceNodeId, linkingLinePreview, isCreateEdgeDialogOpen, isEditNodeDialogOpen, isEditEdgeDialogOpen, edges, getNodeDimension, containerWidth, findExistingEdge]);


  const applyRepulsion = useCallback((currentNodes: Node[], fixedNodeId: string | null): Node[] => {
    if (currentNodes.length < 2 || containerWidth === 0) return currentNodes;

    let newNodes = currentNodes.map(n => ({ ...n }));

    for (let iter = 0; iter < REPULSION_ITERATIONS; iter++) {
      let systemMoved = false;
      for (let i = 0; i < newNodes.length; i++) {
        for (let j = i + 1; j < newNodes.length; j++) {
          const nodeA = newNodes[i];
          const nodeB = newNodes[j];

          // If either node is the fixedNodeId, skip repulsion calculation between this pair
          if (nodeA.id === fixedNodeId || nodeB.id === fixedNodeId) {
              continue;
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

            let moveAx = -normDx * forceMagnitude / 2;
            let moveAy = -normDy * forceMagnitude / 2;
            let moveBx = normDx * forceMagnitude / 2;
            let moveBy = normDy * forceMagnitude / 2;

            const prevXA = nodeA.x;
            const prevYA = nodeA.y;
            nodeA.x += moveAx;
            nodeA.y += moveAy;
            nodeA.x = Math.max(0, Math.min(nodeA.x, containerWidth - dimA));
            nodeA.y = Math.max(0, Math.min(nodeA.y, CONTAINER_HEIGHT_PX - dimA));
            if (Math.abs(nodeA.x - prevXA) > 0.01 || Math.abs(nodeA.y - prevYA) > 0.01) systemMoved = true;


            const prevXB = nodeB.x;
            const prevYB = nodeB.y;
            nodeB.x += moveBx;
            nodeB.y += moveBy;
            nodeB.x = Math.max(0, Math.min(nodeB.x, containerWidth - dimB));
            nodeB.y = Math.max(0, Math.min(nodeB.y, CONTAINER_HEIGHT_PX - dimB));
            if (Math.abs(nodeB.x - prevXB) > 0.01 || Math.abs(nodeB.y - prevYB) > 0.01) systemMoved = true;
          }
        }
      }
      if (!systemMoved && iter > 0) break;
    }
    return newNodes;
  }, [getNodeDimension, containerWidth]);


  useEffect(() => {
    if (nodes.length < 2 || containerWidth === 0 || activeInteractionNodeId) return;

    const repulsedNodes = applyRepulsion(nodes, null);

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

  useEffect(() => {
    if (nodes.length < 2 || containerWidth === 0 || !activeInteractionNodeId) return;

    const repulsedNodes = applyRepulsion(nodes, activeInteractionNodeId);

    let changed = false;
    for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].id === activeInteractionNodeId) {
            continue;
        }
        if (Math.abs(nodes[i].x - repulsedNodes[i].x) > 0.1 || Math.abs(nodes[i].y - repulsedNodes[i].y) > 0.1) {
            changed = true;
            break;
        }
    }

    if (changed) {
      const timeoutId = setTimeout(() => {
        setNodes(currentNodes => currentNodes.map(cn => {
            if (cn.id === activeInteractionNodeId) return cn;
            const rn = repulsedNodes.find(r => r.id === cn.id);
            return rn || cn;
        }));
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
        className="relative w-full max-w-3xl border rounded-lg shadow-inner bg-card touch-none overflow-hidden"
        style={{ height: `${CONTAINER_HEIGHT_PX}px` }}
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
            zIndex: activeInteractionNodeId === node.id ? 2 : 1,
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
              <Textarea
                id="create-edge-tags"
                placeholder="tag1 (YYYY-MM-DD), tag2, tag3 (YYYY-MM-DD)"
                value={newEdgeTagsInput}
                onChange={(e) => setNewEdgeTagsInput(e.target.value)}
                className="text-md p-3 min-h-[80px]"
              />
              <p className="text-xs text-muted-foreground">Separate tags with commas. Dates (YYYY-MM-DD) are optional per tag.</p>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" className="text-md px-5 py-2.5">Cancel</Button></DialogClose>
            <Button type="submit" onClick={createEdge} className="bg-primary text-primary-foreground hover:bg-primary/90 text-md px-5 py-2.5"><Link2 className="mr-2 h-5 w-5" />Create Edge</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editingEdge && (
        <Dialog open={isEditEdgeDialogOpen} onOpenChange={(isOpen) => {
            setIsEditEdgeDialogOpen(isOpen);
            if (!isOpen) { setEditingEdge(null); setActiveInteractionNodeId(null); }
        }}>
          <DialogContent className="sm:max-w-[480px] bg-background text-foreground border-border shadow-2xl rounded-lg">
            <DialogHeader>
              <DialogTitle className="text-2xl">Edit Edge</DialogTitle>
              <DialogDescription>
                Modifying connection between '{nodes.find(n => n.id === editingEdge.sourceNodeId)?.name}'
                and '{nodes.find(n => n.id === editingEdge.targetNodeId)?.name}'.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-6">
              <div className="grid gap-3">
                <Label htmlFor="edit-edge-tags" className="text-md">Tags</Label>
                <Textarea
                  id="edit-edge-tags"
                  placeholder="tag1 (YYYY-MM-DD), tag2, tag3 (YYYY-MM-DD)"
                  value={editEdgeTagsInput}
                  onChange={(e) => setEditEdgeTagsInput(e.target.value)}
                  className="text-md p-3 min-h-[80px]"
                />
                <p className="text-xs text-muted-foreground">Separate tags with commas. Dates (YYYY-MM-DD) are optional per tag.</p>
              </div>
            </div>
            <DialogFooter className="flex justify-between">
              <Button variant="destructive" onClick={deleteEdge} className="text-md px-5 py-2.5 mr-auto">
                <Trash2 className="mr-2 h-5 w-5" /> Delete Edge
              </Button>
              <div>
                <DialogClose asChild>
                  <Button variant="outline" className="text-md px-5 py-2.5 mr-2">Cancel</Button>
                </DialogClose>
                <Button type="submit" onClick={saveEdgeChanges} className="bg-primary text-primary-foreground hover:bg-primary/90 text-md px-5 py-2.5">
                  Save Changes
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

    </main>
  );
}

