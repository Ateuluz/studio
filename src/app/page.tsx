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
import { Plus, Link2, Trash2, Download } from "lucide-react";

const NODES_KEY = 'nodeWeaverNodes';
const EDGES_KEY = 'nodeWeaverEdges';

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
  id:string;
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

const BASE_GRID_SIZE = 50; 

// Helper function to determine grid line separation in WORLD units based on scale
function getGridLineWorldSeparation(scale: number): number {
  if (scale < 0.4) return BASE_GRID_SIZE * 4;
  if (scale < 0.8) return BASE_GRID_SIZE * 2;
  return BASE_GRID_SIZE;
}

interface ScreenGridData {
  verticalLines: number[]; // X-coordinates in screen space
  horizontalLines: number[]; // Y-coordinates in screen space
}

// Helper function to calculate SCREEN coordinates for grid lines
function calculateScreenGridLinePositions(
  offsetX: number, 
  offsetY: number, 
  scale: number,
  containerWidth: number, 
  containerHeight: number 
): ScreenGridData {
  if (containerWidth <= 0 || containerHeight <= 0 || scale === 0) {
    return { verticalLines: [], horizontalLines: [] };
  }

  const worldSeparation = getGridLineWorldSeparation(scale); 
  const screenSeparation = worldSeparation * scale; 

  if (screenSeparation < 5 || !isFinite(screenSeparation)) { 
    return { verticalLines: [], horizontalLines: [] };
  }

  const verticalLines: number[] = [];
  const horizontalLines: number[] = [];

  // Calculate the world coordinates of the top-left of the viewport
  const worldViewTopLeftX = -offsetX / scale;
  const worldViewTopLeftY = -offsetY / scale;

  // Calculate the first multiple of worldSeparation that is >= worldViewTopLeftX
  const firstVerticalWorldLine_k = Math.floor(worldViewTopLeftX / worldSeparation);
  // Calculate the last multiple of worldSeparation that is <= worldViewTopLeftX + (containerWidth / scale)
  const lastVerticalWorldLine_k = Math.ceil((worldViewTopLeftX + containerWidth / scale) / worldSeparation);

  for (let k = firstVerticalWorldLine_k; k <= lastVerticalWorldLine_k; k++) {
    const worldX = k * worldSeparation;
    const screenX = worldX * scale + offsetX; // Convert world X to screen X
    // Add line if it's within or near the viewport (add a buffer for lines just outside)
    if (screenX >= -screenSeparation && screenX <= containerWidth + screenSeparation) {
      verticalLines.push(screenX);
    }
  }

  const firstHorizontalWorldLine_k = Math.floor(worldViewTopLeftY / worldSeparation);
  const lastHorizontalWorldLine_k = Math.ceil((worldViewTopLeftY + containerHeight / scale) / worldSeparation);
  
  for (let k = firstHorizontalWorldLine_k; k <= lastHorizontalWorldLine_k; k++) {
    const worldY = k * worldSeparation;
    const screenY = worldY * scale + offsetY; // Convert world Y to screen Y
    if (screenY >= -screenSeparation && screenY <= containerHeight + screenSeparation) {
      horizontalLines.push(screenY);
    }
  }
  
  return { verticalLines, horizontalLines };
}


