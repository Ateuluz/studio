
# **Node Weaver Application Documentation**

## 1. Introduction

**Purpose:** Node Weaver is a visual application designed for creating, connecting, and organizing information in the form of nodes and edges. It provides an interactive canvas where users can map out concepts, entities, and their relationships.

**Core Features Overview:**
*   **Node Creation & Management:** Users can create nodes, define their attributes (name, description, tags, type, birthday), edit them, and delete them. Node names are unique.
*   **Edge Creation & Management:** Nodes can be linked by edges, which can also have attributes (tags with optional dates). Edges can be edited and deleted.
*   **Node Types:** Nodes can be designated as 'category' or 'entity', influencing their visual appearance and available attributes.
*   **Interactive Canvas:** A pannable and zoomable canvas displays the nodes and edges. Supports mouse drag, quick-press for node creation, and pinch-to-zoom.
*   **Node Repulsion:** Nodes automatically repel each other to avoid visual overlap.
*   **Persistence:** Node and edge data is saved to JSON files (`data/nodes.json`, `data/edges.json`) on the server-side (phone storage when run via Termux) using Next.js Server Actions.
*   **Data Backup/Restore:** Functionality to download all graph data as a single JSON file and upload a JSON file to restore/replace graph data.
*   **Visual Styling:** A dark theme with specific accent colors for clarity and aesthetic appeal.
*   **"Main" Node Centering:** On load, if a node is tagged "Main", the graph is re-centered so this node is at world (0,0) and the viewport focuses on it.
*   **Layout Lock Mode:** Disables node repositioning and creation, allowing safe canvas navigation.
*   **Focus Mode:** Provides a focused view starting from a selected node (default "Main" or first node), showing only it and its direct neighbors. Clicking nodes in this mode toggles the visibility of their respective neighbors. Layout is locked in this mode.
*   **Modular Hooks:** Core functionalities like viewport management (`useViewportManager`) and node interactions (`useNodeInteractions`) are encapsulated in custom React hooks.

## 2. Core Concepts & Data Structures

### 2.1. Nodes
Nodes are the primary elements representing pieces of information or entities.

