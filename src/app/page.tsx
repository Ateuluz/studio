
"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Plus, Link2, Trash2, Download, Upload, Settings, XIcon, Rows3, Search as SearchIconLucide, Eye, EyeOff, Lock, Unlock } from "lucide-react";
import type { Node, Edge, EdgeTag } from '@/lib/types';
import { loadNodesFromFile, saveNodesToFile, loadEdgesFromFile, saveEdgesToFile } from "./data-actions";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { useNodeInteractions } from "@/hooks/useNodeInteractions";
import { useViewportManager } from "@/hooks/useViewportManager";


const CATEGORY_NODE_DIMENSION = 160;
const ENTITY_NODE_DIMENSION = 128;

const DRAG_MOVE_THRESHOLD = 5; 
const QUICK_PRESS_DURATION_THRESHOLD = 70; 
const MAX_PLACEMENT_ATTEMPTS = 30;

const REPULSION_STRENGTH = 0.5;
const MIN_SEPARATION = 15; 
const REPULSION_ITERATIONS = 10;

const BASE_GRID_SIZE = 50; 
const EDGE_BASE_SCREEN_THICKNESS = 2;


// These functions are pure and can be outside the component
function getGridLineWorldSeparation(scale: number): number {
  if (scale < 0.4) return BASE_GRID_SIZE * 4;
  if (scale < 0.8) return BASE_GRID_SIZE * 2;
  return BASE_GRID_SIZE;
}

interface ScreenGridData {
  verticalLines: number[]; 
  horizontalLines: number[];
}

function calculateScreenGridLinePositions(
  offsetX: number, 
  offsetY: number, 
  scale: number,
  containerWidth: number, 
  containerHeight: number 
): ScreenGridData {
  if (containerWidth <= 0 || containerHeight <= 0 || scale === 0 || !isFinite(scale)) {
    return { verticalLines: [], horizontalLines: [] };
  }

  const worldSeparation = getGridLineWorldSeparation(scale); 
  const screenSeparation = worldSeparation * scale; 

  if (screenSeparation < 5 || !isFinite(screenSeparation)) { 
    return { verticalLines: [], horizontalLines: [] };
  }

  const verticalLines: number[] = [];
  const horizontalLines: number[] = [];

  const worldViewTopLeftX = -offsetX / scale;
  const worldViewTopLeftY = -offsetY / scale;

  const firstVerticalWorldLine_k = Math.floor(worldViewTopLeftX / worldSeparation);
  const lastVerticalWorldLine_k = Math.ceil((worldViewTopLeftX + containerWidth / scale) / worldSeparation);

  for (let k = firstVerticalWorldLine_k; k <= lastVerticalWorldLine_k; k++) {
    const worldX = k * worldSeparation;
    const screenX = worldX * scale + offsetX; 
    if (screenX >= -screenSeparation && screenX <= containerWidth + screenSeparation) {
      verticalLines.push(screenX);
    }
  }

  const firstHorizontalWorldLine_k = Math.floor(worldViewTopLeftY / worldSeparation);
  const lastHorizontalWorldLine_k = Math.ceil((worldViewTopLeftY + containerHeight / scale) / worldSeparation);
  
  for (let k = firstHorizontalWorldLine_k; k <= lastHorizontalWorldLine_k; k++) {
    const worldY = k * worldSeparation;
    const screenY = worldY * scale + offsetY; 
    if (screenY >= -screenSeparation && screenY <= containerHeight + screenSeparation) {
      horizontalLines.push(screenY);
    }
  }
  
  return { verticalLines, horizontalLines };
}


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

type InteractionMode = 'none' | 'backgroundQuickPressCandidate' | 'backgroundPanning' | 'pinchZooming' | 'nodeInteractionDuringLayoutLock';

interface PinchStartData {
  initialPinchDistance: number;
  initialScale: number;
  pinchMidpointScreen: { x: number; y: number }; 
}


