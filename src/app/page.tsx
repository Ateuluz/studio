
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
import { Plus, Link2, Trash2, Download, Upload } from "lucide-react";
import type { Node, Edge, EdgeTag } from "@/lib/types";
import { loadNodesFromFile, saveNodesToFile, loadEdgesFromFile, saveEdgesToFile } from "./data-actions";


const CATEGORY_NODE_DIMENSION = 160;
const ENTITY_NODE_DIMENSION = 128;
const CONTAINER_HEIGHT_PX = 500; 

const PRESS_HOLD_THRESHOLD = 700; // ms
const DRAG_MOVE_THRESHOLD = 5; // pixels
const QUICK_PRESS_DURATION_THRESHOLD = 70; // ms 
const MAX_PLACEMENT_ATTEMPTS = 30;

const REPULSION_STRENGTH = 0.5;
const MIN_SEPARATION = 15; // world units
const REPULSION_ITERATIONS = 10;

const BASE_GRID_SIZE = 50; 

// Zoom Slider Constants
const LOG_SCALE_MIN = 0.04; // 4%
const LOG_SCALE_MAX = 1.2;  // 120%
const LINEAR_SLIDER_MIN = 0;
const LINEAR_SLIDER_MAX = 100;

// Helper functions for logarithmic scale conversion
function linearToLogScale(
  linearValue: number,
  linearMin: number,
  linearMax: number,
  logMin: number,
  logMax: number
): number {
  if (logMin <= 0 || logMax <= 0) {
    console.error("Logarithmic scale bounds must be positive.");
    return logMin; 
  }
  if (linearMin === linearMax) return logMin; // Avoid division by zero if range is 0
  if (logMin === logMax) return logMin; // Avoid Math.pow issues if log range is 0

  const G = logMax / logMin;
  const exponent = (linearValue - linearMin) / (linearMax - linearMin);
  return logMin * Math.pow(G, exponent);
}

function logToLinearScale(
  logValue: number,
  logMin: number,
  logMax: number,
  linearMin: number,
  linearMax: number
): number {
  if (logValue <= 0 || logMin <= 0 || logMax <= 0) {
    console.error("Logarithmic scale values must be positive.");
    return linearMin; 
  }
  
  // Clamp logValue to avoid issues with Math.log if it's outside the defined range
  const clampedLogValue = Math.max(logMin, Math.min(logMax, logValue));

  if (logMin === logMax) return linearMin; // If no log range, return min linear value

  const G = logMax / logMin;
  if (G === 1) return linearMin; // Avoid log(1) which is 0, and division by zero
  
  const logRatio = clampedLogValue / logMin;
  if (logRatio <= 0) return linearMin; // Avoid Math.log of non-positive

  return linearMin + (linearMax - linearMin) * (Math.log(logRatio) / Math.log(G));
}


// Helper functions for grid (defined outside component for stability if they don't depend on component state/props)
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

type InteractionMode = 'none' | 'backgroundQuickPressCandidate' | 'backgroundPanning' | 'pinchZooming';

interface PinchStartData {
  initialPinchDistance: number;
  initialScale: number;
  pinchMidpointWorld: { x: number; y: number };
}