*   **Attributes (`Node` interface in `src/lib/types.ts`):**
    *   `id: string` (Unique identifier, e.g., `crypto.randomUUID()`)
    *   `name: string` (Display name of the node, must be unique)
    *   `description: string` (A brief description)
    *   `tags: string[]` (An array of string tags, e.g., `["Main", "ProjectX"]`)
    *   `x: number` (World X-coordinate of the node's top-left corner)
    *   `y: number` (World Y-coordinate of the node's top-left corner)
    *   `type: 'category' | 'entity'` (Determines behavior and appearance)
    *   `birthday?: string` (Optional, YYYY-MM-DD format, applicable if `type` is 'entity')

*   **Visual Representation:**
    *   Shape: Round.
    *   Color: `hsl(var(--node-color))` (Soft Blue).
    *   Size: Differentiated by `type`. 'Category' nodes are larger than 'entity' nodes.
        *   `CATEGORY_NODE_DIMENSION = 160` (world units)
        *   `ENTITY_NODE_DIMENSION = 128` (world units)
    *   Border: 'Entity' nodes have a distinct, brighter border (`hsl(var(--ring))`).
    *   Content: Displays the node's `name` and up to two of its `tags`. Font size adjusts dynamically with canvas zoom.

### 2.2. Edges
Edges represent relationships or connections between two nodes.

*   **Attributes (`Edge` interface in `src/lib/types.ts`):**
    *   `id: string` (Unique identifier)
    *   `sourceNodeId: string` (ID of the starting node)
    *   `targetNodeId: string` (ID of the ending node)
    *   `tags: EdgeTag[]` (An array of `EdgeTag` objects)

*   **`EdgeTag` Object Structure (`EdgeTag` interface in `src/lib/types.ts`):**
    *   `name: string` (Name of the tag for the edge)
    *   `date?: string` (Optional, YYYY-MM-DD format, specific to this tag on this edge)

*   **Visual Representation:**
    *   Drawn as straight SVG lines connecting the visual centers of the source and target nodes.
    *   Color: `hsl(var(--ring))` (Teal).
    *   Stroke width: Dynamically adjusted based on canvas zoom for consistent on-screen thickness.

### 2.3. World Coordinates
A conceptual 2D plane where all nodes exist. Node `x` and `y` attributes are in this coordinate system. This system is independent of the screen.

### 2.4. Viewport / Display Box
The rectangular area on the user's screen. Its dimensions (`containerWidth`, `containerHeight`) are determined dynamically.

### 2.5. Pan & Zoom
Managed by `useViewportManager` hook.
*   `scale: number`: Current zoom level (logarithmic, e.g., 0.02 to 1.2).
*   `offsetX: number`, `offsetY: number`: Screen pixel offsets for panning.

## 3. Application Architecture (High-Level)

*   **Frontend:** Next.js, React, TypeScript, ShadCN UI components, Tailwind CSS.
*   **State Management:** React hooks (`useState`, `useCallback`, `useEffect`, `useMemo`, `useRef`) and custom hooks for modularity.
    *   `useViewportManager`: Handles pan, zoom, viewport dimensions, pan limits, coordinate conversions.
    *   `useNodeInteractions`: Manages direct interactions with nodes (click, drag, press-hold, linking).
    *   `useFocusModeManager`: Manages states and logic for Focus Mode.
*   **Data Persistence:** Server Actions (`src/app/data-actions.ts`) interact with the file system (`data/nodes.json`, `data/edges.json`).
*   **Event Handling:** Complex event handling for canvas gestures (pan, pinch-zoom, quick-press) and node-specific interactions.

## 4. Key Functionalities & Algorithms

### 4.1. Node Management (`src/app/page.tsx`, dialogs)

#### Node Creation
*   **Triggers:** "Create New Node" button or quick press on canvas background.
*   **Dialog:** Prompts for `name`, `description`, `tags`, `type`, `birthday`.
*   **Uniqueness:** Node name must be unique (case-insensitive) and not empty. "Main" tag is unique.
*   **Placement:** If quick press, placed at tap location. Otherwise, random within viewport, attempting to avoid overlap (`MAX_PLACEMENT_ATTEMPTS = 30`).
*   Data saved via server action.

#### Node Editing
*   **Trigger:** Simple click/tap on a node (if not in Focus Mode or Layout Lock drag-to-pan).
*   **Dialog:** Modifies attributes. Type is not editable. "Main" tag uniqueness enforced.
*   **Connect to Node Search:** Within Edit Node dialog, allows searching for other nodes to create/edit edges.
*   Data saved via server action.

#### Node Deletion
*   **Trigger:** "Delete Node" button in Edit Node dialog.
*   Removes node and connected edges. Data saved via server action.

#### Node Rendering
*   `getNodeDimension` helper function. Nodes are `div`s. Dynamic font sizing for readability.

### 4.2. Edge Management (`src/app/page.tsx`, dialogs)

#### Edge Creation/Editing
*   **Triggers:**
    1.  Press-Hold on source node & Drag to target node.
    2.  Dragging a node (repositioning) and dropping onto another node.
    3.  Via "Connect to Node" search in Edit Node dialog.
*   `findExistingEdge` utility.
*   **Dialogs:** "Create Edge" or "Edit Edge" dialog opens. Prompts for `tags` (format: `tag one (YYYY-MM-DD), tag two`).
*   Utility functions `parseTagsWithDates`, `formatTagsWithDates`.
*   Data saved via server action.

#### Edge Deletion
*   **Trigger:** "Delete Edge" button in Edit Edge dialog. Saved via server action.

#### Edge Rendering
*   SVG `<line>` elements within a transformed SVG container that uses `overflow="visible"`.

### 4.3. User Interaction Handling (Canvas & Nodes)

Managed by `interactionMode` state in `page.tsx` and logic within `useNodeInteractions` and global event listeners in `page.tsx`.

*   **Node Interactions (`useNodeInteractions`)**:
    *   Detects click, press-hold (for linking/search - though search on press-hold node is currently superseded by Focus Mode's click-to-toggle), and drag.
    *   `handleNodeInteractionStart`, `handleNodeInteractionMove`, `handleNodeInteractionEnd`.
    *   Manages `activeInteractionNodeId`, `linkingLinePreview`, etc.
*   **Canvas Background Interactions (`page.tsx` global listeners):**
    *   **Pan:** Click & drag on empty canvas updates `offsetX`, `offsetY`.
    *   **Quick Press:** Tap on empty canvas opens "Create Node" dialog at tap location (if Layout Lock/Focus Mode off).
    *   **Pinch-to-Zoom:** Two-finger gesture updates `scale`, `offsetX`, `offsetY` centered on pinch.
*   **State Exclusivity:** Logic in place to clear conflicting interaction states (e.g., pinch-zoom overrides node interaction).

### 4.4. Canvas Pan & Zoom (`useViewportManager`)

*   **Transformations:** A main `div` (`transformedContentRef`) has CSS `transform: translate() scale()` applied.
*   **Coordinate Conversion:** `screenToWorld` utility.
*   **Sliders:** For Zoom (logarithmic), Pan X, Pan Y. Zoom slider centers on viewport middle.
*   **Dynamic Pan Limits:** Calculated based on content bounding box + 50% viewport padding (adjusted for scale). Content centers if it's smaller than viewport. Limits are stable during active node drag or pinch-zoom.

### 4.5. Background Grid (`src/app/page.tsx`)

*   **Screen-Space Grid:** Rendered in a separate SVG, fixed to the screen (does not pan/zoom with content).
*   Line positions are calculated based on world pan/zoom but drawn in screen coordinates.
*   Line lengths match display box dimensions. Density adapts to zoom level.

### 4.6. Node Repulsion (`src/app/page.tsx`)

*   `applyRepulsion` function iterates to prevent overlaps (`MIN_SEPARATION`), using `REPULSION_STRENGTH`.
*   `fixedNodeId` (active node) is not repelled and doesn't exert force.
*   Paused if Layout Lock or Focus Mode is active.
*   Repulsed positions are saved to persistence.

### 4.7. Persistence (`src/app/data-actions.ts`)

*   **Server Actions:** `loadNodesFromFile`, `saveNodesToFile`, `loadEdgesFromFile`, `saveEdgesToFile`.
*   Uses Node.js `fs` module to read/write `data/nodes.json` and `data/edges.json`.
*   Attempts to create `data` directory if it doesn't exist.
*   Data is loaded on mount and saved after most modifications (creation, edit, deletion, repositioning, repulsion results).

### 4.8. Data Backup/Restore (`src/app/api/download-all-data/route.ts`, `page.tsx`)

*   **Download:** API route `/api/download-all-data` serves `nodes.json` and `edges.json` combined into one `node_weaver_data.json`.
*   **Upload:** Button allows selecting a JSON file. If valid, replaces current graph data and saves to server files.

### 4.9. UI Modes

#### Layout Lock
*   Toggled via Switch in slider panel.
*   Disables node repositioning (drag becomes background pan if originating on a node).
*   Disables node creation (button and quick-press).
*   Node editing via click remains enabled.

#### Focus Mode (`useFocusModeManager`)
*   Toggled via Switch in slider panel. Forces Layout Lock ON.
*   **Activation:** Centers view on "Main" (or first) node.
*   **Visibility:**
    *   `focusModeStartNodeId` is always visible.
    *   Nodes in `focusModeExpandedNodeIds` are visible.
    *   Direct neighbors of any node in `focusModeExpandedNodeIds` are visible.
    *   Edges are shown only if both connected nodes are visible.
*   **Interaction:** Clicking a visible node (not the start node) toggles its presence in `focusModeExpandedNodeIds`, updating visibility. Node editing is disabled.
*   **Deactivation:** If no nodes are expanded (besides potentially the start node if logic allowed it to be un-expanded), or manually toggled off. Restores normal view, keeps current pan/zoom.

## 5. UI Components (ShadCN, `lucide-react`)

*   `Button`, `Dialog`, `Input`, `Label`, `RadioGroup`, `Textarea`, `Slider`, `ScrollArea`, `Separator`, `Switch`, `Toaster`, various icons.
*   Custom collapsible panels for sliders and action buttons.

## 6. Styling (`src/app/globals.css`)

*   Tailwind CSS.
*   Dark theme defined with CSS HSL variables.

## 7. Termux Setup (`termux_setup` folder)
*   Scripts and README provided for running the application on Android via Termux, including:
    *   `install_deps.sh`: Installs Node.js, npm, git.
    *   `start_nodeweaver.sh`: Runs the Next.js dev server, configured for network access (`-H 0.0.0.0 -p 9002`), and attempts to auto-open URL.
    *   `README_termux.md`: Setup instructions, shortcut usage.

This documentation should provide a solid overview for understanding and potentially re-implementing the Node Weaver application.

    