export default function Home() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const transformedContentRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [initialLoadAndCenteringComplete, setInitialLoadAndCenteringComplete] = useState(false);

  const [isCreateNodeDialogOpen, setIsCreateNodeDialogOpen] = useState(false);
  const [newNodeName, setNewNodeName] = useState("");
  const [newNodeDescription, setNewNodeDescription] = useState("");
  const [newNodeTags, setNewNodeTags] = useState("");
  const [newNodeType, setNewNodeType] = useState<'category' | 'entity'>('category');
  const [newNodeBirthday, setNewNodeBirthday] = useState("");
  const [pendingNodeCreationCoords, setPendingNodeCreationCoords] = useState<{x: number, y: number} | null>(null);

  const [isEditNodeDialogOpen, setIsEditNodeDialogOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const [editNodeName, setEditNodeName] = useState("");
  const [editNodeDescription, setEditNodeDescription] = useState("");
  const [editNodeTags, setEditNodeTags] = useState("");
  const [editNodeBirthday, setEditNodeBirthday] = useState("");
  const [connectNodeSearchQuery, setConnectNodeSearchQuery] = useState("");
  const [connectNodeSearchResults, setConnectNodeSearchResults] = useState<Node[]>([]);

  const [isCreateEdgeDialogOpen, setIsCreateEdgeDialogOpen] = useState(false);
  const [newEdgeDataSourceNodeId, setNewEdgeDataSourceNodeId] = useState<string | null>(null);
  const [newEdgeDataTargetNodeId, setNewEdgeDataTargetNodeId] = useState<string | null>(null);
  const [newEdgeTagsInput, setNewEdgeTagsInput] = useState("");

  const [isEditEdgeDialogOpen, setIsEditEdgeDialogOpen] = useState(false);
  const [editingEdge, setEditingEdge] = useState<Edge | null>(null);
  const [editEdgeTagsInput, setEditEdgeTagsInput] = useState("");

  const [interactionMode, setInteractionMode] = useState<InteractionMode>('none');
  const [panStartCoords, setPanStartCoords] = useState<{ x: number; y: number } | null>(null);
  const [quickPressStartInfo, setQuickPressStartInfo] = useState<{ screenX: number, screenY: number, worldX: number, worldY: number, time: number } | null>(null);
  const [pinchStartData, setPinchStartData] = useState<PinchStartData | null>(null);
  
  const [isSliderPanelOpen, setIsSliderPanelOpen] = useState(false);
  const [isActionButtonsOpen, setIsActionButtonsOpen] = useState(false);

  const [isSearchDialogOpen, setIsSearchDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Node[]>([]);

  const [isLayoutLocked, setIsLayoutLocked] = useState(false);
  const [isFocusModeActive, setIsFocusModeActive] = useState(false);
  const [focusModeStartNodeId, setFocusModeStartNodeId] = useState<string | null>(null);
  const [focusModeExpandedNodeIds, setFocusModeExpandedNodeIds] = useState<Set<string>>(new Set());
  const [focusModeVisibleNodeIds, setFocusModeVisibleNodeIds] = useState<Set<string>>(new Set());
  
  const { toast } = useToast();

  const getNodeDimension = useCallback((nodeOrType: Node | Node['type']) => {
    const type = typeof nodeOrType === 'string' ? nodeOrType : nodeOrType.type;
    return type === 'category' ? CATEGORY_NODE_DIMENSION : ENTITY_NODE_DIMENSION;
  }, []);

  // Callbacks passed to useNodeInteractions must be defined before useNodeInteractions itself.
  const openEditNodeDialog = useCallback((node: Node) => {
    setEditingNode(node);
    setEditNodeName(node.name);
    setEditNodeDescription(node.description);
    setEditNodeTags(node.tags.join(', '));
    setEditNodeBirthday(node.birthday || "");
    setConnectNodeSearchQuery(""); 
    setConnectNodeSearchResults([]); 
    setIsEditNodeDialogOpen(true);
  }, []);

  const openCreateEdgeDialog = useCallback((sourceNodeId: string, targetNodeId: string) => {
    setNewEdgeDataSourceNodeId(sourceNodeId);
    setNewEdgeDataTargetNodeId(targetNodeId);
    setNewEdgeTagsInput("");
    setIsCreateEdgeDialogOpen(true);
  }, []);

  const openEditEdgeDialog = useCallback((edge: Edge) => {
    setEditingEdge(edge);
    setEditEdgeTagsInput(formatTagsWithDates(edge.tags));
    setIsEditEdgeDialogOpen(true);
  }, []);

  const findExistingEdge = useCallback((nodeId1: string, nodeId2: string): Edge | undefined => {
    return edges.find(edge =>
      (edge.sourceNodeId === nodeId1 && edge.targetNodeId === nodeId2) ||
      (edge.sourceNodeId === nodeId2 && edge.targetNodeId === nodeId1)
    );
  }, [edges]);
  
  const {
    activeInteractionNodeId: activeInteractionNodeIdFromHook,
    linkingLinePreview,
    handleNodeInteractionStart,
    handleNodeInteractionMove: handleNodeMove, 
    handleNodeInteractionEnd: handleNodeEnd,
    isDraggingForReposition, 
    isLinkingModeActive, 
    clearNodeInteractionStates,
  } = useNodeInteractions({
    nodes,
    setNodes,
    edges, 
    openEditNodeDialog,
    openCreateEdgeDialog,
    openEditEdgeDialog,
    findExistingEdge,
    getNodeDimension,
    screenToWorld: (screenX, screenY) => viewport.screenToWorld(screenX, screenY), // viewport defined below
    saveNodesToFileCallback: async (currentNodes) => saveNodesToFile(currentNodes),
    isLayoutLocked,
    isFocusModeActive,
    focusModeVisibleNodeIds,
    focusModeStartNodeId,
    toggleNodeInFocusMode: (nodeId: string) => {
      if (!isFocusModeActive || nodeId === focusModeStartNodeId) return; // Start node cannot be un-toggled by click
      setFocusModeExpandedNodeIds(prevExpandedIds => {
          const newExpandedIds = new Set(prevExpandedIds);
          if (newExpandedIds.has(nodeId)) {
              newExpandedIds.delete(nodeId);
          } else {
              newExpandedIds.add(nodeId);
          }
          return newExpandedIds;
      });
    },
  });

  const viewport = useViewportManager({
    containerRef,
    nodes,
    getNodeDimension,
    activeInteractionNodeId: activeInteractionNodeIdFromHook, 
    interactionMode,
    onDimensionsReady: (width, height) => {
        // This callback ensures loadInitialData is called only when dimensions are ready.
        // It also helps to avoid calling loadInitialData multiple times if viewport dimensions change rapidly initially.
        if (!initialLoadAndCenteringComplete && width > 0 && height > 0) {
          loadInitialData(); // loadInitialData will use viewport.containerWidth/Height
        }
    }
  });

  const handleToggleFocusMode = useCallback((activate?: boolean) => {
    const targetState = typeof activate === 'boolean' ? activate : !isFocusModeActive;

    if (targetState) { 
        if (nodes.length === 0) {
            toast({ title: "Focus Mode", description: "Cannot activate Focus Mode: No nodes in the graph.", variant: "destructive" });
            setIsFocusModeActive(false); 
            return;
        }
        clearNodeInteractionStates(); 
        setInteractionMode('none'); 

        setIsFocusModeActive(true);
        setIsLayoutLocked(true); 

        const mainNode = nodes.find(n => n.tags.includes("Main"));
        const startNode = mainNode || nodes[0]; 

        if (startNode) {
            setFocusModeStartNodeId(startNode.id);
            setFocusModeExpandedNodeIds(new Set([startNode.id])); 
            
            const nodeDimension = getNodeDimension(startNode.type);
            const targetScale = 1.0; 
            
            const targetOffsetX = Math.round((viewport.containerWidth / 2) - (startNode.x + nodeDimension / 2) * targetScale);
            const targetOffsetY = Math.round((viewport.containerHeight / 2) - (startNode.y + nodeDimension / 2) * targetScale);
            
            viewport.setViewportScale(targetScale);
            viewport.setViewportOffset(targetOffsetX, targetOffsetY);
        } else { 
            setIsFocusModeActive(false);
            setIsLayoutLocked(false); 
            toast({ title: "Focus Mode", description: "Error finding a start node for Focus Mode.", variant: "destructive" });
        }
    } else { 
        setIsFocusModeActive(false);
        setIsLayoutLocked(false); 
        setFocusModeStartNodeId(null);
        setFocusModeExpandedNodeIds(new Set());
        setFocusModeVisibleNodeIds(new Set()); 
    }
  }, [
    isFocusModeActive, nodes, getNodeDimension, toast, clearNodeInteractionStates, 
    viewport.containerWidth, viewport.containerHeight, viewport.setViewportScale, viewport.setViewportOffset,
    setIsFocusModeActive, setIsLayoutLocked, setFocusModeStartNodeId, setFocusModeExpandedNodeIds, setFocusModeVisibleNodeIds, setInteractionMode
  ]);

  useEffect(() => {
    if (!isFocusModeActive || !focusModeStartNodeId || !nodes.length) {
        setFocusModeVisibleNodeIds(new Set());
        return;
    }
    const newVisibleNodes = new Set<string>();
    const startNodeExists = nodes.find(n => n.id === focusModeStartNodeId);
    if (startNodeExists) {
        newVisibleNodes.add(focusModeStartNodeId);
    } else {
        handleToggleFocusMode(false); // If start node is deleted/missing, turn off focus mode.
        return;
    }

    focusModeExpandedNodeIds.forEach(expandedId => {
        if (nodes.find(n => n.id === expandedId)) { // Check if expanded node still exists
            newVisibleNodes.add(expandedId);
            const expandedNode = nodes.find(n => n.id === expandedId);
            if (expandedNode) {
                edges.forEach(edge => {
                    if (edge.sourceNodeId === expandedId && nodes.find(n => n.id === edge.targetNodeId)) { // Check if target neighbor exists
                        newVisibleNodes.add(edge.targetNodeId);
                    } else if (edge.targetNodeId === expandedId && nodes.find(n => n.id === edge.sourceNodeId)) { // Check if source neighbor exists
                        newVisibleNodes.add(edge.sourceNodeId);
                    }
                });
            }
        }
    });
    setFocusModeVisibleNodeIds(newVisibleNodes);

    // Auto-turn off focus mode if only the start node is left and no other expanded nodes are present
    // or if the start node itself gets un-expanded (which shouldn't happen by click but good for robustness)
    if(focusModeExpandedNodeIds.size === 0 && isFocusModeActive){
      handleToggleFocusMode(false);
    } else if (focusModeExpandedNodeIds.size === 1 && focusModeExpandedNodeIds.has(focusModeStartNodeId) && newVisibleNodes.size === 1 && isFocusModeActive) {
      // This condition means only the start node is "expanded" and no neighbors are shown (implies it has no connections or they were all un-toggled)
      // The UX for this specific state might need more thought - for now, it remains active with just the start node.
      // To auto-disable if start node has no visible connections:
      // if (newVisibleNodes.size === 1) handleToggleFocusMode(false); 
    }

  }, [isFocusModeActive, focusModeStartNodeId, focusModeExpandedNodeIds, nodes, edges, handleToggleFocusMode]);

  const loadInitialData = useCallback(async () => {
    if (typeof window === 'undefined') return; 

    let loadedNodes: Node[] = [];
    let loadedEdgesData: Edge[] = [];

    try {
      loadedNodes = await loadNodesFromFile();
    } catch (error) {
        console.warn("Error loading nodes file, starting with empty nodes:", error);
        loadedNodes = [];
    }
    try {
        loadedEdgesData = await loadEdgesFromFile();
    } catch (error) {
        console.warn("Error loading edges file, starting with empty edges:", error);
        loadedEdgesData = [];
    }

    let nodesToSet = loadedNodes;
    
    if (!initialLoadAndCenteringComplete && loadedNodes.length > 0 && viewport.containerWidth > 0 && viewport.containerHeight > 0) {
      clearNodeInteractionStates();
      setInteractionMode('none'); 

      const mainNode = nodesToSet.find(n => n.tags.includes("Main"));
      if (mainNode) {
        const deltaX = -mainNode.x;
        const deltaY = -mainNode.y;
        let mainNodeAfterAdjustment = mainNode;

        if (Math.abs(deltaX) > 0.0001 || Math.abs(deltaY) > 0.0001) { 
            const adjustedNodes = nodesToSet.map(node => ({
                ...node,
                x: node.x + deltaX,
                y: node.y + deltaY,
            }));
            nodesToSet = adjustedNodes;
            mainNodeAfterAdjustment = nodesToSet.find(n => n.id === mainNode.id) || mainNode; 
            await saveNodesToFile(nodesToSet); 
        }
        
        const mainNodeDimension = getNodeDimension(mainNodeAfterAdjustment.type);
        viewport.setViewportOffset(
            Math.round((viewport.containerWidth / 2) - (mainNodeDimension / 2) * viewport.scale),
            Math.round((viewport.containerHeight / 2) - (mainNodeDimension / 2) * viewport.scale)
        );
      }
      setInitialLoadAndCenteringComplete(true);
    }
    setNodes(nodesToSet);
    setEdges(loadedEdgesData);
    
  }, [
      viewport.containerWidth, viewport.containerHeight, viewport.scale, viewport.setViewportOffset, 
      getNodeDimension, initialLoadAndCenteringComplete, 
      setNodes, setEdges, setInitialLoadAndCenteringComplete, 
      clearNodeInteractionStates,
      setInteractionMode 
    ]);


  useEffect(() => {
    // Trigger initial data load once viewport dimensions are known and initial centering hasn't happened.
    if (!initialLoadAndCenteringComplete && viewport.containerWidth > 0 && viewport.containerHeight > 0) {
        loadInitialData();
    }
  }, [viewport.containerWidth, viewport.containerHeight, initialLoadAndCenteringComplete, loadInitialData]);


  const createNode = async () => {
    if (newNodeName && viewport.containerWidth > 0 && viewport.containerHeight > 0 && viewport.scale !== 0 && isFinite(viewport.scale)) {
      
      let currentNodesForCreation = [...nodes];
      const tagsArray = newNodeTags.split(',').map(tag => tag.trim()).filter(tag => tag);

      if (tagsArray.includes("Main")) {
        currentNodesForCreation = currentNodesForCreation.map(n => {
          if (n.id !== editingNode?.id && n.tags.includes("Main")) { 
            return { ...n, tags: n.tags.filter(t => t !== "Main") };
          }
          return n;
        });
      }

      let newNodeX = 0;
      let newNodeY = 0;
      let placed = false;
      const newNodeDimension = getNodeDimension(newNodeType);

      if (pendingNodeCreationCoords) {
        newNodeX = pendingNodeCreationCoords.x - newNodeDimension / 2; 
        newNodeY = pendingNodeCreationCoords.y - newNodeDimension / 2;
        placed = true;
        setPendingNodeCreationCoords(null); 
      }
      
      if (!placed) { 
        let attempts = 0;
        const worldViewCenterX = (-viewport.offsetX + viewport.containerWidth / 2) / viewport.scale;
        const worldViewCenterY = (-viewport.offsetY + viewport.containerHeight / 2) / viewport.scale;
        const creationAreaWorldWidth = (viewport.containerWidth / 2) / viewport.scale; 
        const creationAreaWorldHeight = (viewport.containerHeight / 2) / viewport.scale; 

        do {
          newNodeX = worldViewCenterX - (creationAreaWorldWidth / 2) + Math.random() * creationAreaWorldWidth;
          newNodeY = worldViewCenterY - (creationAreaWorldHeight / 2) + Math.random() * creationAreaWorldHeight;

          let overlap = false;
          for (const existingNode of currentNodesForCreation) { 
            const existingNodeDimension = getNodeDimension(existingNode);
            if (
              newNodeX < existingNode.x + existingNodeDimension &&
              newNodeX + newNodeDimension > existingNode.x &&
              newNodeY < existingNode.y + existingNodeDimension &&
              newNodeY + existingNodeDimension > existingNode.y
            ) {
              overlap = true;
              break;
            }
          }
          if (!overlap) placed = true;
          attempts++;
        } while (!placed && attempts < MAX_PLACEMENT_ATTEMPTS);

        if (!placed) { 
          newNodeX = worldViewCenterX - newNodeDimension / 2;
          newNodeY = worldViewCenterY - newNodeDimension / 2;
        }
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
      
      const updatedNodes = [...currentNodesForCreation, newNodeToAdd];
      setNodes(updatedNodes);
      await saveNodesToFile(updatedNodes);

      setNewNodeName(""); setNewNodeDescription(""); setNewNodeTags(""); setNewNodeType('category'); setNewNodeBirthday("");
      setIsCreateNodeDialogOpen(false);
    }
  };

  const saveNodeChanges = async () => {
    if (editingNode && editNodeName) {
      const tagsArray = editNodeTags.split(',').map(tag => tag.trim()).filter(tag => tag);
      let provisionallyUpdatedNodes = nodes.map(n =>
        n.id === editingNode.id
        ? { ...n, name: editNodeName, description: editNodeDescription, tags: tagsArray, birthday: editingNode.type === 'entity' ? editNodeBirthday : undefined }
        : n
      );

      const editedNodeIsMain = tagsArray.includes("Main");
      if (editedNodeIsMain) {
        provisionallyUpdatedNodes = provisionallyUpdatedNodes.map(n => {
          if (n.id !== editingNode.id && n.tags.includes("Main")) {
            return { ...n, tags: n.tags.filter(t => t !== "Main") };
          }
          return n;
        });
      }
      
      setNodes(provisionallyUpdatedNodes);
      await saveNodesToFile(provisionallyUpdatedNodes);
      setEditingNode(null);
      setIsEditNodeDialogOpen(false);
    }
  };

  const deleteNode = async () => {
    if (!editingNode) return;
    const nodeIdToDelete = editingNode.id;
    const updatedNodes = nodes.filter(node => node.id !== nodeIdToDelete);
    setNodes(updatedNodes);
    await saveNodesToFile(updatedNodes);
    const updatedEdges = edges.filter(edge => edge.sourceNodeId !== nodeIdToDelete && edge.targetNodeId !== nodeIdToDelete);
    setEdges(updatedEdges);
    await saveEdgesToFile(updatedEdges);
    setEditingNode(null);
    setIsEditNodeDialogOpen(false);
  };

  const createEdge = async () => {
    if (newEdgeDataSourceNodeId && newEdgeDataTargetNodeId) {
      const parsedTags = parseTagsWithDates(newEdgeTagsInput);
      const newEdgeToAdd: Edge = {
        id: crypto.randomUUID(),
        sourceNodeId: newEdgeDataSourceNodeId,
        targetNodeId: newEdgeDataTargetNodeId,
        tags: parsedTags,
      };
      const updatedEdges = [...edges, newEdgeToAdd];
      setEdges(updatedEdges);
      await saveEdgesToFile(updatedEdges);
      setIsCreateEdgeDialogOpen(false);
      setNewEdgeDataSourceNodeId(null);
      setNewEdgeDataTargetNodeId(null);
      setNewEdgeTagsInput("");
    }
  };

  const saveEdgeChanges = async () => {
    if (editingEdge) {
      const updatedTags = parseTagsWithDates(editEdgeTagsInput);
      const updatedEdges = edges.map(edge =>
        edge.id === editingEdge.id ? { ...edge, tags: updatedTags } : edge
      );
      setEdges(updatedEdges);
      await saveEdgesToFile(updatedEdges);
      setEditingEdge(null);
      setIsEditEdgeDialogOpen(false);
    }
  };

  const deleteEdge = async () => {
    if (editingEdge) {
      const updatedEdges = edges.filter(edge => edge.id !== editingEdge.id);
      setEdges(updatedEdges);
      await saveEdgesToFile(updatedEdges);
      setEditingEdge(null);
      setIsEditEdgeDialogOpen(false);
    }
  };

  const handleCanvasInteractionStart = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    const targetElement = event.target as HTMLElement;

    const isDirectlyOnContainer = containerRef.current === targetElement;
    const isDirectlyOnTransformedContent = transformedContentRef.current === targetElement;

    if (!isDirectlyOnContainer && !isDirectlyOnTransformedContent) return;
    
    if (event.type.startsWith('touch') && event.cancelable) event.preventDefault();

    clearNodeInteractionStates(); // From useNodeInteractions

    if (event.type.startsWith('touch')) {
        const touchEvent = event as React.TouchEvent;
        if (touchEvent.touches.length === 2) {
            clearNodeInteractionStates(); // Ensure node interactions are cleared before pinch
            setInteractionMode('pinchZooming');
            const initialDistance = getDistance(touchEvent.touches);
            const screenMid = getMidpoint(touchEvent.touches);
            setPinchStartData({
                initialPinchDistance: initialDistance,
                initialScale: viewport.scale,
                pinchMidpointScreen: screenMid, 
            });
            setPanStartCoords(null);
            setQuickPressStartInfo(null);
            return;
        }
    }
     
    const point = 'touches' in event ? (event as React.TouchEvent).touches[0] : (event as React.MouseEvent);
    const screenCoords = { x: point.clientX, y: point.clientY };
    const worldCoords = viewport.screenToWorld(point.clientX, point.clientY);

    setInteractionMode('backgroundQuickPressCandidate');
    setPanStartCoords(screenCoords); 
    setQuickPressStartInfo({ 
      screenX: screenCoords.x, 
      screenY: screenCoords.y, 
      worldX: worldCoords.x, 
      worldY: worldCoords.y, 
      time: Date.now() 
    });
    setPinchStartData(null); 
  }, [viewport.screenToWorld, viewport.scale, clearNodeInteractionStates, setInteractionMode, setPanStartCoords, setQuickPressStartInfo, setPinchStartData]);


  useEffect(() => {
    const currentContainerRef = containerRef.current;

    const handleMove = (event: MouseEvent | TouchEvent) => {
      if (interactionMode === 'pinchZooming' && pinchStartData && 'touches' in event && (event as TouchEvent).touches.length === 2) {
          if (event.cancelable) event.preventDefault();
          const touches = (event as TouchEvent).touches;
          const currentDistance = getDistance(touches);
          const currentScreenMidpoint = getMidpoint(touches); 
          
          const scaleFactor = currentDistance / pinchStartData.initialPinchDistance;
          let newScale = pinchStartData.initialScale * scaleFactor;
          viewport.setViewportScale(newScale, currentScreenMidpoint); 
          return; 
      } else if (interactionMode === 'nodeInteractionDuringLayoutLock' && activeInteractionNodeIdFromHook && panStartCoords ) {
          if (event.type.startsWith('touch') && event.cancelable) event.preventDefault();
          const point = 'touches' in event ? event.touches[0] : event;
          if (!point) return;
          const screenDx = point.clientX - panStartCoords.x;
          const screenDy = point.clientY - panStartCoords.y;
          if (Math.abs(screenDx) > DRAG_MOVE_THRESHOLD || Math.abs(screenDy) > DRAG_MOVE_THRESHOLD) {
            setInteractionMode('backgroundPanning');
          }
      } else if (activeInteractionNodeIdFromHook) { 
        handleNodeMove(event, viewport.scale);
      } else if (interactionMode === 'backgroundQuickPressCandidate' && quickPressStartInfo) {
        const point = 'touches' in event ? (event as TouchEvent).touches[0] : (event as MouseEvent);
        if (!point) return;
        const currentX = point.clientX;
        const currentY = point.clientY;
        if (Math.abs(currentX - quickPressStartInfo.screenX) > DRAG_MOVE_THRESHOLD || Math.abs(currentY - quickPressStartInfo.screenY) > DRAG_MOVE_THRESHOLD) {
          setInteractionMode('backgroundPanning'); 
        }
      } else if (interactionMode === 'backgroundPanning' && panStartCoords) {
        if (event.type.startsWith('touch') && event.cancelable) event.preventDefault();
        const point = 'touches' in event ? (event as TouchEvent).touches[0] : (event as MouseEvent);
        if (!point) return;
        const dx = point.clientX - panStartCoords.x;
        const dy = point.clientY - panStartCoords.y;
        viewport.setViewportOffset(viewport.offsetX + dx, viewport.offsetY + dy);
        setPanStartCoords({ x: point.clientX, y: point.clientY }); 
      }
    };

    const handleEnd = async (event: MouseEvent | TouchEvent) => {
      if (interactionMode === 'pinchZooming') {
        if ('touches' in event && (event as TouchEvent).touches.length < 2) { 
            setInteractionMode('none');
            setPinchStartData(null);
        }
      } else if (interactionMode === 'nodeInteractionDuringLayoutLock' && activeInteractionNodeIdFromHook) {
          // If the node drag during layout lock didn't transition to panning, it means it was a click.
          const nodeToEdit = nodes.find(n => n.id === activeInteractionNodeIdFromHook);
          if (nodeToEdit) openEditNodeDialog(nodeToEdit); // This was missing previously
          setInteractionMode('none');
          clearNodeInteractionStates(); 
          setPanStartCoords(null);
      } else if (activeInteractionNodeIdFromHook) { 
        await handleNodeEnd(event, viewport.scale);
      } else if (interactionMode === 'backgroundQuickPressCandidate' && quickPressStartInfo) {
        const point = 'changedTouches' in event ? (event as TouchEvent).changedTouches[0] : (event as MouseEvent);
        if (!point) {
            setInteractionMode('none'); setQuickPressStartInfo(null); setPanStartCoords(null); return;
        }
        const releaseTime = Date.now();
        const duration = releaseTime - quickPressStartInfo.time;
        const screenDistanceMoved = Math.sqrt( Math.pow(point.clientX - quickPressStartInfo.screenX, 2) + Math.pow(point.clientY - quickPressStartInfo.screenY, 2) );

        if (duration < QUICK_PRESS_DURATION_THRESHOLD && screenDistanceMoved < DRAG_MOVE_THRESHOLD && !isLayoutLocked && !isFocusModeActive) {
            setPendingNodeCreationCoords({ x: quickPressStartInfo.worldX, y: quickPressStartInfo.worldY });
            setIsCreateNodeDialogOpen(true);
        }
        setInteractionMode('none'); // Reset after check
        setQuickPressStartInfo(null); 
      }
      
      if (interactionMode !== 'none' && interactionMode !== 'pinchZooming' && !(interactionMode === 'nodeInteractionDuringLayoutLock' && activeInteractionNodeIdFromHook)) { 
          if(interactionMode !== 'nodeInteractionDuringLayoutLock') setInteractionMode('none');
      }
      if(interactionMode !== 'nodeInteractionDuringLayoutLock') setPanStartCoords(null); 
    };

    if (currentContainerRef) {
      currentContainerRef.addEventListener('mousedown', handleCanvasInteractionStart as unknown as EventListener);
      currentContainerRef.addEventListener('touchstart', handleCanvasInteractionStart as unknown as EventListener, { passive: false });
    }
    
    const isAnyInteractionPotentiallyActive = activeInteractionNodeIdFromHook || interactionMode !== 'none';
    if (isAnyInteractionPotentiallyActive) {
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleEnd);
      window.addEventListener('touchmove', handleMove, { passive: false });
      window.addEventListener('touchend', handleEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
      if (currentContainerRef) {
        currentContainerRef.removeEventListener('mousedown', handleCanvasInteractionStart as unknown as EventListener);
        currentContainerRef.removeEventListener('touchstart', handleCanvasInteractionStart as unknown as EventListener);
      }
    };
  }, [
      activeInteractionNodeIdFromHook, interactionMode, panStartCoords, quickPressStartInfo, handleCanvasInteractionStart, pinchStartData,
      viewport.scale, viewport.offsetX, viewport.offsetY, // from viewport manager
      isLayoutLocked, isFocusModeActive,
      handleNodeMove, handleNodeEnd, openEditNodeDialog, setIsCreateNodeDialogOpen, setPendingNodeCreationCoords,
      clearNodeInteractionStates, setInteractionMode, setPanStartCoords, setQuickPressStartInfo, setPinchStartData, 
      nodes 
  ]);

  const applyRepulsion = useCallback((currentNodes: Node[], fixedNodeId: string | null): Node[] => {
    if (currentNodes.length < 2 || viewport.containerWidth === 0 || isLayoutLocked) return currentNodes; // Paused if layout is locked
    let newNodes = currentNodes.map(n => ({ ...n })); 
    for (let iter = 0; iter < REPULSION_ITERATIONS; iter++) {
      let systemMoved = false;
      for (let i = 0; i < newNodes.length; i++) {
        for (let j = i + 1; j < newNodes.length; j++) {
          const nodeA = newNodes[i];
          const nodeB = newNodes[j];
           if (fixedNodeId && (nodeA.id === fixedNodeId || nodeB.id === fixedNodeId)) continue; 
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
          if (distanceSquared < targetSeparationSquared && distanceSquared > 0.001) { 
            const distance = Math.sqrt(distanceSquared);
            const overlap = targetSeparation - distance;
            const forceMagnitude = overlap * REPULSION_STRENGTH; 
            const normDx = dx / distance;
            const normDy = dy / distance;
            let moveAx = -normDx * forceMagnitude / 2;
            let moveAy = -normDy * forceMagnitude / 2;
            let moveBx = normDx * forceMagnitude / 2;
            let moveBy = normDy * forceMagnitude / 2;
            const prevXA = nodeA.x; const prevYA = nodeA.y;
            nodeA.x += moveAx; nodeA.y += moveAy;
            if (Math.abs(nodeA.x - prevXA) > 0.01 || Math.abs(nodeA.y - prevYA) > 0.01) systemMoved = true;
            const prevXB = nodeB.x; const prevYB = nodeB.y;
            nodeB.x += moveBx; nodeB.y += moveBy;
            if (Math.abs(nodeB.x - prevXB) > 0.01 || Math.abs(nodeB.y - prevYB) > 0.01) systemMoved = true;
          }
        }
      }
      if (!systemMoved && iter > 0) break; 
    }
    return newNodes;
  }, [getNodeDimension, viewport.containerWidth, isLayoutLocked]); // Added isLayoutLocked dependency


  useEffect(() => { 
    if (isLayoutLocked || nodes.length < 2 || viewport.containerWidth === 0 || activeInteractionNodeIdFromHook || interactionMode !== 'none') return; 
    const repulsedNodes = applyRepulsion(nodes, null); 
    let changed = false;
    if (nodes.length === repulsedNodes.length) { 
        for (let i = 0; i < nodes.length; i++) {
            if (Math.abs(nodes[i].x - repulsedNodes[i].x) > 0.1 || Math.abs(nodes[i].y - repulsedNodes[i].y) > 0.1) {
                changed = true; break;
            }
        }
    } else { changed = true; } 
    if (changed) {
      const timeoutId = setTimeout(async () => {
        setNodes(repulsedNodes);
        await saveNodesToFile(repulsedNodes);
      }, 50); 
      return () => clearTimeout(timeoutId);
    }
  }, [nodes, activeInteractionNodeIdFromHook, applyRepulsion, viewport.containerWidth, interactionMode, setNodes, isLayoutLocked]); // Added isLayoutLocked

  useEffect(() => { 
    if (isLayoutLocked || nodes.length < 2 || viewport.containerWidth === 0 || !activeInteractionNodeIdFromHook || interactionMode !== 'none') return; 
    const repulsedNodes = applyRepulsion(nodes, activeInteractionNodeIdFromHook); 
    let changed = false;
    for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].id === activeInteractionNodeIdFromHook) continue; 
        const rn = repulsedNodes.find(r => r.id === nodes[i].id);
        if (rn && (Math.abs(nodes[i].x - rn.x) > 0.1 || Math.abs(nodes[i].y - rn.y) > 0.1)) {
            changed = true; break;
        }
    }
    if (changed) {
      const timeoutId = setTimeout(async () => {
        const finalUpdatedNodes = nodes.map(cn => {
            if (cn.id === activeInteractionNodeIdFromHook) return cn; 
            const rn = repulsedNodes.find(r => r.id === cn.id);
            return rn || cn; 
        });
        setNodes(finalUpdatedNodes);
        await saveNodesToFile(finalUpdatedNodes);
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [nodes, activeInteractionNodeIdFromHook, applyRepulsion, viewport.containerWidth, interactionMode, setNodes, isLayoutLocked]); // Added isLayoutLocked


  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  const screenGridData = useMemo(() => {
    if (!isClient || viewport.containerWidth === 0 || viewport.containerHeight === 0 || viewport.scale === 0 || !isFinite(viewport.scale)) {
      return { verticalLines: [], horizontalLines: [] };
    }
    return calculateScreenGridLinePositions(viewport.offsetX, viewport.offsetY, viewport.scale, viewport.containerWidth, viewport.containerHeight);
  }, [isClient, viewport.offsetX, viewport.offsetY, viewport.scale, viewport.containerWidth, viewport.containerHeight]);
  
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') {
          toast({ title: "Error", description: "Error reading file content.", variant: "destructive" });
          return;
        }
        const data = JSON.parse(text);
        if (data && Array.isArray(data.nodes) && Array.isArray(data.edges)) {
          const areNodesValid = data.nodes.every((n: any) => 
            typeof n.id === 'string' && typeof n.name === 'string' && typeof n.x === 'number' && typeof n.y === 'number' && Array.isArray(n.tags) && (n.type === 'category' || n.type === 'entity')
          );
          const areEdgesValid = data.edges.every((edge: any) => 
            typeof edge.id === 'string' && typeof edge.sourceNodeId === 'string' && typeof edge.targetNodeId === 'string' && Array.isArray(edge.tags) && edge.tags.every((tag: any) => typeof tag.name === 'string') 
          );
          if (!areNodesValid || !areEdgesValid) {
            toast({ title: "Error", description: "Uploaded file has invalid node or edge structure.", variant: "destructive" });
            return;
          }
          setInitialLoadAndCenteringComplete(false); 
          setNodes(data.nodes as Node[]);
          setEdges(data.edges as Edge[]);
          await saveNodesToFile(data.nodes as Node[]);
          await saveEdgesToFile(data.edges as Edge[]);
          toast({ title: "Success", description: "Data uploaded and saved successfully!"});
          loadInitialData();
        } else {
          toast({ title: "Error", description: "Invalid file format. Expected JSON with 'nodes' and 'edges' arrays.", variant: "destructive" });
        }
      } catch (error) {
        console.error("Error processing uploaded file:", error);
        toast({ title: "Error", description: "Error processing uploaded file. Check console for details.", variant: "destructive" });
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  const worldStrokeWidth = useMemo(() => {
    return (EDGE_BASE_SCREEN_THICKNESS * (1 + Math.min(viewport.scale, 1)) / 2) / Math.max(viewport.scale, 0.001);
  }, [viewport.scale]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]); return;
    }
    const lowerCaseQuery = searchQuery.toLowerCase();
    const nameMatches: Node[] = [];
    const tagMatches: Node[] = [];
    nodes.forEach(node => {
      if (node.name.toLowerCase().includes(lowerCaseQuery)) {
        nameMatches.push(node);
      } else if (node.tags.some(tag => tag.toLowerCase().includes(lowerCaseQuery))) {
        if (!nameMatches.find(nm => nm.id === node.id)) tagMatches.push(node);
      }
    });
    setSearchResults([...nameMatches, ...tagMatches]);
  }, [searchQuery, nodes]);

  const handleSearchResultClick = (node: Node) => {
    setIsSearchDialogOpen(false);
    setSearchQuery(""); 
    const nodeDimension = getNodeDimension(node.type);
    const targetOffsetX = Math.round((viewport.containerWidth / 2) - (node.x + nodeDimension / 2) * 1.0); 
    const targetOffsetY = Math.round((viewport.containerHeight / 2) - (node.y + nodeDimension / 2) * 1.0); 
    viewport.setViewportOffset(targetOffsetX, targetOffsetY);
    viewport.setViewportScale(1.0); 
  };
  
  const isCreateNodeButtonDisabled = !newNodeName.trim() || nodes.some(node => node.name.toLowerCase() === newNodeName.trim().toLowerCase());
  const isEditNodeButtonDisabled = editingNode && (!editNodeName.trim() || nodes.some(node => node.id !== editingNode?.id && node.name.toLowerCase() === editNodeName.trim().toLowerCase()));

  useEffect(() => {
    if (!editingNode || !connectNodeSearchQuery.trim()) {
      setConnectNodeSearchResults([]); return;
    }
    const lowerCaseQuery = connectNodeSearchQuery.toLowerCase();
    const filtered = nodes.filter(node =>
      node.id !== editingNode.id && (node.name.toLowerCase().includes(lowerCaseQuery) || node.tags.some(tag => tag.toLowerCase().includes(lowerCaseQuery)))
    );
    setConnectNodeSearchResults(filtered);
  }, [connectNodeSearchQuery, nodes, editingNode]);

  const handleConnectNodeSelect = (targetNode: Node) => {
    if (!editingNode) return;
    const existingEdge = findExistingEdge(editingNode.id, targetNode.id);
    if (existingEdge) openEditEdgeDialog(existingEdge);
    else openCreateEdgeDialog(editingNode.id, targetNode.id);
    setConnectNodeSearchQuery("");
    setConnectNodeSearchResults([]);
    setIsEditNodeDialogOpen(false); 
  };

  const nodesToRender = useMemo(() => {
      if (!isClient) return [];
      return isFocusModeActive ? nodes.filter(n => focusModeVisibleNodeIds.has(n.id)) : nodes;
  }, [isClient, isFocusModeActive, nodes, focusModeVisibleNodeIds]);

  const edgesToRender = useMemo(() => {
      if (!isClient) return [];
      return isFocusModeActive ? edges.filter(edge => focusModeVisibleNodeIds.has(edge.sourceNodeId) && focusModeVisibleNodeIds.has(edge.targetNodeId)) : edges;
  }, [isClient, isFocusModeActive, edges, focusModeVisibleNodeIds]);


  const getDistance = (touches: TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getMidpoint = (touches: TouchList) => {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    };
  };

  return (
    <main className="flex flex-col items-center h-screen bg-background text-foreground overflow-hidden"> 
      <Toaster />
      <h1 className="text-3xl font-bold tracking-tight my-4 text-center">Node Weaver</h1>

      <div
        ref={containerRef}
        className="relative w-full max-w-3xl border rounded-lg shadow-inner bg-card touch-none overflow-hidden flex-grow" 
      >
        <Button
          variant="ghost" size="icon"
          className="absolute top-2 left-2 z-50 bg-card/80 backdrop-blur-sm text-foreground hover:bg-accent hover:text-accent-foreground"
          onClick={(e) => { (e.currentTarget as HTMLButtonElement).blur(); setIsSliderPanelOpen(!isSliderPanelOpen);}}
          aria-label={isSliderPanelOpen ? "Close controls panel" : "Open controls panel"}
        >
          {isSliderPanelOpen ? <XIcon className="h-5 w-5" /> : <Settings className="h-5 w-5" />}
        </Button>

        <div
          className={cn(
            "absolute top-0 left-0 right-0 z-40 bg-card/90 backdrop-blur-md p-4 pt-14 space-y-3 rounded-b-lg shadow-lg transition-all duration-300 ease-in-out",
            isSliderPanelOpen ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none"
          )}
          onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} 
        >
          <div className="w-full grid grid-cols-4 gap-2 items-center px-1">
              <Label htmlFor="scale-slider" className="text-sm text-right col-span-1">Zoom: {isClient ? Math.round(viewport.scale * 100) : 100}%</Label>
              <Slider
                  id="scale-slider"
                  min={viewport.LINEAR_SLIDER_MIN} max={viewport.LINEAR_SLIDER_MAX} step={1} 
                  value={[isClient ? Math.round(viewport.linearScaleValue) : 50]} 
                  onValueChange={(value) => viewport.handleScaleSliderChange(value[0])}
                  className="col-span-3"
              />
          </div>
          <div className="w-full grid grid-cols-4 gap-2 items-center px-1">
              <Label htmlFor="offset-x-slider" className="text-sm text-right col-span-1">Pan X: {isClient ? Math.round(viewport.offsetX) : 0}</Label>
              <Slider
                  id="offset-x-slider"
                  min={isClient && viewport.containerWidth > 0 ? Math.round(viewport.panXSliderLimits.min) : -1000}
                  max={isClient && viewport.containerWidth > 0 ? Math.round(viewport.panXSliderLimits.max) : 1000}
                  step={1} value={[isClient ? Math.round(viewport.offsetX) : 0]} 
                  onValueChange={(value) => viewport.handlePanXSliderChange(value[0])}
                  className="col-span-3"
                  disabled={!isClient || viewport.containerWidth === 0 || (viewport.panXSliderLimits.min >= viewport.panXSliderLimits.max)}
              />
          </div>
           <div className="w-full grid grid-cols-4 gap-2 items-center px-1">
              <Label htmlFor="offset-y-slider" className="text-sm text-right col-span-1">Pan Y: {isClient ? Math.round(viewport.offsetY) : 0}</Label>
              <Slider
                  id="offset-y-slider"
                  min={isClient && viewport.containerHeight > 0 ? Math.round(viewport.panYSliderLimits.min) : -1000}
                  max={isClient && viewport.containerHeight > 0 ? Math.round(viewport.panYSliderLimits.max) : 1000}
                  step={1} value={[isClient ? Math.round(viewport.offsetY) : 0]} 
                  onValueChange={(value) => viewport.handlePanYSliderChange(value[0])}
                  className="col-span-3"
                  disabled={!isClient || viewport.containerHeight === 0 || (viewport.panYSliderLimits.min >= viewport.panYSliderLimits.max)}
              />
          </div>
          <Separator />
            <div className="flex items-center space-x-2 px-1">
                <Switch id="layout-lock-switch" checked={isLayoutLocked} onCheckedChange={setIsLayoutLocked} disabled={isFocusModeActive} />
                <Label htmlFor="layout-lock-switch" className={cn("text-sm flex items-center", isFocusModeActive && "opacity-50")}>
                    {isLayoutLocked ? <Lock className="mr-2 h-4 w-4" /> : <Unlock className="mr-2 h-4 w-4" />} Layout Lock
                </Label>
            </div>
            <div className="flex items-center space-x-2 px-1">
                <Switch id="focus-mode-switch" checked={isFocusModeActive} onCheckedChange={() => handleToggleFocusMode()} />
                <Label htmlFor="focus-mode-switch" className="text-sm flex items-center">
                    {isFocusModeActive ? <Eye className="mr-2 h-4 w-4" /> : <EyeOff className="mr-2 h-4 w-4" />} Focus Mode
                </Label>
            </div>
        </div>

        <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-0" aria-hidden="true" >
          {isClient && screenGridData.verticalLines.map((lineX, index) => (
            <line key={`v-screen-${index}-${lineX}`} x1={lineX} y1={0} x2={lineX} y2={viewport.containerHeight} stroke="hsl(var(--border))" strokeWidth={0.5} opacity="0.3" />
          ))}
          {isClient && screenGridData.horizontalLines.map((lineY, index) => (
            <line key={`h-screen-${index}-${lineY}`} x1={0} y1={lineY} x2={viewport.containerWidth} y2={lineY} stroke="hsl(var(--border))" strokeWidth={0.5} opacity="0.3" />
          ))}
        </svg>
        
        <div
          ref={transformedContentRef}
          style={{ width: '100%', height: '100%', transform: `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.scale})`, transformOrigin: '0 0', willChange: 'transform', zIndex: 2 }}
        >
          <svg className="absolute top-0 left-0 w-full h-full pointer-events-none" overflow="visible" >
            {edgesToRender.map(edge => {
              const sourceNode = nodes.find(n => n.id === edge.sourceNodeId);
              const targetNode = nodes.find(n => n.id === edge.targetNodeId);
              if (!sourceNode || !targetNode) return null;
              const sourceDim = getNodeDimension(sourceNode);
              const targetDim = getNodeDimension(targetNode);
              return (
                <line
                  key={edge.id}
                  x1={sourceNode.x + sourceDim / 2} y1={sourceNode.y + sourceDim / 2}
                  x2={targetNode.x + targetDim / 2} y2={targetNode.y + targetDim / 2}
                  stroke="hsl(var(--ring))" strokeWidth={worldStrokeWidth} opacity="0.6"
                />
              );
            })}
            {linkingLinePreview && (
              <line
                x1={linkingLinePreview.x1} y1={linkingLinePreview.y1}
                x2={linkingLinePreview.x2} y2={linkingLinePreview.y2}
                stroke="hsl(var(--primary))" strokeWidth={worldStrokeWidth} 
                strokeDasharray={`${5/Math.max(viewport.scale, 0.001)},${5/Math.max(viewport.scale, 0.001)}`} 
              />
            )}
          </svg>

          {nodesToRender.map((node) => {
            const nodeDimension = getNodeDimension(node);
            const nodeStyles: React.CSSProperties = {
              position: 'absolute', left: `${node.x}px`, top: `${node.y}px`,
              width: `${nodeDimension}px`, height: `${nodeDimension}px`,
              backgroundColor: "hsl(var(--node-color))", color: "hsl(var(--card-foreground))",     
              zIndex: activeInteractionNodeIdFromHook === node.id ? 20 : (isLinkingModeActive && linkingLinePreview?.x1 === (node.x + nodeDimension/2) ? 15 : 10),
              borderRadius: '9999px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              textAlign: 'center', cursor: 'pointer', boxShadow: '0 4px 6px hsla(var(--foreground), 0.1)', 
              transition: 'box-shadow 0.2s ease', userSelect: 'none', border: '1px solid hsl(var(--border))' 
            };
            if (node.type === 'entity') { 
              nodeStyles.borderColor = 'hsl(var(--ring))'; nodeStyles.borderWidth = '2px';
            }
            if (activeInteractionNodeIdFromHook === node.id) {
               nodeStyles.boxShadow = '0 10px 15px hsla(var(--foreground), 0.2), 0 0 0 3px hsl(var(--primary))';
            }
            
            const minFontSizeForNodeText = 6; 
            const baseNameFontSize = 16; 
            const baseTagFontSize = 10;  
            const dynamicNameFontSizeScreen = Math.max(minFontSizeForNodeText, baseNameFontSize * Math.min(viewport.scale, 1)); 
            const dynamicTagFontSizeScreen = Math.max(minFontSizeForNodeText, baseTagFontSize * Math.min(viewport.scale, 1));
            const finalNameFontSize = dynamicNameFontSizeScreen / Math.max(viewport.scale, 0.001);
            const finalTagFontSize = dynamicTagFontSizeScreen / Math.max(viewport.scale, 0.001);

            return (
              <div
                key={node.id}
                className={`p-3 flex flex-col items-center justify-center text-center cursor-pointer shadow-xl transition-all duration-200 hover:shadow-2xl select-none`}
                style={nodeStyles}
                onMouseDown={(e) => { 
                  if (interactionMode === 'nodeInteractionDuringLayoutLock' && activeInteractionNodeIdFromHook === node.id) return; 
                  if (activeInteractionNodeIdFromHook && activeInteractionNodeIdFromHook !== node.id) return; 
                  handleNodeInteractionStart(e, node); 
                }}
                onTouchStart={(e) => { 
                  if (interactionMode === 'nodeInteractionDuringLayoutLock' && activeInteractionNodeIdFromHook === node.id) return; 
                  if (activeInteractionNodeIdFromHook && activeInteractionNodeIdFromHook !== node.id) return; 
                  handleNodeInteractionStart(e, node); 
                }}
                title={`Interact with ${node.name}`}
              >
                <h2 className="text-md font-semibold truncate w-full" style={{ fontSize: `${finalNameFontSize}px`, lineHeight: '1.2' }}>{node.name}</h2>
                {node.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap justify-center gap-1 overflow-hidden max-h-[3em]"> 
                    {node.tags.slice(0, 2).map(tag => ( 
                      <span key={tag} className="text-xs bg-black/20 text-white px-2 py-0.5 rounded-full" style={{ fontSize: `${finalTagFontSize}px`, lineHeight: '1.2' }}>{tag}</span>
                    ))}
                  </div>
                )}
                {node.tags.length > 2 && ( <span className="text-xs mt-0.5 opacity-70" style={{ fontSize: `${finalTagFontSize}px`, lineHeight: '1.2' }}>+{node.tags.length - 2} more</span> )}
              </div>
            );
          })}
        </div>

        <Button
          variant="ghost" size="icon"
          className="absolute bottom-2 right-2 z-50 bg-card/80 backdrop-blur-sm text-foreground hover:bg-accent hover:text-accent-foreground rounded-full w-12 h-12 shadow-lg"
          onClick={(e) => { (e.currentTarget as HTMLButtonElement).blur(); setIsActionButtonsOpen(!isActionButtonsOpen);}}
          aria-label={isActionButtonsOpen ? "Close actions menu" : "Open actions menu"}
        >
          {isActionButtonsOpen ? <XIcon className="h-6 w-6" /> : <Rows3 className="h-6 w-6" />}
        </Button>

        <div
          className={cn("absolute bottom-16 right-2 z-40 flex flex-col items-end space-y-2 transition-all duration-300 ease-in-out", isActionButtonsOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none")}
          onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} 
        >
          <Dialog open={isCreateNodeDialogOpen} onOpenChange={(isOpen) => { setIsCreateNodeDialogOpen(isOpen); if (!isOpen) if (pendingNodeCreationCoords) setPendingNodeCreationCoords(null); }}>
            <DialogTrigger asChild>
              <Button 
                className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg w-full justify-start px-4 py-2"
                disabled={isCreateNodeButtonDisabled || isLayoutLocked || isFocusModeActive}
                title={ isLayoutLocked || isFocusModeActive ? "Node creation disabled while Layout Lock or Focus Mode is active" : (isCreateNodeButtonDisabled ? "Node name must be unique and not empty" : "Create New Node")}
              ><Plus className="mr-2 h-5 w-5" />Create Node</Button>
            </DialogTrigger>
          </Dialog>
           <Dialog open={isSearchDialogOpen} onOpenChange={(isOpen) => { setIsSearchDialogOpen(isOpen); if (!isOpen) { setSearchQuery(""); setSearchResults([]); } }}>
            <DialogTrigger asChild>
              <Button variant="outline" className="bg-card hover:bg-accent shadow-lg w-full justify-start px-4 py-2">
                <SearchIconLucide className="mr-2 h-5 w-5" />Search Nodes
              </Button>
            </DialogTrigger>
          </Dialog>
          <Button onClick={loadInitialData} variant="outline" className="bg-card hover:bg-accent shadow-lg w-full justify-start px-4 py-2">
              <Download className="mr-2 h-5 w-5 transform rotate-180" />Load Data
          </Button>
           <Button asChild variant="outline" className="bg-card hover:bg-accent shadow-lg w-full justify-start px-4 py-2">
            <a href="/api/download-all-data" download="node_weaver_data.json"><Download className="mr-2 h-5 w-5" />Download Data</a>
          </Button>
          <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="bg-card hover:bg-accent shadow-lg w-full justify-start px-4 py-2">
            <Upload className="mr-2 h-5 w-5" />Upload Data
          </Button>
        </div>
         <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".json" className="hidden" />
      </div> 
      
      <Dialog open={isCreateNodeDialogOpen} onOpenChange={(isOpen) => { setIsCreateNodeDialogOpen(isOpen); if (!isOpen) if (pendingNodeCreationCoords) setPendingNodeCreationCoords(null); }} >
        <DialogContent className="sm:max-w-[480px] bg-background text-foreground border-border shadow-2xl rounded-lg">
          <DialogHeader> <DialogTitle className="text-2xl">Add New Node</DialogTitle> <DialogDescription>Define attributes for the new node. Click create when you're done.</DialogDescription> </DialogHeader>
          <div className="grid gap-6 py-6">
            <div className="grid gap-3"> <Label htmlFor="create-node-name" className="text-md">Name</Label> <Input id="create-node-name" placeholder="Node Name" value={newNodeName} onChange={(e) => setNewNodeName(e.target.value)} className="text-md p-3" /> </div>
            <div className="grid gap-3"> <Label className="text-md">Type</Label> <RadioGroup defaultValue="category" onValueChange={(value: 'category' | 'entity') => setNewNodeType(value)} value={newNodeType} className="flex space-x-4 pt-1"> <div className="flex items-center space-x-2"><RadioGroupItem value="category" id="type-category-create-node" /><Label htmlFor="type-category-create-node">Category</Label></div> <div className="flex items-center space-x-2"><RadioGroupItem value="entity" id="type-entity-create-node" /><Label htmlFor="type-entity-create-node">Entity</Label></div> </RadioGroup> </div>
            {newNodeType === 'entity' && ( <div className="grid gap-3"> <Label htmlFor="create-node-birthday" className="text-md">Birthday</Label> <Input id="create-node-birthday" type="date" value={newNodeBirthday} onChange={(e) => setNewNodeBirthday(e.target.value)} className="text-md p-3" /> </div> )}
            <div className="grid gap-3"> <Label htmlFor="create-node-description" className="text-md">Description</Label> <Input id="create-node-description" placeholder="Brief description" value={newNodeDescription} onChange={(e) => setNewNodeDescription(e.target.value)} className="text-md p-3" /> </div>
            <div className="grid gap-3"> <Label htmlFor="create-node-tags" className="text-md">Tags</Label> <Input id="create-node-tags" placeholder="tag1, tag2" value={newNodeTags} onChange={(e) => setNewNodeTags(e.target.value)} className="text-md p-3" /> </div>
          </div>
          <DialogFooter> <DialogClose asChild><Button variant="outline" className="text-md px-5 py-2.5">Cancel</Button></DialogClose>
            <Button type="submit" onClick={createNode} className="bg-primary text-primary-foreground hover:bg-primary/90 text-md px-5 py-2.5" disabled={isCreateNodeButtonDisabled || isLayoutLocked || isFocusModeActive} title={ isLayoutLocked || isFocusModeActive ? "Node creation disabled while Layout Lock or Focus Mode is active" : (isCreateNodeButtonDisabled ? "Node name must be unique and not empty" : "Create Node")} >Create Node</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editingNode && (
        <Dialog open={isEditNodeDialogOpen} onOpenChange={(isOpen) => { setIsEditNodeDialogOpen(isOpen); if (!isOpen) { setEditingNode(null); setConnectNodeSearchQuery(""); setConnectNodeSearchResults([]); } }}>
          <DialogContent className="sm:max-w-[480px] bg-background text-foreground border-border shadow-2xl rounded-lg">
          <ScrollArea className="max-h-[80vh] p-0"> <div className="p-6"> 
              <DialogHeader> <DialogTitle className="text-2xl">Edit Node: {editingNode.name}</DialogTitle> <DialogDescription>Modify attributes or connect to another node.</DialogDescription> </DialogHeader>
              <div className="grid gap-6 py-6">
                <div className="grid gap-3"> <Label htmlFor="edit-node-name" className="text-md">Name</Label> <Input id="edit-node-name" value={editNodeName} onChange={(e) => setEditNodeName(e.target.value)} className="text-md p-3" /> </div>
                <div className="grid gap-3"> <Label className="text-md">Type</Label> <p className="text-md p-3 bg-muted/50 rounded-md border border-input capitalize select-none">{editingNode?.type}</p> </div>
                {editingNode?.type === 'entity' && ( <div className="grid gap-3"> <Label htmlFor="edit-node-birthday" className="text-md">Birthday</Label> <Input id="edit-node-birthday" type="date" value={editNodeBirthday} onChange={(e) => setEditNodeBirthday(e.target.value)} className="text-md p-3" /> </div> )}
                <div className="grid gap-3"> <Label htmlFor="edit-node-description" className="text-md">Description</Label> <Input id="edit-node-description" value={editNodeDescription} onChange={(e) => setEditNodeDescription(e.target.value)} className="text-md p-3" /> </div>
                <div className="grid gap-3"> <Label htmlFor="edit-node-tags" className="text-md">Tags</Label> <Input id="edit-node-tags" value={editNodeTags} onChange={(e) => setEditNodeTags(e.target.value)} placeholder="tag1, tag2" className="text-md p-3" /> </div>
                <Separator className="my-4" />
                <div className="grid gap-3">
                  <Label htmlFor="connect-node-search" className="text-md">Connect to Node</Label>
                  <Input id="connect-node-search" placeholder="Search node by name or tag..." value={connectNodeSearchQuery} onChange={(e) => setConnectNodeSearchQuery(e.target.value)} className="text-md p-3" disabled={isFocusModeActive || isLayoutLocked} title={isFocusModeActive || isLayoutLocked ? "Node connection disabled in Focus/Layout Lock mode" : ""} />
                  {connectNodeSearchQuery.trim() && connectNodeSearchResults.length > 0 && (
                    <ScrollArea className="h-[150px] w-full rounded-md border p-2 mt-2">
                      {connectNodeSearchResults.map(node => (
                        <div key={node.id} onClick={() => handleConnectNodeSelect(node)} className="p-2 hover:bg-accent rounded-md cursor-pointer text-sm" >
                          <p className="font-medium">{node.name}</p>
                          {node.tags.length > 0 && <p className="text-xs text-muted-foreground">{node.tags.join(', ')}</p>}
                        </div>
                      ))}
                    </ScrollArea>
                  )}
                   {connectNodeSearchQuery.trim() && connectNodeSearchResults.length === 0 && ( <p className="text-xs text-muted-foreground mt-2 text-center">No nodes found to connect.</p> )}
                </div>
              </div>
              <DialogFooter className="flex flex-col sm:flex-row justify-between items-center pt-2 sm:pt-0"> 
                <Button variant="destructive" onClick={deleteNode} className="text-md px-5 py-2.5 w-full sm:w-auto mb-2 sm:mb-0" disabled={isLayoutLocked || isFocusModeActive} title={isLayoutLocked || isFocusModeActive ? "Node deletion disabled while Layout Lock or Focus Mode is active" : "Delete Node"} > <Trash2 className="mr-2 h-5 w-5" /> Delete Node </Button>
                <div className="flex w-full sm:w-auto justify-end">
                  <DialogClose asChild> <Button variant="outline" onClick={() => { setIsEditNodeDialogOpen(false); setEditingNode(null); setConnectNodeSearchQuery(""); setConnectNodeSearchResults([]);}} className="text-md px-5 py-2.5 mr-2 w-1/2 sm:w-auto" >Cancel</Button> </DialogClose>
                  <Button type="submit" onClick={saveNodeChanges} className="bg-primary text-primary-foreground hover:bg-primary/90 text-md px-5 py-2.5 w-1/2 sm:w-auto" disabled={!!isEditNodeButtonDisabled || isLayoutLocked || isFocusModeActive} title={ isLayoutLocked || isFocusModeActive ? "Node editing disabled while Layout Lock or Focus Mode is active" : (isEditNodeButtonDisabled ? "Node name must be unique and not empty" : "Save Changes")} >Save Changes</Button>
                </div>
              </DialogFooter>
            </div> </ScrollArea>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={isCreateEdgeDialogOpen} onOpenChange={(isOpen) => { setIsCreateEdgeDialogOpen(isOpen); if (!isOpen) { setNewEdgeDataSourceNodeId(null); setNewEdgeDataTargetNodeId(null); } }}>
        <DialogContent className="sm:max-w-[480px] bg-background text-foreground border-border shadow-2xl rounded-lg">
          <DialogHeader> <DialogTitle className="text-2xl">Create New Edge</DialogTitle> <DialogDescription> Connecting '{nodes.find(n=>n.id===newEdgeDataSourceNodeId)?.name}' to '{nodes.find(n=>n.id===newEdgeDataTargetNodeId)?.name}'. Add details. </DialogDescription> </DialogHeader>
          <div className="grid gap-6 py-6"> <div className="grid gap-3"> <Label htmlFor="create-edge-tags" className="text-md">Tags</Label> <Textarea id="create-edge-tags" placeholder="tag1 (YYYY-MM-DD), tag2, tag3 (YYYY-MM-DD)" value={newEdgeTagsInput} onChange={(e) => setNewEdgeTagsInput(e.target.value)} className="text-md p-3 min-h-[80px]" /> <p className="text-xs text-muted-foreground">Separate tags with commas. Dates (YYYY-MM-DD) are optional per tag.</p> </div> </div>
          <DialogFooter> <DialogClose asChild><Button variant="outline" className="text-md px-5 py-2.5">Cancel</Button></DialogClose> <Button type="submit" onClick={createEdge} className="bg-primary text-primary-foreground hover:bg-primary/90 text-md px-5 py-2.5" disabled={isLayoutLocked || isFocusModeActive} title={isLayoutLocked || isFocusModeActive ? "Edge creation disabled while Layout Lock or Focus Mode is active" : "Create Edge"} ><Link2 className="mr-2 h-5 w-5" />Create Edge</Button> </DialogFooter>
        </DialogContent>
      </Dialog>

      {editingEdge && (
        <Dialog open={isEditEdgeDialogOpen} onOpenChange={(isOpen) => { setIsEditEdgeDialogOpen(isOpen); if (!isOpen) setEditingEdge(null); }}>
          <DialogContent className="sm:max-w-[480px] bg-background text-foreground border-border shadow-2xl rounded-lg">
            <DialogHeader> <DialogTitle className="text-2xl">Edit Edge</DialogTitle> <DialogDescription> Modifying connection between '{nodes.find(n => n.id === editingEdge.sourceNodeId)?.name}' and '{nodes.find(n => n.id === editingEdge.targetNodeId)?.name}'. </DialogDescription> </DialogHeader>
            <div className="grid gap-6 py-6"> <div className="grid gap-3"> <Label htmlFor="edit-edge-tags" className="text-md">Tags</Label> <Textarea id="edit-edge-tags" placeholder="tag1 (YYYY-MM-DD), tag2, tag3 (YYYY-MM-DD)" value={editEdgeTagsInput} onChange={(e) => setEditEdgeTagsInput(e.target.value)} className="text-md p-3 min-h-[80px]" /> <p className="text-xs text-muted-foreground">Separate tags with commas. Dates (YYYY-MM-DD) are optional per tag.</p> </div> </div>
            <DialogFooter className="flex flex-col sm:flex-row justify-between items-center pt-2 sm:pt-0"> 
              <Button variant="destructive" onClick={deleteEdge} className="text-md px-5 py-2.5 w-full sm:w-auto mb-2 sm:mb-0 mr-auto" disabled={isLayoutLocked || isFocusModeActive} title={isLayoutLocked || isFocusModeActive ? "Edge deletion disabled while Layout Lock or Focus Mode is active" : "Delete Edge"} > <Trash2 className="mr-2 h-5 w-5" /> Delete Edge </Button>
              <div className="flex w-full sm:w-auto justify-end">
                <DialogClose asChild> <Button variant="outline" className="text-md px-5 py-2.5 mr-2 w-1/2 sm:w-auto">Cancel</Button> </DialogClose>
                <Button type="submit" onClick={saveEdgeChanges} className="bg-primary text-primary-foreground hover:bg-primary/90 text-md px-5 py-2.5 w-1/2 sm:w-auto" disabled={isLayoutLocked || isFocusModeActive} title={isLayoutLocked || isFocusModeActive ? "Edge editing disabled while Layout Lock or Focus Mode is active" : "Save Changes"} >Save Changes</Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
       <Dialog open={isSearchDialogOpen} onOpenChange={(isOpen) => { setIsSearchDialogOpen(isOpen); if (!isOpen) { setSearchQuery(""); setSearchResults([]); } }} >
          <DialogContent className="sm:max-w-md bg-background text-foreground border-border shadow-2xl rounded-lg">
            <DialogHeader> <DialogTitle className="text-2xl">Search Nodes</DialogTitle> </DialogHeader>
            <div className="py-4"> <Input placeholder="Search by name or tag..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="text-md p-3" /> </div>
            {searchResults.length > 0 && (
              <ScrollArea className="h-[200px] w-full rounded-md border p-2">
                {searchResults.map(node => (
                  <div key={node.id} onClick={() => handleSearchResultClick(node)} className="p-2 hover:bg-accent rounded-md cursor-pointer" >
                    <p className="font-medium">{node.name}</p> <p className="text-xs text-muted-foreground"> {node.tags.join(', ') || "No tags"} </p>
                  </div>
                ))}
              </ScrollArea>
            )}
            {searchQuery.trim() && searchResults.length === 0 && ( <p className="text-muted-foreground text-center py-4">No nodes found.</p> )}
            <DialogFooter> <DialogClose asChild> <Button variant="outline" className="text-md px-5 py-2.5">Close</Button> </DialogClose> </DialogFooter>
          </DialogContent>
        </Dialog>
    </main>
  );
}

