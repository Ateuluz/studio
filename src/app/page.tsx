
"use client";

import React, { useState, useEffect, useCallback } from "react";
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
import { Plus } from "lucide-react";

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

const CATEGORY_NODE_DIMENSION = 160; // Corresponds to w-40 h-40 (10rem * 16px/rem)
const ENTITY_NODE_DIMENSION = 128;   // Corresponds to w-32 h-32 (8rem * 16px/rem)

const CATEGORY_NODE_SIZE_CLASS = "w-40 h-40";
const ENTITY_NODE_SIZE_CLASS = "w-32 h-32";

const CONTAINER_MAX_WIDTH_PX = 768;
const CONTAINER_HEIGHT_PX = 500;

const PRESS_HOLD_THRESHOLD = 700; // ms for press and hold
const DRAG_MOVE_THRESHOLD = 10; // pixels to differentiate click from drag
const MAX_PLACEMENT_ATTEMPTS = 30; // Max attempts to find a non-overlapping spot

export default function Home() {
  const [nodes, setNodes] = useState<Node[]>([]);

  // Create Node Dialog
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newNodeName, setNewNodeName] = useState("");
  const [newNodeDescription, setNewNodeDescription] = useState("");
  const [newNodeTags, setNewNodeTags] = useState("");
  const [newNodeType, setNewNodeType] = useState<'category' | 'entity'>('category');
  const [newNodeBirthday, setNewNodeBirthday] = useState("");

  // Edit Node Dialog
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const [editNodeName, setEditNodeName] = useState("");
  const [editNodeDescription, setEditNodeDescription] = useState("");
  const [editNodeTags, setEditNodeTags] = useState("");
  const [editNodeBirthday, setEditNodeBirthday] = useState("");

  // Interaction States
  const [activeNodeInteraction, setActiveNodeInteraction] = useState<string | null>(null);
  const [pressHoldTimer, setPressHoldTimer] = useState<NodeJS.Timeout | null>(null);
  const [interactionStartPos, setInteractionStartPos] = useState<{ x: number, y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showSearchBar, setShowSearchBar] = useState(false);


  const createNode = () => {
    if (newNodeName) {
      const tagsArray = newNodeTags.split(',').map(tag => tag.trim()).filter(tag => tag);
      
      let newNodeX = 0;
      let newNodeY = 0;
      let placed = false;
      let attempts = 0;

      const newNodeDimension = newNodeType === 'category' ? CATEGORY_NODE_DIMENSION : ENTITY_NODE_DIMENSION;

      do {
        newNodeX = Math.floor(Math.random() * (CONTAINER_MAX_WIDTH_PX - newNodeDimension));
        newNodeY = Math.floor(Math.random() * (CONTAINER_HEIGHT_PX - newNodeDimension));
        let overlap = false;
        for (const existingNode of nodes) {
          const existingNodeDimension = existingNode.type === 'category' ? CATEGORY_NODE_DIMENSION : ENTITY_NODE_DIMENSION;
          // AABB collision detection (Axis-Aligned Bounding Box)
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
        if (!overlap) {
          placed = true;
        }
        attempts++;
      } while (!placed && attempts < MAX_PLACEMENT_ATTEMPTS);

      if (!placed) {
        // Fallback if no non-overlapping spot is found after max attempts
        // Place it at the last attempted random position, which might overlap.
        // Or, you could place it at a default corner, or notify the user.
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
      setNodes([...nodes, newNodeToAdd]);
      setNewNodeName("");
      setNewNodeDescription("");
      setNewNodeTags("");
      setNewNodeType('category');
      setNewNodeBirthday("");
      setIsCreateDialogOpen(false);
    }
  };

  const openEditDialog = useCallback((node: Node) => {
    setEditingNode(node);
    setEditNodeName(node.name);
    setEditNodeDescription(node.description);
    setEditNodeTags(node.tags.join(', '));
    setEditNodeBirthday(node.birthday || "");
    setIsEditDialogOpen(true);
    setActiveNodeInteraction(null); 
  }, []); 

  const saveNodeChanges = () => {
    if (editingNode && editNodeName) {
      const tagsArray = editNodeTags.split(',').map(tag => tag.trim()).filter(tag => tag);
      setNodes(nodes.map(n =>
        n.id === editingNode.id
        ? {
            ...n,
            name: editNodeName,
            description: editNodeDescription,
            tags: tagsArray,
            birthday: editingNode.type === 'entity' ? editNodeBirthday : undefined
          }
        : n
      ));
      setEditingNode(null);
      setIsEditDialogOpen(false);
    }
  };

  const handleNodeInteractionStart = (
    event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>,
    node: Node
  ) => {
    if (event.type.startsWith('touch')) {
      event.preventDefault(); // Prevent default touch actions like scrolling
    }
  
    setActiveNodeInteraction(node.id);
    const point = 'touches' in event ? event.touches[0] : event;
    setInteractionStartPos({ x: point.clientX, y: point.clientY });
    setIsDragging(false);
  
    if (pressHoldTimer) clearTimeout(pressHoldTimer);
  
    const timer = setTimeout(() => {
      // Check if the interaction is still active on the same node and not dragging
      if (activeNodeInteraction === node.id && !isDragging && !showSearchBar) {
        setShowSearchBar(true); 
        // activeNodeInteraction is kept for search bar context
      }
      setPressHoldTimer(null); // Timer has served its purpose
    }, PRESS_HOLD_THRESHOLD);
    setPressHoldTimer(timer);
  };

  useEffect(() => {
    const handleInteractionMove = (event: MouseEvent | TouchEvent) => {
      if (!activeNodeInteraction || !interactionStartPos) return;

      const point = 'touches' in event ? event.touches[0] : event;
      if (!point) return; 

      const dx = point.clientX - interactionStartPos.x;
      const dy = point.clientY - interactionStartPos.y;

      if (Math.abs(dx) > DRAG_MOVE_THRESHOLD || Math.abs(dy) > DRAG_MOVE_THRESHOLD) {
        setIsDragging(true);
        if (pressHoldTimer) {
          clearTimeout(pressHoldTimer);
          setPressHoldTimer(null);
        }
        // Node dragging logic (repositioning) would go here in a future step
        // For now, just setting isDragging prevents edit/search bar
      }
    };

    const handleInteractionEnd = () => {
      if (pressHoldTimer) {
        clearTimeout(pressHoldTimer);
        setPressHoldTimer(null);
      }

      if (activeNodeInteraction && !isDragging && !showSearchBar) {
        // This was a click/tap without dragging before press-hold threshold or search bar shown
        const node = nodes.find(n => n.id === activeNodeInteraction);
        if (node) {
          openEditDialog(node);
        }
      }
      
      // Reset interaction states
      // activeNodeInteraction is NOT cleared if showSearchBar is true, as search might need context.
      // It's cleared when the search bar is closed or an action is taken from it.
      if (!showSearchBar) {
         setActiveNodeInteraction(null);
      }
      setInteractionStartPos(null);
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleInteractionMove);
    window.addEventListener('mouseup', handleInteractionEnd);
    window.addEventListener('touchmove', handleInteractionMove, { passive: false });
    window.addEventListener('touchend', handleInteractionEnd);

    return () => {
      window.removeEventListener('mousemove', handleInteractionMove);
      window.removeEventListener('mouseup', handleInteractionEnd);
      window.removeEventListener('touchmove', handleInteractionMove);
      window.removeEventListener('touchend', handleInteractionEnd);
      if (pressHoldTimer) clearTimeout(pressHoldTimer);
    };
  }, [activeNodeInteraction, interactionStartPos, pressHoldTimer, nodes, isDragging, showSearchBar, openEditDialog]);


  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  return (
    <main className="flex flex-col items-center justify-start min-h-screen p-4 sm:p-6 md:p-8 lg:p-10 bg-background text-foreground">
      <h1 className="text-3xl font-bold tracking-tight mb-6 text-center">Node Weaver</h1>
      
      <div
        className="relative w-full max-w-4xl border rounded-lg shadow-inner bg-card"
        style={{ height: `${CONTAINER_HEIGHT_PX}px` }}
      >
        {isClient && nodes.map((node) => {
          const nodeSizeClass = node.type === 'category' ? CATEGORY_NODE_SIZE_CLASS : ENTITY_NODE_SIZE_CLASS;
          const nodeDimension = node.type === 'category' ? CATEGORY_NODE_DIMENSION : ENTITY_NODE_DIMENSION;
          const nodeStyles: React.CSSProperties = {
            backgroundColor: "hsl(var(--node-color))",
            left: `${node.x}px`,
            top: `${node.y}px`,
            width: `${nodeDimension}px`,
            height: `${nodeDimension}px`,
            color: "hsl(var(--card-foreground))",
          };
          if (node.type === 'entity') {
            nodeStyles.borderColor = 'hsl(var(--ring))';
            nodeStyles.borderWidth = '2px';
          }

          return (
            <div
              key={node.id}
              className={`absolute p-3 rounded-full flex flex-col items-center justify-center text-center cursor-pointer shadow-xl transition-all duration-300 hover:shadow-2xl hover:scale-105 select-none border`}
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
                setActiveNodeInteraction(null); 
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

      <Dialog open={isCreateDialogOpen} onOpenChange={(isOpen) => {
          setIsCreateDialogOpen(isOpen);
          if (!isOpen) setActiveNodeInteraction(null); 
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
              <Label htmlFor="create-name" className="text-md">Name</Label>
              <Input
                id="create-name"
                placeholder="Node Name (e.g., Project Alpha)"
                value={newNodeName}
                onChange={(e) => setNewNodeName(e.target.value)}
                className="text-md p-3"
              />
            </div>
            <div className="grid gap-3">
                <Label className="text-md">Type</Label>
                <RadioGroup
                    defaultValue="category"
                    onValueChange={(value: 'category' | 'entity') => setNewNodeType(value)}
                    value={newNodeType}
                    className="flex space-x-4 pt-1"
                >
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="category" id="type-category-create" />
                        <Label htmlFor="type-category-create">Category</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="entity" id="type-entity-create" />
                        <Label htmlFor="type-entity-create">Entity</Label>
                    </div>
                </RadioGroup>
            </div>
            {newNodeType === 'entity' && (
              <div className="grid gap-3">
                <Label htmlFor="create-birthday" className="text-md">Birthday</Label>
                <Input
                  id="create-birthday"
                  type="date"
                  value={newNodeBirthday}
                  onChange={(e) => setNewNodeBirthday(e.target.value)}
                  className="text-md p-3"
                />
              </div>
            )}
            <div className="grid gap-3">
              <Label htmlFor="create-description" className="text-md">Description</Label>
              <Input
                id="create-description"
                placeholder="Brief description (optional)"
                value={newNodeDescription}
                onChange={(e) => setNewNodeDescription(e.target.value)}
                className="text-md p-3"
              />
            </div>
            <div className="grid gap-3">
              <Label htmlFor="create-tags" className="text-md">Tags</Label>
              <Input
                id="create-tags"
                placeholder="tag1, tag2 (comma-separated, optional)"
                value={newNodeTags}
                onChange={(e) => setNewNodeTags(e.target.value)}
                className="text-md p-3"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" className="text-md px-5 py-2.5">Cancel</Button>
            </DialogClose>
            <Button type="submit" onClick={createNode} className="bg-primary text-primary-foreground hover:bg-primary/90 text-md px-5 py-2.5">
              Create Node
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editingNode && (
        <Dialog open={isEditDialogOpen} onOpenChange={(isOpen) => {
            setIsEditDialogOpen(isOpen);
            if (!isOpen) {
                setEditingNode(null); 
                setActiveNodeInteraction(null);
            }
        }}>
          <DialogContent className="sm:max-w-[480px] bg-background text-foreground border-border shadow-2xl rounded-lg">
            <DialogHeader>
              <DialogTitle className="text-2xl">Edit Node: {editingNode.name}</DialogTitle>
              <DialogDescription>Modify the attributes of this node. Click save when you're done.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-6">
              <div className="grid gap-3">
                <Label htmlFor="edit-name" className="text-md">Name</Label>
                <Input
                  id="edit-name"
                  value={editNodeName}
                  onChange={(e) => setEditNodeName(e.target.value)}
                  className="text-md p-3"
                />
              </div>
              <div className="grid gap-3">
                <Label className="text-md">Type</Label>
                <p className="text-md p-3 bg-muted/50 rounded-md border border-input capitalize select-none">
                    {editingNode?.type}
                </p>
              </div>
              {editingNode?.type === 'entity' && (
                <div className="grid gap-3">
                  <Label htmlFor="edit-birthday" className="text-md">Birthday</Label>
                  <Input
                    id="edit-birthday"
                    type="date"
                    value={editNodeBirthday}
                    onChange={(e) => setEditNodeBirthday(e.target.value)}
                    className="text-md p-3"
                  />
                </div>
              )}
              <div className="grid gap-3">
                <Label htmlFor="edit-description" className="text-md">Description</Label>
                <Input
                  id="edit-description"
                  value={editNodeDescription}
                  onChange={(e) => setEditNodeDescription(e.target.value)}
                  className="text-md p-3"
                />
              </div>
              <div className="grid gap-3">
                <Label htmlFor="edit-tags" className="text-md">Tags</Label>
                <Input
                  id="edit-tags"
                  value={editNodeTags}
                  onChange={(e) => setEditNodeTags(e.target.value)}
                  placeholder="tag1, tag2 (comma-separated)"
                  className="text-md p-3"
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                 <Button variant="outline" onClick={() => {
                     setIsEditDialogOpen(false);
                     setEditingNode(null);
                     setActiveNodeInteraction(null);
                    }} className="text-md px-5 py-2.5">Cancel</Button>
              </DialogClose>
              <Button type="submit" onClick={saveNodeChanges} className="bg-primary text-primary-foreground hover:bg-primary/90 text-md px-5 py-2.5">
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </main>
  );
}