function parseTagsWithDates(tagsInput: string): EdgeTag[] {
  if (!tagsInput.trim()) return [];
  const tagEntries = tagsInput.split(',').map(entry => entry.trim());
  const regex = /^(.*?)(?:\s*\((....-..-..)\))?$/; // Regex to capture tag name and optional date
  return tagEntries.map(entry => {
    const match = entry.match(regex);
    if (match) {
      const name = match[1].trim();
      const date = match[2]; // Date part
      return { name, date: date || undefined };
    }
    return { name: entry.trim() }; // If no date, just the name
  }).filter(tag => tag.name); // Ensure tag name is not empty
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
  const [containerWidth, setContainerWidth] = useState(768); // Default width

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

  const [panXSliderLimits, setPanXSliderLimits] = useState({ min: -1000, max: 1000 });
  const [panYSliderLimits, setPanYSliderLimits] = useState({ min: -1000, max: 1000 });

  const getNodeDimension = useCallback((nodeOrType: Node | Node['type']) => {
    const type = typeof nodeOrType === 'string' ? nodeOrType : nodeOrType.type;
    return type === 'category' ? CATEGORY_NODE_DIMENSION : ENTITY_NODE_DIMENSION;
  }, []);

  const saveNodesToLocalStorage = useCallback((currentNodes: Node[]) => {
    try {
      localStorage.setItem(NODES_KEY, JSON.stringify(currentNodes));
    } catch (error) {
      console.error("Failed to save nodes:", error);
    }
  }, []);

  const saveEdgesToLocalStorage = useCallback((currentEdges: Edge[]) => {
    try {
      localStorage.setItem(EDGES_KEY, JSON.stringify(currentEdges));
    } catch (error) {
      console.error("Failed to save edges:", error);
    }
  }, []);
  
  const loadDataFromLocalStorage = useCallback(() => {
    try {
      const storedNodesString = localStorage.getItem(NODES_KEY);
      let loadedNodes: Node[] = [];
      if (storedNodesString) {
        try {
          loadedNodes = JSON.parse(storedNodesString);
        } catch (e) {
          console.error("Error parsing nodes from localStorage:", e);
          loadedNodes = []; 
        }
      }
     
      const storedEdgesString = localStorage.getItem(EDGES_KEY);
      let loadedEdges: Edge[] = [];
      if (storedEdgesString) {
         try {
          loadedEdges = JSON.parse(storedEdgesString);
        } catch (e) {
          console.error("Error parsing edges from localStorage:", e);
          loadedEdges = [];
        }
      }
      setNodes(loadedNodes);
      setEdges(loadedEdges);

    } catch (error) {
      console.error("Failed to load data from localStorage during general operation:", error);
      setNodes([]); 
      setEdges([]);
    }
  }, []);


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
    loadDataFromLocalStorage();
  }, [loadDataFromLocalStorage]);


  const screenToWorld = useCallback((screenX: number, screenY: number): { x: number, y: number } => {
    if (!containerRef.current || scale === 0) return { x: 0, y: 0 }; 
    const rect = containerRef.current.getBoundingClientRect();
    const worldX = (screenX - rect.left - offsetX) / scale;
    const worldY = (screenY - rect.top - offsetY) / scale;
    return { x: worldX, y: worldY };
  }, [offsetX, offsetY, scale]);

 useEffect(() => {
    if (activeInteractionNodeId) return; 
    if (!containerRef.current || containerWidth === 0 || scale === 0) return;

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
    
    const newPanXLimits = { min: Math.min(finalMinOffsetX, finalMaxOffsetX), max: Math.max(finalMinOffsetX, finalMaxOffsetX) };
    const newPanYLimits = { min: Math.min(finalMinOffsetY, finalMaxOffsetY), max: Math.max(finalMinOffsetY, finalMaxOffsetY) };
    
    setPanXSliderLimits(newPanXLimits);
    setPanYSliderLimits(newPanYLimits);
    
    const currentClampedOffsetX = Math.max(newPanXLimits.min, Math.min(newPanXLimits.max, offsetX));
    if (currentClampedOffsetX !== offsetX) {
        setOffsetX(currentClampedOffsetX);
    }

    const currentClampedOffsetY = Math.max(newPanYLimits.min, Math.min(newPanYLimits.max, offsetY));
    if (currentClampedOffsetY !== offsetY) {
        setOffsetY(currentClampedOffsetY);
    }

  }, [nodes, scale, containerWidth, activeInteractionNodeId, getNodeDimension, offsetX, offsetY]);


  const createNode = () => {
    if (newNodeName && containerWidth > 0 && scale !== 0) {
      
      let currentNodesForCreation = [...nodes];
      if (newNodeTags.includes("Main")) {
        currentNodesForCreation = currentNodesForCreation.map(n => {
          if (n.tags.includes("Main")) {
            return { ...n, tags: n.tags.filter(t => t !== "Main") };
          }
          return n;
        });
      }
      const tagsArray = newNodeTags.split(',').map(tag => tag.trim()).filter(tag => tag);

      let newNodeX = 0;
      let newNodeY = 0;
      let placed = false;
      let attempts = 0;
      const newNodeDimension = getNodeDimension(newNodeType);

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
      saveNodesToLocalStorage(updatedNodes);

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
      saveNodesToLocalStorage(provisionallyUpdatedNodes);
      setEditingNode(null);
      setIsEditNodeDialogOpen(false);
    }
  };

  const deleteNode = () => {
    if (!editingNode) return;

    const nodeIdToDelete = editingNode.id;
    const updatedNodes = nodes.filter(node => node.id !== nodeIdToDelete);
    setNodes(updatedNodes);
    saveNodesToLocalStorage(updatedNodes);

    const updatedEdges = edges.filter(edge => edge.sourceNodeId !== nodeIdToDelete && edge.targetNodeId !== nodeIdToDelete);
    setEdges(updatedEdges);
    saveEdgesToLocalStorage(updatedEdges);
    
    setEditingNode(null);
    setIsEditNodeDialogOpen(false);
    setActiveInteractionNodeId(null); 
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
      const updatedEdges = [...edges, newEdgeToAdd];
      setEdges(updatedEdges);
      saveEdgesToLocalStorage(updatedEdges);

      setIsCreateEdgeDialogOpen(false);
      setNewEdgeDataSourceNodeId(null);
      setNewEdgeDataTargetNodeId(null);
      setNewEdgeTagsInput("");
    }
  };

  const saveEdgeChanges = () => {
    if (editingEdge) {
      const updatedTags = parseTagsWithDates(editEdgeTagsInput);
      const updatedEdges = edges.map(edge =>
        edge.id === editingEdge.id ? { ...edge, tags: updatedTags } : edge
      );
      setEdges(updatedEdges);
      saveEdgesToLocalStorage(updatedEdges);

      setEditingEdge(null);
      setIsEditEdgeDialogOpen(false);
    }
  };

  const deleteEdge = () => {
    if (editingEdge) {
      const updatedEdges = edges.filter(edge => edge.id !== editingEdge.id);
      setEdges(updatedEdges);
      saveEdgesToLocalStorage(updatedEdges);

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

      // Iterate over nodes to find if the release point is over any node
      // that is NOT the node currently being interacted with.
      for (const node of nodes) {
        // If the current node in the loop is the one being dragged/interacted with, skip it.
        // We are looking for a *different* node to drop onto or link to.
        if (node.id === activeInteractionNodeId) {
          continue;
        }

        const nodeDim = getNodeDimension(node);
        if (
          worldMouseReleasePos.x >= node.x && worldMouseReleasePos.x <= node.x + nodeDim &&
          worldMouseReleasePos.y >= node.y && worldMouseReleasePos.y <= node.y + nodeDim
        ) {
          // A potential target node is found under the cursor, and it's not the active node.
          // If in linking mode, an additional check might be needed if linkingSourceNodeId
          // could differ from activeInteractionNodeId.
          // However, activeInteractionNodeId is usually the linkingSourceNodeId in linking mode.
          if (isLinkingModeActive && linkingSourceNodeId && node.id === linkingSourceNodeId) {
            // This case is unlikely if activeInteractionNodeId is correctly set as linkingSourceNodeId,
            // as it would be caught by the `node.id === activeInteractionNodeId` check above.
            // This is a safeguard for linking mode specifically.
            continue;
          }
          
          targetNodeUnderneath = node;
          break; // Found a suitable, different node
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
                saveNodesToLocalStorage(updatedNodes); 
            }
        }
      } else if (isDraggingForReposition) { 
        const draggedNodeId = activeInteractionNodeId; 
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
        saveNodesToLocalStorage(nodes); 

      } else if (isLinkingModeActive && activeInteractionNodeId) { 
        setShowSearchBar(true);
      } else if (activeInteractionNodeId && !isDraggingForReposition && !isLinkingModeActive && !showSearchBar) { 
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
  }, [activeInteractionNodeId, interactionStartPos, dragOffset, pressHoldTimer, nodes, edges, isDraggingForReposition, showSearchBar, openEditNodeDialog, isLinkingModeActive, linkingSourceNodeId, linkingLinePreview, isCreateEdgeDialogOpen, isEditNodeDialogOpen, isEditEdgeDialogOpen, getNodeDimension, containerWidth, findExistingEdge, screenToWorld, scale, offsetX, offsetY, saveNodesToLocalStorage, saveEdgesToLocalStorage]);


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
    } else { changed = true; } 

    if (changed) {
      const timeoutId = setTimeout(() => setNodes(repulsedNodes), 50); 
      return () => clearTimeout(timeoutId);
    }
  }, [nodes, activeInteractionNodeId, applyRepulsion, containerWidth]); 

  useEffect(() => {
    if (nodes.length < 2 || containerWidth === 0 || !activeInteractionNodeId) return; 

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
      const timeoutId = setTimeout(() => {
        setNodes(currentNodes => currentNodes.map(cn => {
            if (cn.id === activeInteractionNodeId) return cn; 
            const rn = repulsedNodes.find(r => r.id === cn.id);
            return rn || cn; 
        }));
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [nodes, activeInteractionNodeId, applyRepulsion, containerWidth]);


  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  const minScale = 0.1;
  const maxScale = 1.5;

  const screenGridData = useMemo(() => {
    if (!isClient || containerWidth === 0 || CONTAINER_HEIGHT_PX === 0 || scale === 0) {
      return { verticalLines: [], horizontalLines: [] };
    }
    return calculateScreenGridLinePositions(offsetX, offsetY, scale, containerWidth, CONTAINER_HEIGHT_PX);
  }, [isClient, offsetX, offsetY, scale, containerWidth]);
  

  return (
    <main className="flex flex-col items-center justify-start min-h-screen p-4 sm:p-6 md:p-8 lg:p-10 bg-background text-foreground">
      <h1 className="text-3xl font-bold tracking-tight mb-6 text-center">Node Weaver</h1>

      <div className="w-full max-w-3xl flex flex-col items-center gap-4 mb-4">
        <div className="w-full grid grid-cols-3 gap-4 items-center px-2">
            <Label htmlFor="scale-slider" className="text-sm text-right">Zoom: {isClient ? Math.round(scale * 100) : 100}%</Label>
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
            className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible"
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
              zIndex: activeInteractionNodeId === node.id ? 20 : (isDraggingForReposition || isLinkingModeActive ? 15 : 10),
              borderRadius: '9999px', 
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 6px hsla(var(--foreground), 0.1)', 
              transition: 'box-shadow 0.2s ease, transform 0.2s ease', 
              userSelect: 'none', 
              border: '1px solid hsl(var(--border))' 
            };
            if (node.type === 'entity') { 
              nodeStyles.borderColor = 'hsl(var(--ring))'; 
              nodeStyles.borderWidth = '2px';
            }

            if(activeInteractionNodeId === node.id && (isDraggingForReposition || isLinkingModeActive)){
                nodeStyles.boxShadow = '0 10px 15px hsla(var(--foreground), 0.2), 0 0 0 3px hsl(var(--primary))'; 
                nodeStyles.transform = 'scale(1.05)'; 
            }
            
            const minFontSize = 6; 
            const baseNameFontSize = 16; 
            const baseTagFontSize = 10;  

            const dynamicNameFontSizeScreen = Math.max(minFontSize, baseNameFontSize * Math.min(scale, 1)); 
            const dynamicTagFontSizeScreen = Math.max(minFontSize, baseTagFontSize * Math.min(scale, 1));

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
      
      <div className="mt-8 flex gap-4">
        <Dialog open={isCreateNodeDialogOpen} onOpenChange={(isOpen) => {
            setIsCreateNodeDialogOpen(isOpen);
            if (!isOpen) setActiveInteractionNodeId(null); 
        }}>
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

        <Button onClick={loadDataFromLocalStorage} variant="outline" className="shadow-lg text-lg px-6 py-3 rounded-lg">
            <Download className="mr-2 h-5 w-5" />
            Load Data
        </Button>
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
