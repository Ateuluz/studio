
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
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Plus, Link2, Trash2 } from "lucide-react";

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

const REPULSION_STRENGTH = 0.5;
const MIN_SEPARATION = 15;
const REPULSION_ITERATIONS = 10;

const BASE_GRID_SIZE = 50; // Base size in world units

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
  const transformedContentRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(768); // Default, updated on mount

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

  const [scale, setScale] = useState(1);
  const [offsetX, setOffsetX] = useState(0); 
  const [offsetY, setOffsetY] = useState(0); 

  const [panXSliderLimits, setPanXSliderLimits] = useState({ min: -500, max: 500 });
  const [panYSliderLimits, setPanYSliderLimits] = useState({ min: -500, max: 500 });
  const [effectiveGridSize, setEffectiveGridSize] = useState(BASE_GRID_SIZE);

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

  const screenToWorld = useCallback((screenX: number, screenY: number): { x: number, y: number } => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const worldX = (screenX - rect.left - offsetX) / scale;
    const worldY = (screenY - rect.top - offsetY) / scale;
    return { x: worldX, y: worldY };
  }, [offsetX, offsetY, scale]);

  // Effect to calculate and update pan limits and effective grid size
  useEffect(() => {
    if (!containerRef.current || containerWidth === 0) return;

    const nodesToConsider = activeInteractionNodeId 
      ? nodes.filter(n => n.id !== activeInteractionNodeId) 
      : nodes;

    let contentMinXWorld = 0, contentMaxXWorld = 0, contentMinYWorld = 0, contentMaxYWorld = 0;

    if (nodesToConsider.length > 0) {
      contentMinXWorld = Math.min(...nodesToConsider.map(n => n.x));
      contentMaxXWorld = Math.max(...nodesToConsider.map(n => n.x + getNodeDimension(n)));
      contentMinYWorld = Math.min(...nodesToConsider.map(n => n.y));
      contentMaxYWorld = Math.max(...nodesToConsider.map(n => n.y + getNodeDimension(n)));
    } else {
      // Default world extent when no nodes (or only active node)
      // This should ensure the initial view is centered and pannable
      contentMinXWorld = 0;
      contentMaxXWorld = containerWidth / scale; 
      contentMinYWorld = 0;
      contentMaxYWorld = CONTAINER_HEIGHT_PX / scale;
    }
    
    // Padding in screen pixels (50% of viewport)
    const paddingXScreen = containerWidth / 2;
    const paddingYScreen = CONTAINER_HEIGHT_PX / 2;

    // Content dimensions in screen pixels
    const contentScreenWidth = (contentMaxXWorld - contentMinXWorld) * scale;
    const contentScreenHeight = (contentMaxYWorld - contentMinYWorld) * scale;
    
    let newOffsetXMin, newOffsetXMax, newOffsetYMin, newOffsetYMax;

    // Calculate X pan limits
    if (contentScreenWidth <= containerWidth - 2 * paddingXScreen) {
      // Content + padding is smaller than or fits viewport: center it
      const targetOffsetX = containerWidth / 2 - ((contentMinXWorld + contentMaxXWorld) / 2) * scale;
      newOffsetXMin = targetOffsetX;
      newOffsetXMax = targetOffsetX;
    } else {
      // Content + padding is larger than viewport: allow panning
      newOffsetXMin = containerWidth - (contentMaxXWorld * scale + paddingXScreen);
      newOffsetXMax = -contentMinXWorld * scale + paddingXScreen;
    }

    // Calculate Y pan limits
    if (contentScreenHeight <= CONTAINER_HEIGHT_PX - 2 * paddingYScreen) {
      // Content + padding is smaller than or fits viewport: center it
      const targetOffsetY = CONTAINER_HEIGHT_PX / 2 - ((contentMinYWorld + contentMaxYWorld) / 2) * scale;
      newOffsetYMin = targetOffsetY;
      newOffsetYMax = targetOffsetY;
    } else {
      // Content + padding is larger than viewport: allow panning
      newOffsetYMin = CONTAINER_HEIGHT_PX - (contentMaxYWorld * scale + paddingYScreen);
      newOffsetYMax = -contentMinYWorld * scale + paddingYScreen;
    }
    
    setPanXSliderLimits({ min: Math.min(newOffsetXMin, newOffsetXMax), max: Math.max(newOffsetXMin, newOffsetXMax) }); // Ensure min <= max
    setPanYSliderLimits({ min: Math.min(newOffsetYMin, newOffsetYMax), max: Math.max(newOffsetYMin, newOffsetYMax) }); // Ensure min <= max

    // Clamp current offsets
    setOffsetX(currentOffsetX => Math.max(Math.min(newOffsetXMin, newOffsetXMax), Math.min(Math.max(newOffsetXMin, newOffsetXMax), currentOffsetX)));
    setOffsetY(currentOffsetY => Math.max(Math.min(newOffsetYMin, newOffsetYMax), Math.min(Math.max(newOffsetYMin, newOffsetYMax), currentOffsetY)));

    // Update effective grid size based on scale
    if (scale < 0.4) {
      setEffectiveGridSize(BASE_GRID_SIZE * 4);
    } else if (scale < 0.8) {
      setEffectiveGridSize(BASE_GRID_SIZE * 2);
    } else {
      setEffectiveGridSize(BASE_GRID_SIZE);
    }

  }, [nodes, scale, containerWidth, activeInteractionNodeId, getNodeDimension]);


  const createNode = () => {
    if (newNodeName && containerWidth > 0) {
      const tagsArray = newNodeTags.split(',').map(tag => tag.trim()).filter(tag => tag);
      let newNodeX = 0;
      let newNodeY = 0;
      let placed = false;
      let attempts = 0;
      const newNodeDimension = getNodeDimension(newNodeType);

      // Create nodes relative to the current center of the viewport in world coordinates
      const worldViewCenterX = (-offsetX + containerWidth / 2) / scale;
      const worldViewCenterY = (-offsetY + CONTAINER_HEIGHT_PX / 2) / scale;
      
      // Define a creation area around the current view center (e.g., half viewport size)
      const creationAreaWorldWidth = (containerWidth / 2) / scale;
      const creationAreaWorldHeight = (CONTAINER_HEIGHT_PX / 2) / scale;

      do {
        newNodeX = worldViewCenterX - (creationAreaWorldWidth / 2) + Math.random() * creationAreaWorldWidth;
        newNodeY = worldViewCenterY - (creationAreaWorldHeight / 2) + Math.random() * creationAreaWorldHeight;
        
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
        console.warn(`Could not find a non-overlapping position for new node "${newNodeName}" after ${MAX_PLACEMENT_ATTEMPTS} attempts.`);
        // Fallback: place at view center, potentially overlapping
        newNodeX = worldViewCenterX - newNodeDimension / 2;
        newNodeY = worldViewCenterY - newNodeDimension / 2;
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
    
    const point = 'touches' in event ? event.touches[0] : event;
    setActiveInteractionNodeId(node.id);
    setInteractionStartPos({ x: point.clientX, y: point.clientY }); 

    const worldMousePos = screenToWorld(point.clientX, point.clientY);
    setDragOffset({
        x: worldMousePos.x - node.x, 
        y: worldMousePos.y - node.y
    });

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

      const worldMousePos = screenToWorld(point.clientX, point.clientY);

      const screenDx = point.clientX - interactionStartPos.x;
      const screenDy = point.clientY - interactionStartPos.y;

      if (Math.abs(screenDx) > DRAG_MOVE_THRESHOLD || Math.abs(screenDy) > DRAG_MOVE_THRESHOLD) {
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
              x2: worldMousePos.x,
              y2: worldMousePos.y,
            });
          }
        } else {
          setIsDraggingForReposition(true);
          setNodes(prevNodes => prevNodes.map(n => {
            if (n.id === activeInteractionNodeId) {
              let newX = worldMousePos.x - dragOffset.x;
              let newY = worldMousePos.y - dragOffset.y;
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

      const worldMouseReleasePos = screenToWorld(point.clientX, point.clientY);
      let targetNodeUnderneath: Node | null = null;

      for (const node of nodes) {
        if (node.id === activeInteractionNodeId && isLinkingModeActive) continue; 
        const nodeDim = getNodeDimension(node);
        if (worldMouseReleasePos.x >= node.x && worldMouseReleasePos.x <= node.x + nodeDim &&
            worldMouseReleasePos.y >= node.y && worldMouseReleasePos.y <= node.y + nodeDim) {
            if(node.id !== linkingSourceNodeId) { 
              targetNodeUnderneath = node;
              break;
            }
        }
      }
      
      if (linkingLinePreview && linkingSourceNodeId) {
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
            } else { 
                // If linking and released in empty space, move the source node
                setNodes(prevNodes => prevNodes.map(n => {
                    if (n.id === linkingSourceNodeId) {
                        let newX = worldMouseReleasePos.x - (dragOffset?.x || (getNodeDimension(n)/2));
                        let newY = worldMouseReleasePos.y - (dragOffset?.y || (getNodeDimension(n)/2));
                        return { ...n, x: newX, y: newY };
                    }
                    return n;
                }));
            }
        }
      } else if (isDraggingForReposition) {
        const draggedNodeId = activeInteractionNodeId;
        // Node position is already updated during move.
        // Check if dropped on another node for edge creation.
        if (draggedNodeId && targetNodeUnderneath && draggedNodeId !== targetNodeUnderneath.id) { 
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
      } else if (isLinkingModeActive && activeInteractionNodeId) { 
        // Press-hold completed, but no significant drag occurred for linking line
        setShowSearchBar(true);
      } else if (activeInteractionNodeId && !isDraggingForReposition && !isLinkingModeActive && !showSearchBar) { 
        // This is a click/tap
        const nodeToEdit = nodes.find(n => n.id === activeInteractionNodeId);
        if (nodeToEdit) openEditNodeDialog(nodeToEdit);
      }

      // Reset states that should be cleared regardless of dialogs opening
      if (!isCreateEdgeDialogOpen && !isEditNodeDialogOpen && !isEditEdgeDialogOpen && !showSearchBar) {
         setActiveInteractionNodeId(null); // Only clear if no dialog will take focus
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
  }, [activeInteractionNodeId, interactionStartPos, dragOffset, pressHoldTimer, nodes, isDraggingForReposition, showSearchBar, openEditNodeDialog, isLinkingModeActive, linkingSourceNodeId, linkingLinePreview, isCreateEdgeDialogOpen, isEditNodeDialogOpen, isEditEdgeDialogOpen, edges, getNodeDimension, containerWidth, findExistingEdge, screenToWorld, scale, offsetX, offsetY]);


  const applyRepulsion = useCallback((currentNodes: Node[], fixedNodeId: string | null): Node[] => {
    if (currentNodes.length < 2 || containerWidth === 0) return currentNodes;

    let newNodes = currentNodes.map(n => ({ ...n }));

    for (let iter = 0; iter < REPULSION_ITERATIONS; iter++) {
      let systemMoved = false;
      for (let i = 0; i < newNodes.length; i++) {
        for (let j = i + 1; j < newNodes.length; j++) {
          const nodeA = newNodes[i];
          const nodeB = newNodes[j];

          // If fixedNodeId is present, it means nodeA or nodeB is being interacted with.
          // The fixedNodeId node should not exert force nor be moved by others.
          if (fixedNodeId && (nodeA.id === fixedNodeId || nodeB.id === fixedNodeId)) {
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

            // Both nodes move by half unless one is fixed (which is handled by the continue above)
            let moveAx = -normDx * forceMagnitude / 2;
            let moveAy = -normDy * forceMagnitude / 2;
            let moveBx = normDx * forceMagnitude / 2;
            let moveBy = normDy * forceMagnitude / 2;
            
            const prevXA = nodeA.x;
            const prevYA = nodeA.y;
            // Only apply movement if node is not the fixed one
            if (nodeA.id !== fixedNodeId) { 
              nodeA.x += moveAx;
              nodeA.y += moveAy;
            }
            if (Math.abs(nodeA.x - prevXA) > 0.01 || Math.abs(nodeA.y - prevYA) > 0.01) systemMoved = true;

            const prevXB = nodeB.x;
            const prevYB = nodeB.y;
             if (nodeB.id !== fixedNodeId) {
              nodeB.x += moveBx;
              nodeB.y += moveBy;
            }
            if (Math.abs(nodeB.x - prevXB) > 0.01 || Math.abs(nodeB.y - prevYB) > 0.01) systemMoved = true;
          }
        }
      }
      if (!systemMoved && iter > 0) break;
    }
    return newNodes;
  }, [getNodeDimension, containerWidth]); 

  useEffect(() => {
    // General repulsion when no node is being actively interacted with
    if (nodes.length < 2 || containerWidth === 0 || activeInteractionNodeId) return;
    
    const repulsedNodes = applyRepulsion(nodes, null); // No node is fixed
    let changed = false;
    if (nodes.length === repulsedNodes.length) {
        for (let i = 0; i < nodes.length; i++) {
            if (Math.abs(nodes[i].x - repulsedNodes[i].x) > 0.1 || Math.abs(nodes[i].y - repulsedNodes[i].y) > 0.1) {
                changed = true;
                break;
            }
        }
    } else { changed = true; }

    if (changed) {
      // Defer state update slightly to avoid rapid re-renders during interactions
      const timeoutId = setTimeout(() => setNodes(repulsedNodes), 50); 
      return () => clearTimeout(timeoutId);
    }
  }, [nodes, activeInteractionNodeId, applyRepulsion, containerWidth]);

  useEffect(() => {
    // Repulsion when a node IS being actively interacted with (fixedNodeId is activeInteractionNodeId)
    // Only non-active nodes should repel each other. The active node does not exert force.
    if (nodes.length < 2 || containerWidth === 0 || !activeInteractionNodeId) return;
    
    const repulsedNodes = applyRepulsion(nodes, activeInteractionNodeId);
    let changed = false;
    // Check if any non-active node actually moved
    for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].id === activeInteractionNodeId) continue; 
        const rn = repulsedNodes.find(r => r.id === nodes[i].id);
        if (rn && (Math.abs(nodes[i].x - rn.x) > 0.1 || Math.abs(nodes[i].y - rn.y) > 0.1)) {
            changed = true;
            break;
        }
    }

    if (changed) {
      const timeoutId = setTimeout(() => {
        setNodes(currentNodes => currentNodes.map(cn => {
            if (cn.id === activeInteractionNodeId) return cn; // Keep active node fixed by user input
            const rn = repulsedNodes.find(r => r.id === cn.id);
            return rn || cn; // Apply repulsion to other nodes
        }));
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [nodes, activeInteractionNodeId, applyRepulsion, containerWidth]);


  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  const minScale = 0.1; 
  const maxScale = 1.5; // Allow slight zoom in

  const worldViewTopLeftX = -offsetX / scale;
  const worldViewTopLeftY = -offsetY / scale;
  const visibleWorldWidth = containerWidth / scale;
  const visibleWorldHeight = CONTAINER_HEIGHT_PX / scale;

  const patternOffsetX = worldViewTopLeftX % effectiveGridSize;
  const patternOffsetY = worldViewTopLeftY % effectiveGridSize;


  return (
    <main className="flex flex-col items-center justify-start min-h-screen p-4 sm:p-6 md:p-8 lg:p-10 bg-background text-foreground">
      <h1 className="text-3xl font-bold tracking-tight mb-6 text-center">Node Weaver</h1>

      <div className="w-full max-w-3xl flex flex-col items-center gap-4 mb-4">
        <div className="w-full grid grid-cols-3 gap-4 items-center px-2">
            <Label htmlFor="scale-slider" className="text-sm text-right">Zoom: {Math.round(scale * 100)}%</Label>
            <Slider
                id="scale-slider"
                min={minScale}
                max={maxScale}
                step={0.01}
                value={[scale]}
                onValueChange={(value) => setScale(value[0])}
                className="col-span-2"
            />
        </div>
        <div className="w-full grid grid-cols-3 gap-4 items-center px-2">
            <Label htmlFor="offset-x-slider" className="text-sm text-right">Pan X: {Math.round(offsetX)}px</Label>
            <Slider
                id="offset-x-slider"
                min={panXSliderLimits.min}
                max={panXSliderLimits.max}
                step={1} // Finer step for smoother manual pan
                value={[offsetX]}
                onValueChange={(value) => setOffsetX(value[0])}
                className="col-span-2"
                disabled={panXSliderLimits.min >= panXSliderLimits.max} // Disable if no range
            />
        </div>
         <div className="w-full grid grid-cols-3 gap-4 items-center px-2">
            <Label htmlFor="offset-y-slider" className="text-sm text-right">Pan Y: {Math.round(offsetY)}px</Label>
            <Slider
                id="offset-y-slider"
                min={panYSliderLimits.min}
                max={panYSliderLimits.max}
                step={1} // Finer step
                value={[offsetY]}
                onValueChange={(value) => setOffsetY(value[0])}
                className="col-span-2"
                disabled={panYSliderLimits.min >= panYSliderLimits.max} // Disable if no range
            />
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative w-full max-w-3xl border rounded-lg shadow-inner bg-card touch-none overflow-hidden"
        style={{ height: `${CONTAINER_HEIGHT_PX}px` }}
      >
        <div
          ref={transformedContentRef}
          style={{
            width: '100%', 
            height: '100%',
            transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
            transformOrigin: '0 0',
            willChange: 'transform', 
          }}
        >
          <svg width="100%" height="100%" className="absolute top-0 left-0 pointer-events-none z-0">
            <defs>
              <pattern 
                id="gridPattern" 
                width={effectiveGridSize} 
                height={effectiveGridSize} 
                patternUnits="userSpaceOnUse"
                x={patternOffsetX} // Offset of the pattern tile itself
                y={patternOffsetY}
              >
                <path d={`M ${effectiveGridSize} 0 L 0 0 0 ${effectiveGridSize}`} fill="none" stroke="hsl(var(--border))" strokeWidth="0.5" opacity="0.5"/>
              </pattern>
            </defs>
            {/* This rect defines the area where the pattern is drawn, in world coordinates */}
            <rect 
              x={worldViewTopLeftX} 
              y={worldViewTopLeftY} 
              width={visibleWorldWidth} 
              height={visibleWorldHeight} 
              fill="url(#gridPattern)" 
            />
          </svg>

          <svg className="absolute top-0 left-0 w-full h-full pointer-events-none" 
             style={{ 
                // This SVG needs to be large enough to draw all potential edges.
                // Using a very large fixed size relative to its parent's (transformedContentRef) scaled size.
                // These dimensions are in the SVG's own coordinate system (effectively world units here if not scaled again by SVG attrs)
                // The left/top are to center this large canvas around a nominal world origin
                width: `10000px`, // Should be large enough in world units.
                height: `10000px`,
                left: '-5000px', // Center this large drawing surface around world (0,0)
                top: '-5000px',
            }}
          >
            {isClient && edges.map(edge => {
              const sourceNode = nodes.find(n => n.id === edge.sourceNodeId);
              const targetNode = nodes.find(n => n.id === edge.targetNodeId);
              if (!sourceNode || !targetNode) return null;

              const sourceDim = getNodeDimension(sourceNode);
              const targetDim = getNodeDimension(targetNode);
              
              // Coordinates for lines are world coordinates.
              // The SVG is offset by -5000, so add 5000 to map world coords to SVG coords.
              const svgDrawingOffsetX = 5000;
              const svgDrawingOffsetY = 5000;

              return (
                <line
                  key={edge.id}
                  x1={svgDrawingOffsetX + sourceNode.x + sourceDim / 2}
                  y1={svgDrawingOffsetY + sourceNode.y + sourceDim / 2}
                  x2={svgDrawingOffsetX + targetNode.x + targetDim / 2}
                  y2={svgDrawingOffsetY + targetNode.y + targetDim / 2}
                  stroke="hsl(var(--ring))"
                  strokeWidth={2 / scale} // Make stroke visually thinner when zoomed out
                  opacity="0.6"
                />
              );
            })}
            {linkingLinePreview && (
              <line 
                x1={5000 + linkingLinePreview.x1} 
                y1={5000 + linkingLinePreview.y1}
                x2={5000 + linkingLinePreview.x2}
                y2={5000 + linkingLinePreview.y2}
                stroke="hsl(var(--primary))"
                strokeWidth={2 / scale} 
                strokeDasharray={`${5/scale},${5/scale}`} // Dash pattern scales too
              />
            )}
          </svg>

          {isClient && nodes.map((node) => {
            const nodeDimension = getNodeDimension(node);
            const nodeStyles: React.CSSProperties = {
              position: 'absolute', 
              left: `${node.x}px`, 
              top: `${node.y}px`,  
              width: `${nodeDimension}px`,
              height: `${nodeDimension}px`,
              backgroundColor: "hsl(var(--node-color))",
              color: "hsl(var(--card-foreground))",
              zIndex: activeInteractionNodeId === node.id ? 20 : 10, // Higher Z for active
              borderRadius: '9999px', 
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 6px hsla(var(--foreground), 0.1)',
              transition: 'box-shadow 0.2s ease', 
              userSelect: 'none',
              border: '1px solid hsl(var(--border))'
            };
            if (node.type === 'entity') {
              nodeStyles.borderColor = 'hsl(var(--ring))';
              nodeStyles.borderWidth = '2px';
            }
            
            if(activeInteractionNodeId === node.id && (isDraggingForReposition || isLinkingModeActive)){
                nodeStyles.boxShadow = '0 10px 15px hsla(var(--foreground), 0.2), 0 0 0 3px hsl(var(--primary))';
                nodeStyles.transform = 'scale(1.05)'; // Slight visual feedback for active node
            }

            const minFontSize = 6; // Minimum font size in pixels on screen
            const baseNameFontSize = 16; // Base font size for name in world units
            const baseTagFontSize = 10; // Base font size for tags in world units

            const dynamicNameFontSize = Math.max(minFontSize / scale, baseNameFontSize / scale);
            const dynamicTagFontSize = Math.max(minFontSize / scale, baseTagFontSize / scale);


            return (
              <div
                key={node.id}
                className={`p-3 flex flex-col items-center justify-center text-center cursor-pointer shadow-xl transition-all duration-200 hover:shadow-2xl select-none`}
                style={nodeStyles}
                onMouseDown={(e) => handleNodeInteractionStart(e, node)}
                onTouchStart={(e) => handleNodeInteractionStart(e, node)}
                title={`Interact with ${node.name}`}
              >
                <h2 className="text-md font-semibold truncate w-full" style={{ fontSize: `${dynamicNameFontSize}px`, lineHeight: '1.2' }}>{node.name}</h2>
                {node.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap justify-center gap-1 overflow-hidden max-h-[3em]"> {/* Limit tag height */}
                    {node.tags.slice(0, 2).map(tag => (
                      <span key={tag} className="text-xs bg-black/20 text-white px-2 py-0.5 rounded-full" style={{ fontSize: `${dynamicTagFontSize}px`, lineHeight: '1.2' }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {node.tags.length > 2 && (
                  <span className="text-xs mt-0.5 opacity-70" style={{ fontSize: `${dynamicTagFontSize}px`, lineHeight: '1.2' }}>+{node.tags.length - 2} more</span>
                )}
              </div>
            );
          })}
        </div> 
      </div>

      {showSearchBar && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[90%] max-w-md z-50 p-1 bg-background/80 backdrop-blur-sm rounded-lg shadow-2xl border border-border">
          <div className="relative p-3">
            <Input
              placeholder="Search nodes or type to connect..."
              className="bg-card shadow-md text-lg p-3 pr-12 border-input focus:ring-primary"
              onFocus={() => {
                if(pressHoldTimer) clearTimeout(pressHoldTimer);
                 // When search bar is focused, no node should be "active" for interaction
                if(activeInteractionNodeId) setActiveInteractionNodeId(null);
              }}
            />
            <Button
              onClick={() => {
                setShowSearchBar(false);
                setActiveInteractionNodeId(null); // Ensure active node is cleared when closing search
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
            setActiveInteractionNodeId(null); // Clear active node if dialog closes
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
            if (!isOpen) { setEditingEdge(null); setActiveInteractionNodeId(null); } // Clear active node
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