export default function Home() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const transformedContentRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [containerWidth, setContainerWidth] = useState(0); 
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

  const [isCreateEdgeDialogOpen, setIsCreateEdgeDialogOpen] = useState(false);
  const [newEdgeDataSourceNodeId, setNewEdgeDataSourceNodeId] = useState<string | null>(null);
  const [newEdgeDataTargetNodeId, setNewEdgeDataTargetNodeId] = useState<string | null>(null);
  const [newEdgeTagsInput, setNewEdgeTagsInput] = useState("");

  const [isEditEdgeDialogOpen, setIsEditEdgeDialogOpen] = useState(false);
  const [editingEdge, setEditingEdge] = useState<Edge | null>(null);
  const [editEdgeTagsInput, setEditEdgeTagsInput] = useState("");

  // Node interaction states
  const [activeInteractionNodeId, setActiveInteractionNodeId] = useState<string | null>(null);
  const [pressHoldTimer, setPressHoldTimer] = useState<NodeJS.Timeout | null>(null);
  const [interactionStartPos, setInteractionStartPos] = useState<{ x: number, y: number } | null>(null); // For node interactions
  const [dragOffset, setDragOffset] = useState<{ x: number, y: number } | null>(null);
  const [isDraggingForReposition, setIsDraggingForReposition] = useState(false);
  const [isLinkingModeActive, setIsLinkingModeActive] = useState(false);
  const [linkingSourceNodeId, setLinkingSourceNodeId] = useState<string | null>(null);
  const [linkingLinePreview, setLinkingLinePreview] = useState<{x1: number, y1: number, x2: number, y2: number} | null>(null);

  // Canvas interaction states
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('none');
  const [panStartCoords, setPanStartCoords] = useState<{ x: number; y: number } | null>(null);
  const [quickPressStartInfo, setQuickPressStartInfo] = useState<{ screenX: number, screenY: number, worldX: number, worldY: number, time: number } | null>(null);
  const [pinchStartData, setPinchStartData] = useState<PinchStartData | null>(null);


  const [showSearchBar, setShowSearchBar] = useState(false);

  const [scale, setScale] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  const [panXSliderLimits, setPanXSliderLimits] = useState({ min: -1000, max: 1000 });
  const [panYSliderLimits, setPanYSliderLimits] = useState({ min: -1000, max: 1000 });

  const getNodeDimension = useCallback((nodeOrType: Node | Node['type']) => {
    const type = typeof nodeOrType === 'string' ? nodeOrType : nodeOrType.type;
    return type === 'category' ? CATEGORY_NODE_DIMENSION : ENTITY_NODE_DIMENSION;
  }, []);
  
  const saveNodesToFileCallback = useCallback(async (currentNodes: Node[]) => {
    await saveNodesToFile(currentNodes);
  }, []);

  const saveEdgesToFileCallback = useCallback(async (currentEdges: Edge[]) => {
    await saveEdgesToFile(currentEdges);
  }, []);


 const loadInitialData = useCallback(async () => {
    if (typeof window === 'undefined') return; 

    let loadedNodes: Node[] = [];
    let loadedEdges: Edge[] = [];

    try {
      loadedNodes = await loadNodesFromFile();
    } catch (error) {
        console.warn("Error loading nodes file, starting with empty nodes:", error);
        loadedNodes = [];
    }
    try {
        loadedEdges = await loadEdgesFromFile();
    } catch (error) {
        console.warn("Error loading edges file, starting with empty edges:", error);
        loadedEdges = [];
    }

    let nodesToSet = loadedNodes;

    if (!initialLoadAndCenteringComplete && loadedNodes.length > 0 && containerWidth > 0) {
      const mainNode = nodesToSet.find(n => n.tags.includes("Main")); // Use nodesToSet to ensure we use potentially pre-adjusted nodes if logic runs multiple times (should not with flag)
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
            mainNodeAfterAdjustment = nodesToSet.find(n => n.id === mainNode.id) || mainNode; // Re-find mainNode in adjusted array
            await saveNodesToFileCallback(nodesToSet); 
        }
        
        const mainNodeDimension = getNodeDimension(mainNodeAfterAdjustment.type);
        
        setActiveInteractionNodeId(null); 
        
        setOffsetX(Math.round((containerWidth / 2) - (mainNodeDimension / 2) * scale));
        setOffsetY(Math.round((CONTAINER_HEIGHT_PX / 2) - (mainNodeDimension / 2) * scale));
      }
      setInitialLoadAndCenteringComplete(true);
    }
    setNodes(nodesToSet);
    setEdges(loadedEdges);
    
  }, [containerWidth, getNodeDimension, scale, saveNodesToFileCallback, setNodes, setEdges, setOffsetX, setOffsetY, setActiveInteractionNodeId, initialLoadAndCenteringComplete, setInitialLoadAndCenteringComplete]);


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

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);


  const screenToWorld = useCallback((screenX: number, screenY: number): { x: number, y: number } => {
    if (!containerRef.current || scale === 0 || !isFinite(scale)) return { x: 0, y: 0 }; 
    const rect = containerRef.current.getBoundingClientRect();
    const worldX = (screenX - rect.left - offsetX) / scale;
    const worldY = (screenY - rect.top - offsetY) / scale;
    return { x: worldX, y: worldY };
  }, [offsetX, offsetY, scale]);

 useEffect(() => {
    if (activeInteractionNodeId || interactionMode === 'pinchZooming') return; 
    if (!containerRef.current || containerWidth === 0 || scale === 0 || !isFinite(scale)) return;

    const nodesToConsider = nodes;

    let contentMinXWorld = 0, contentMaxXWorld = 0, contentMinYWorld = 0, contentMaxYWorld = 0;

    if (nodesToConsider.length > 0) {
      contentMinXWorld = Math.min(...nodesToConsider.map(n => n.x));
      contentMaxXWorld = Math.max(...nodesToConsider.map(n => n.x + getNodeDimension(n)));
      contentMinYWorld = Math.min(...nodesToConsider.map(n => n.y));
      contentMaxYWorld = Math.max(...nodesToConsider.map(n => n.y + getNodeDimension(n)));
    } else { 
      const initialWorldViewCenterX = (-offsetX / scale) + (containerWidth / (2 * scale));
      const initialWorldViewCenterY = (-offsetY / scale) + (CONTAINER_HEIGHT_PX / (2 * scale));
      const defaultSpan = Math.max(containerWidth, CONTAINER_HEIGHT_PX) / (2 * scale) ; 
      contentMinXWorld = initialWorldViewCenterX - defaultSpan / 2;
      contentMaxXWorld = initialWorldViewCenterX + defaultSpan / 2;
      contentMinYWorld = initialWorldViewCenterY - defaultSpan / 2;
      contentMaxYWorld = initialWorldViewCenterY + defaultSpan / 2;
    }

    const paddingXWorld = (containerWidth / 2) / scale; 
    const paddingYWorld = (CONTAINER_HEIGHT_PX / 2) / scale; 

    const contentWorldWidth = contentMaxXWorld - contentMinXWorld;
    const contentWorldHeight = contentMaxYWorld - contentMinYWorld;
    
    let targetOffsetX, targetOffsetY;

    if (contentWorldWidth * scale <= containerWidth) {
        targetOffsetX = (containerWidth / 2) - ((contentMinXWorld + contentMaxXWorld) / 2) * scale;
    } else { 
        targetOffsetX = offsetX; 
    }

    if (contentWorldHeight * scale <= CONTAINER_HEIGHT_PX) {
        targetOffsetY = (CONTAINER_HEIGHT_PX / 2) - ((contentMinYWorld + contentMaxYWorld) / 2) * scale;
    } else { 
        targetOffsetY = offsetY; 
    }

    const minOffsetX = containerWidth - (contentMaxXWorld * scale) - paddingXWorld * scale;
    const maxOffsetX = -(contentMinXWorld * scale) + paddingXWorld * scale;
    const minOffsetY = CONTAINER_HEIGHT_PX - (contentMaxYWorld * scale) - paddingYWorld * scale;
    const maxOffsetY = -(contentMinYWorld * scale) + paddingYWorld * scale;
    
    let finalMinOffsetX, finalMaxOffsetX, finalMinOffsetY, finalMaxOffsetY;

    if (contentWorldWidth * scale <= containerWidth) {
        finalMinOffsetX = targetOffsetX;
        finalMaxOffsetX = targetOffsetX;
    } else {
        finalMinOffsetX = minOffsetX;
        finalMaxOffsetX = maxOffsetX;
    }

    if (contentWorldHeight * scale <= CONTAINER_HEIGHT_PX) {
        finalMinOffsetY = targetOffsetY;
        finalMaxOffsetY = targetOffsetY;
    } else {
        finalMinOffsetY = minOffsetY;
        finalMaxOffsetY = maxOffsetY;
    }
    
    const newPanXLimits = { min: Math.round(Math.min(finalMinOffsetX, finalMaxOffsetX)), max: Math.round(Math.max(finalMinOffsetX, finalMaxOffsetX)) };
    const newPanYLimits = { min: Math.round(Math.min(finalMinOffsetY, finalMaxOffsetY)), max: Math.round(Math.max(finalMinOffsetY, finalMaxOffsetY)) };
    
    setPanXSliderLimits(newPanXLimits);
    setPanYSliderLimits(newPanYLimits);
    
  }, [nodes, scale, containerWidth, activeInteractionNodeId, getNodeDimension, offsetX, offsetY, interactionMode]);

  // Effect to clamp offsetX
  useEffect(() => {
    if (activeInteractionNodeId || interactionMode === 'pinchZooming') return;
    const currentClampedOffsetX = Math.max(panXSliderLimits.min, Math.min(panXSliderLimits.max, offsetX));
    if (Math.round(currentClampedOffsetX) !== Math.round(offsetX) && isFinite(currentClampedOffsetX)) {
        setOffsetX(Math.round(currentClampedOffsetX));
    }
  }, [panXSliderLimits, offsetX, activeInteractionNodeId, interactionMode]);

  // Effect to clamp offsetY
  useEffect(() => {
    if (activeInteractionNodeId || interactionMode === 'pinchZooming') return;
    const currentClampedOffsetY = Math.max(panYSliderLimits.min, Math.min(panYSliderLimits.max, offsetY));
    if (Math.round(currentClampedOffsetY) !== Math.round(offsetY) && isFinite(currentClampedOffsetY)) {
        setOffsetY(Math.round(currentClampedOffsetY));
    }
  }, [panYSliderLimits, offsetY, activeInteractionNodeId, interactionMode]);

  const createNode = async () => {
    if (newNodeName && containerWidth > 0 && scale !== 0 && isFinite(scale)) {
      
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
        
        // Basic check for overlap at exact pending coords (could be expanded)
        let overlapWithExistingAtPending = false;
        for (const existingNode of currentNodesForCreation) {
            const existingNodeDimension = getNodeDimension(existingNode);
            if (newNodeX < existingNode.x + existingNodeDimension &&
                newNodeX + newNodeDimension > existingNode.x &&
                newNodeY < existingNode.y + existingNodeDimension &&
                newNodeY + newNodeDimension > existingNode.y) {
                overlapWithExistingAtPending = true;
                break;
            }
        }
        if (!overlapWithExistingAtPending) {
          placed = true;
        }
        setPendingNodeCreationCoords(null); 
      }
      
      if (!placed) { 
        let attempts = 0;
        const worldViewCenterX = (-offsetX + containerWidth / 2) / scale;
        const worldViewCenterY = (-offsetY + CONTAINER_HEIGHT_PX / 2) / scale;
        const creationAreaWorldWidth = (containerWidth / 2) / scale; 
        const creationAreaWorldHeight = (CONTAINER_HEIGHT_PX / 2) / scale; 

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
      await saveNodesToFileCallback(updatedNodes);

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
      await saveNodesToFileCallback(provisionallyUpdatedNodes);
      setEditingNode(null);
      setIsEditNodeDialogOpen(false);
    }
  };

  const deleteNode = async () => {
    if (!editingNode) return;

    const nodeIdToDelete = editingNode.id;
    const updatedNodes = nodes.filter(node => node.id !== nodeIdToDelete);
    setNodes(updatedNodes);
    await saveNodesToFileCallback(updatedNodes);

    const updatedEdges = edges.filter(edge => edge.sourceNodeId !== nodeIdToDelete && edge.targetNodeId !== nodeIdToDelete);
    setEdges(updatedEdges);
    await saveEdgesToFileCallback(updatedEdges);
    
    setEditingNode(null);
    setIsEditNodeDialogOpen(false);
  };


  const findExistingEdge = useCallback((nodeId1: string, nodeId2: string): Edge | undefined => {
    return edges.find(edge =>
      (edge.sourceNodeId === nodeId1 && edge.targetNodeId === nodeId2) ||
      (edge.sourceNodeId === nodeId2 && edge.targetNodeId === nodeId1)
    );
  }, [edges]);

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
      await saveEdgesToFileCallback(updatedEdges);

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
      await saveEdgesToFileCallback(updatedEdges);

      setEditingEdge(null);
      setIsEditEdgeDialogOpen(false);
    }
  };

  const deleteEdge = async () => {
    if (editingEdge) {
      const updatedEdges = edges.filter(edge => edge.id !== editingEdge.id);
      setEdges(updatedEdges);
      await saveEdgesToFileCallback(updatedEdges);

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


  const handleCanvasInteractionStart = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    const targetElement = event.target as HTMLElement;

    const isDirectlyOnContainer = containerRef.current === targetElement;
    const isDirectlyOnTransformedContent = transformedContentRef.current === targetElement;

    if (!isDirectlyOnContainer && !isDirectlyOnTransformedContent) {
      return; 
    }
    
    if (event.type.startsWith('touch')) {
        const touchEvent = event as React.TouchEvent;
        if (touchEvent.touches.length === 2) {
            if (touchEvent.cancelable) touchEvent.preventDefault();
            setInteractionMode('pinchZooming');
            const initialDistance = getDistance(touchEvent.touches);
            const screenMid = getMidpoint(touchEvent.touches);
            const worldMid = screenToWorld(screenMid.x, screenMid.y);
            setPinchStartData({
                initialPinchDistance: initialDistance,
                initialScale: scale,
                pinchMidpointWorld: worldMid,
            });
            setPanStartCoords(null);
            setQuickPressStartInfo(null);
            return;
        }
    }
     
    if (event.type.startsWith('touch') && event.cancelable) {
      event.preventDefault();
    }
    const point = 'touches' in event ? (event as React.TouchEvent).touches[0] : (event as React.MouseEvent);
    const screenCoords = { x: point.clientX, y: point.clientY };
    const worldCoords = screenToWorld(point.clientX, point.clientY);

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


  }, [screenToWorld, scale]); 

  useEffect(() => {
    const currentContainerRef = containerRef.current;

    const handleMove = (event: MouseEvent | TouchEvent) => {
      if (activeInteractionNodeId && interactionStartPos && dragOffset && containerRef.current) {
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
      } else if (interactionMode === 'pinchZooming' && pinchStartData && 'touches' in event && (event as TouchEvent).touches.length === 2) {
          if (event.cancelable) event.preventDefault();
          const touches = (event as TouchEvent).touches;
          const currentDistance = getDistance(touches);
          const currentScreenMidpoint = getMidpoint(touches);
          
          const scaleFactor = currentDistance / pinchStartData.initialPinchDistance;
          let newScale = pinchStartData.initialScale * scaleFactor;
          newScale = Math.max(LOG_SCALE_MIN, Math.min(LOG_SCALE_MAX, newScale)); // Use LOG_SCALE bounds

          if (containerRef.current && isFinite(newScale)) {
            const rect = containerRef.current.getBoundingClientRect();
            const newOffsetX = currentScreenMidpoint.x - rect.left - (pinchStartData.pinchMidpointWorld.x * newScale);
            const newOffsetY = currentScreenMidpoint.y - rect.top - (pinchStartData.pinchMidpointWorld.y * newScale);

            setScale(newScale);
            setOffsetX(newOffsetX);
            setOffsetY(newOffsetY);
          }
      }
      else if (interactionMode === 'backgroundQuickPressCandidate' && panStartCoords && quickPressStartInfo) {
        const point = 'touches' in event ? (event as TouchEvent).touches[0] : (event as MouseEvent);
        const currentX = point.clientX;
        const currentY = point.clientY;
        if (Math.abs(currentX - quickPressStartInfo.screenX) > DRAG_MOVE_THRESHOLD || Math.abs(currentY - quickPressStartInfo.screenY) > DRAG_MOVE_THRESHOLD) {
          setInteractionMode('backgroundPanning');
        }
      } else if (interactionMode === 'backgroundPanning' && panStartCoords) {
        const point = 'touches' in event ? (event as TouchEvent).touches[0] : (event as MouseEvent);
        const dx = point.clientX - panStartCoords.x;
        const dy = point.clientY - panStartCoords.y;
        setOffsetX(prev => prev + dx);
        setOffsetY(prev => prev + dy);
        setPanStartCoords({ x: point.clientX, y: point.clientY });
      }
    };

    const handleEnd = async (event: MouseEvent | TouchEvent) => {
      if (activeInteractionNodeId) {
        if (pressHoldTimer) {
          clearTimeout(pressHoldTimer);
          setPressHoldTimer(null);
        }

        const point = 'changedTouches' in event ? (event as TouchEvent).changedTouches[0] : (event as MouseEvent);
        if (!point || !containerRef.current) {
          if (!showSearchBar && !isCreateEdgeDialogOpen && !isEditNodeDialogOpen && !isEditEdgeDialogOpen) setActiveInteractionNodeId(null);
          setInteractionStartPos(null); setDragOffset(null); setIsDraggingForReposition(false);
          setIsLinkingModeActive(false); setLinkingSourceNodeId(null); setLinkingLinePreview(null);
          return;
        }

        const worldMouseReleasePos = screenToWorld(point.clientX, point.clientY);
        let targetNodeUnderneath: Node | null = null;

        for (const node of nodes) {
          if (node.id === activeInteractionNodeId) continue; 
          const nodeDim = getNodeDimension(node);
          if (
            worldMouseReleasePos.x >= node.x && worldMouseReleasePos.x <= node.x + nodeDim &&
            worldMouseReleasePos.y >= node.y && worldMouseReleasePos.y <= node.y + nodeDim
          ) {
            targetNodeUnderneath = node;
            break; 
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
                  const updatedNodes = nodes.map(n => {
                      if (n.id === linkingSourceNodeId) {
                          const nodeDim = getNodeDimension(n);
                          let newX = worldMouseReleasePos.x - (dragOffset?.x || (nodeDim/2));
                          let newY = worldMouseReleasePos.y - (dragOffset?.y || (nodeDim/2));
                          return { ...n, x: newX, y: newY };
                      }
                      return n;
                  });
                  setNodes(updatedNodes);
                  await saveNodesToFileCallback(updatedNodes); 
              }
          }
        } else if (isDraggingForReposition) { 
          const draggedNodeId = activeInteractionNodeId; 
          if (targetNodeUnderneath && draggedNodeId && draggedNodeId !== targetNodeUnderneath.id) { 
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
          await saveNodesToFileCallback(nodes); 
        } else if (isLinkingModeActive) { 
          setShowSearchBar(true);
        } else if (!isDraggingForReposition && !isLinkingModeActive && !showSearchBar) { 
          const nodeToEdit = nodes.find(n => n.id === activeInteractionNodeId);
          if (nodeToEdit) openEditNodeDialog(nodeToEdit);
        }

        if (!isCreateEdgeDialogOpen && !isEditNodeDialogOpen && !isEditEdgeDialogOpen && !showSearchBar) {
          setActiveInteractionNodeId(null);
        }
        setInteractionStartPos(null);
        setDragOffset(null);
        setIsDraggingForReposition(false);
        setIsLinkingModeActive(false);
        setLinkingSourceNodeId(null);
        setLinkingLinePreview(null);
      } else if (interactionMode === 'pinchZooming') {
        if ('touches' in event && (event as TouchEvent).touches.length < 2) {
            setInteractionMode('none');
            setPinchStartData(null);
        }
      }
      else if (interactionMode === 'backgroundQuickPressCandidate' && quickPressStartInfo) {
        const point = 'changedTouches' in event ? (event as TouchEvent).changedTouches[0] : (event as MouseEvent);
        const releaseTime = Date.now();
        const duration = releaseTime - quickPressStartInfo.time;
        const screenDistanceMoved = Math.sqrt(
          Math.pow(point.clientX - quickPressStartInfo.screenX, 2) +
          Math.pow(point.clientY - quickPressStartInfo.screenY, 2)
        );

        if (duration < QUICK_PRESS_DURATION_THRESHOLD && screenDistanceMoved < DRAG_MOVE_THRESHOLD) {
          setPendingNodeCreationCoords({ x: quickPressStartInfo.worldX, y: quickPressStartInfo.worldY });
          setIsCreateNodeDialogOpen(true);
        }
        setQuickPressStartInfo(null);
      }

      
      if (interactionMode !== 'none' && interactionMode !== 'pinchZooming') { 
          setInteractionMode('none');
      }
      setPanStartCoords(null); 
    };

    if (currentContainerRef) {
      currentContainerRef.addEventListener('mousedown', handleCanvasInteractionStart as unknown as EventListener);
      currentContainerRef.addEventListener('touchstart', handleCanvasInteractionStart as unknown as EventListener, { passive: false });
    }

    
    if (activeInteractionNodeId || interactionMode !== 'none') {
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
      if (pressHoldTimer) clearTimeout(pressHoldTimer);
    };
  }, [
      activeInteractionNodeId, interactionStartPos, dragOffset, pressHoldTimer, nodes, edges, 
      isDraggingForReposition, showSearchBar, openEditNodeDialog, isLinkingModeActive, 
      linkingSourceNodeId, linkingLinePreview, isCreateEdgeDialogOpen, isEditNodeDialogOpen, 
      isEditEdgeDialogOpen, getNodeDimension, containerWidth, findExistingEdge, screenToWorld, 
      scale, offsetX, offsetY, saveNodesToFileCallback, saveEdgesToFileCallback,
      interactionMode, panStartCoords, quickPressStartInfo, handleCanvasInteractionStart, pinchStartData
  ]);


  const applyRepulsion = useCallback((currentNodes: Node[], fixedNodeId: string | null): Node[] => {
    if (currentNodes.length < 2 || containerWidth === 0) return currentNodes;

    let newNodes = currentNodes.map(n => ({ ...n })); 

    for (let iter = 0; iter < REPULSION_ITERATIONS; iter++) {
      let systemMoved = false;
      for (let i = 0; i < newNodes.length; i++) {
        for (let j = i + 1; j < newNodes.length; j++) {
          const nodeA = newNodes[i];
          const nodeB = newNodes[j];

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
            
            const prevXA = nodeA.x;
            const prevYA = nodeA.y;
            nodeA.x += moveAx;
            nodeA.y += moveAy;
            if (Math.abs(nodeA.x - prevXA) > 0.01 || Math.abs(nodeA.y - prevYA) > 0.01) systemMoved = true;


            const prevXB = nodeB.x;
            const prevYB = nodeB.y;
            nodeB.x += moveBx;
            nodeB.y += moveBy;
            if (Math.abs(nodeB.x - prevXB) > 0.01 || Math.abs(nodeB.y - prevYB) > 0.01) systemMoved = true;
          }
        }
      }
      if (!systemMoved && iter > 0) break; 
    }
    return newNodes;
  }, [getNodeDimension, containerWidth]); 

  useEffect(() => { 
    if (nodes.length < 2 || containerWidth === 0 || activeInteractionNodeId || interactionMode !== 'none') return; 

    const repulsedNodes = applyRepulsion(nodes, null); 
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
      const timeoutId = setTimeout(async () => {
        setNodes(repulsedNodes);
        await saveNodesToFileCallback(repulsedNodes);
      }, 50); 
      return () => clearTimeout(timeoutId);
    }
  }, [nodes, activeInteractionNodeId, applyRepulsion, containerWidth, saveNodesToFileCallback, interactionMode]); 

  useEffect(() => { 
    if (nodes.length < 2 || containerWidth === 0 || !activeInteractionNodeId || interactionMode !== 'none') return; 

    const repulsedNodes = applyRepulsion(nodes, activeInteractionNodeId); 
    let changed = false;

    for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].id === activeInteractionNodeId) continue; 
        const rn = repulsedNodes.find(r => r.id === nodes[i].id);
        if (rn && (Math.abs(nodes[i].x - rn.x) > 0.1 || Math.abs(nodes[i].y - rn.y) > 0.1)) {
            changed = true;
            break;
        }
    }

    if (changed) {
      const timeoutId = setTimeout(async () => {
        const finalUpdatedNodes = nodes.map(cn => {
            if (cn.id === activeInteractionNodeId) return cn; 
            const rn = repulsedNodes.find(r => r.id === cn.id);
            return rn || cn; 
        });
        setNodes(finalUpdatedNodes);
        await saveNodesToFileCallback(finalUpdatedNodes);
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [nodes, activeInteractionNodeId, applyRepulsion, containerWidth, saveNodesToFileCallback, interactionMode]);


  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  // Local min/max scale values, updated to new bounds
  const minScale = LOG_SCALE_MIN;
  const maxScale = LOG_SCALE_MAX;

  const screenGridData = useMemo(() => {
    if (!isClient || containerWidth === 0 || CONTAINER_HEIGHT_PX === 0 || scale === 0 || !isFinite(scale)) {
      return { verticalLines: [], horizontalLines: [] };
    }
    return calculateScreenGridLinePositions(offsetX, offsetY, scale, containerWidth, CONTAINER_HEIGHT_PX);
  }, [isClient, offsetX, offsetY, scale, containerWidth]);
  
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') {
          alert("Error reading file content.");
          return;
        }
        const data = JSON.parse(text);
        if (data && Array.isArray(data.nodes) && Array.isArray(data.edges)) {
          
          const areNodesValid = data.nodes.every((n: any) => 
            typeof n.id === 'string' &&
            typeof n.name === 'string' &&
            typeof n.x === 'number' &&
            typeof n.y === 'number' &&
            Array.isArray(n.tags) &&
            (n.type === 'category' || n.type === 'entity')
          );
          
          const areEdgesValid = data.edges.every((edge: any) => 
            typeof edge.id === 'string' &&
            typeof edge.sourceNodeId === 'string' &&
            typeof edge.targetNodeId === 'string' &&
            Array.isArray(edge.tags) &&
            edge.tags.every((tag: any) => typeof tag.name === 'string')
          );

          if (!areNodesValid || !areEdgesValid) {
            alert("Uploaded file has invalid node or edge structure.");
            return;
          }
          
          setInitialLoadAndCenteringComplete(false); 
          setNodes(data.nodes as Node[]);
          setEdges(data.edges as Edge[]);
          await saveNodesToFileCallback(data.nodes as Node[]);
          await saveEdgesToFileCallback(data.edges as Edge[]);
          alert("Data uploaded and saved successfully!");
          
        } else {
          alert("Invalid file format. Expected JSON with 'nodes' and 'edges' arrays.");
        }
      } catch (error) {
        console.error("Error processing uploaded file:", error);
        alert("Error processing uploaded file. Check console for details.");
      } finally {
        
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    };
    reader.readAsText(file);
  };


  return (
    <main className="flex flex-col items-center justify-start min-h-screen p-4 sm:p-6 md:p-8 lg:p-10 bg-background text-foreground">
      <h1 className="text-3xl font-bold tracking-tight mb-6 text-center">Node Weaver</h1>

      <div className="w-full max-w-3xl flex flex-col items-center gap-4 mb-4">
        <div className="w-full grid grid-cols-3 gap-4 items-center px-2">
            <Label htmlFor="scale-slider" className="text-sm text-right">Zoom: {isClient ? Math.round(scale * 100) : 100}%</Label>
            <Slider
                id="scale-slider"
                min={LINEAR_SLIDER_MIN}
                max={LINEAR_SLIDER_MAX}
                step={1} // Fine enough for linear 0-100 range
                value={isClient ? [logToLinearScale(scale, LOG_SCALE_MIN, LOG_SCALE_MAX, LINEAR_SLIDER_MIN, LINEAR_SLIDER_MAX)] : [logToLinearScale(1, LOG_SCALE_MIN, LOG_SCALE_MAX, LINEAR_SLIDER_MIN, LINEAR_SLIDER_MAX)]}
                onValueChange={(value) => {
                    const newScale = linearToLogScale(value[0], LINEAR_SLIDER_MIN, LINEAR_SLIDER_MAX, LOG_SCALE_MIN, LOG_SCALE_MAX);
                    setScale(Math.max(LOG_SCALE_MIN, Math.min(LOG_SCALE_MAX, newScale)));
                }}
                className="col-span-2"
            />
        </div>
        <div className="w-full grid grid-cols-3 gap-4 items-center px-2">
            <Label htmlFor="offset-x-slider" className="text-sm text-right">Pan X: {isClient ? Math.round(offsetX) : 0}px</Label>
            <Slider
                id="offset-x-slider"
                min={panXSliderLimits.min}
                max={panXSliderLimits.max}
                step={1}
                value={[offsetX]}
                onValueChange={(value) => setOffsetX(value[0])}
                className="col-span-2"
                disabled={panXSliderLimits.min >= panXSliderLimits.max} 
            />
        </div>
         <div className="w-full grid grid-cols-3 gap-4 items-center px-2">
            <Label htmlFor="offset-y-slider" className="text-sm text-right">Pan Y: {isClient ? Math.round(offsetY) : 0}px</Label>
            <Slider
                id="offset-y-slider"
                min={panYSliderLimits.min}
                max={panYSliderLimits.max}
                step={1}
                value={[offsetY]}
                onValueChange={(value) => setOffsetY(value[0])}
                className="col-span-2"
                disabled={panYSliderLimits.min >= panYSliderLimits.max} 
            />
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative w-full max-w-3xl border rounded-lg shadow-inner bg-card touch-none overflow-hidden"
        style={{ height: `${CONTAINER_HEIGHT_PX}px` }}
      >
        <svg
          className="absolute top-0 left-0 w-full h-full pointer-events-none z-0" 
          aria-hidden="true"
        >
          {isClient && screenGridData.verticalLines.map((lineX, index) => (
            <line
              key={`v-screen-${index}-${lineX}`}
              x1={lineX}
              y1={0}
              x2={lineX}
              y2={CONTAINER_HEIGHT_PX}
              stroke="hsl(var(--border))"
              strokeWidth={0.5} 
              opacity="0.3"
            />
          ))}
          {isClient && screenGridData.horizontalLines.map((lineY, index) => (
            <line
              key={`h-screen-${index}-${lineY}`}
              x1={0}
              y1={lineY}
              x2={containerWidth} 
              y2={lineY}
              stroke="hsl(var(--border))"
              strokeWidth={0.5}
              opacity="0.3"
            />
          ))}
        </svg>
        
        <div
          ref={transformedContentRef}
          style={{
            width: '100%', 
            height: '100%', 
            transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
            transformOrigin: '0 0', 
            willChange: 'transform', 
            zIndex: 2, 
          }}
        >
          <svg
            className="absolute top-0 left-0 w-full h-full pointer-events-none"
            overflow="visible" 
          >
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
                  strokeWidth={2 / scale} 
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
                strokeWidth={2 / scale} 
                strokeDasharray={`${5/scale},${5/scale}`} 
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
              zIndex: activeInteractionNodeId === node.id ? 20 : 10, 
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
            }
            
            const minFontSizeForNodeText = 6; 
            const baseNameFontSize = 16; 
            const baseTagFontSize = 10;  

            const dynamicNameFontSizeScreen = Math.max(minFontSizeForNodeText, baseNameFontSize * Math.min(scale, 1)); 
            const dynamicTagFontSizeScreen = Math.max(minFontSizeForNodeText, baseTagFontSize * Math.min(scale, 1));

            const finalNameFontSize = dynamicNameFontSizeScreen / scale;
            const finalTagFontSize = dynamicTagFontSizeScreen / scale;


            return (
              <div
                key={node.id}
                className={`p-3 flex flex-col items-center justify-center text-center cursor-pointer shadow-xl transition-all duration-200 hover:shadow-2xl select-none`}
                style={nodeStyles}
                onMouseDown={(e) => handleNodeInteractionStart(e, node)}
                onTouchStart={(e) => handleNodeInteractionStart(e, node)}
                title={`Interact with ${node.name}`}
              >
                <h2 className="text-md font-semibold truncate w-full" style={{ fontSize: `${finalNameFontSize}px`, lineHeight: '1.2' }}>{node.name}</h2>
                {node.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap justify-center gap-1 overflow-hidden max-h-[3em]"> 
                    {node.tags.slice(0, 2).map(tag => ( 
                      <span key={tag} className="text-xs bg-black/20 text-white px-2 py-0.5 rounded-full" style={{ fontSize: `${finalTagFontSize}px`, lineHeight: '1.2' }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {node.tags.length > 2 && ( 
                  <span className="text-xs mt-0.5 opacity-70" style={{ fontSize: `${finalTagFontSize}px`, lineHeight: '1.2' }}>+{node.tags.length - 2} more</span>
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
                if(activeInteractionNodeId) setActiveInteractionNodeId(null); 
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
      
      <div className="mt-8 flex flex-col items-center gap-4">
        <div className="flex gap-4">
          <Dialog 
            open={isCreateNodeDialogOpen} 
            onOpenChange={(isOpen) => {
              setIsCreateNodeDialogOpen(isOpen);
              if (!isOpen) {
                setActiveInteractionNodeId(null);
                if (pendingNodeCreationCoords) setPendingNodeCreationCoords(null); 
              }
            }}
          >
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg text-lg px-6 py-3 rounded-lg">
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

          <Button onClick={loadInitialData} variant="outline" className="shadow-lg text-lg px-6 py-3 rounded-lg">
              <Download className="mr-2 h-5 w-5 transform rotate-180" /> 
              Load Data
          </Button>
        </div>
        <div className="flex gap-4">
          <Button asChild variant="outline" className="shadow-lg text-lg px-6 py-3 rounded-lg">
            <a href="/api/download-all-data" download="node_weaver_data.json">
              <Download className="mr-2 h-5 w-5" />
              Download Data
            </a>
          </Button>
          <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="shadow-lg text-lg px-6 py-3 rounded-lg">
            <Upload className="mr-2 h-5 w-5" />
            Upload Data
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".json"
            className="hidden"
          />
        </div>
      </div>


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
            <DialogFooter className="flex justify-between items-center">
              <Button variant="destructive" onClick={deleteNode} className="text-md px-5 py-2.5">
                <Trash2 className="mr-2 h-5 w-5" /> Delete Node
              </Button>
              <div>
                <DialogClose asChild>
                  <Button variant="outline" onClick={() => { setIsEditNodeDialogOpen(false); setEditingNode(null); setActiveInteractionNodeId(null);}} className="text-md px-5 py-2.5 mr-2">Cancel</Button>
                </DialogClose>
                <Button type="submit" onClick={saveNodeChanges} className="bg-primary text-primary-foreground hover:bg-primary/90 text-md px-5 py-2.5">Save Changes</Button>
              </div>
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


    