# Editor Refactor Roadmap

This roadmap is the preparation phase for a full undo/redo system.

The goal is to make the editor code easier to understand, safer to change, and easier to document before we introduce a command history layer that will touch many parts of the app.

## Why Do This First

The current editor already has clear subsystems, but several files have grown into mixed-responsibility modules:

- `apps/web/src/editor/rendering/Renderer.ts`
- `apps/web/src/editor/scene/Scene.ts`
- `apps/web/src/editor/app/EditorApp.ts`
- `apps/web/src/editor/ui/EditorPage.tsx`

Large mixed-responsibility files make future work harder in a few ways:

- it is harder to see where state actually changes
- it is harder to add tests around isolated behavior
- it is harder to attach consistent function documentation
- it is harder to define undoable commands with clean ownership

The refactor should make each subsystem easier to reason about without changing editor behavior.

## Main Principles

Use these rules during the refactor:

1. Split by responsibility, not by line count.
2. Extract pure helpers before extracting stateful orchestration.
3. Keep public behavior unchanged while moving code.
4. Prefer small focused modules over one replacement "mega file".
5. Add documentation after boundaries stabilize.
6. Run typecheck after each phase.

## Phase Overview

### Phase 0: Create A Refactor Map

Before moving code, create a lightweight inventory for each large file:

- what state it owns
- which methods mutate state
- which methods only compute values
- which methods talk to browser APIs or WebGL
- which methods will likely become undoable commands later

Deliverable:

- a short internal note at the top of the file or in a follow-up docs file describing file responsibilities and target extraction areas

Reason:

- this avoids doing a cosmetic split that still leaves the hard coupling in place

### Phase 1: Refactor `Renderer.ts`

Current role:

- owns WebGL setup and resource lifetime
- orchestrates scene rendering
- renders overlays
- renders text, image, shape, and stroke layers
- manages post-process passes
- contains many geometry and filter helper functions

Target outcome:

- one smaller renderer coordinator file
- specialized rendering modules grouped by concern
- pure helper utilities moved out of the class file

Suggested target structure:

```text
apps/web/src/editor/rendering/
  Renderer.ts
  core/
    RenderTargets.ts
    RendererTypes.ts
  pipeline/
    PostProcessPipeline.ts
  overlays/
    EditorOverlayRenderer.ts
  layers/
    LayerRenderer.ts
    ImageLayerRenderer.ts
    ShapeLayerRenderer.ts
    StrokeLayerRenderer.ts
    TextLayerRenderer.ts
  primitives/
    ShapePrimitives.ts
  strokes/
    strokeGeometry.ts
  filters/
    layerFilters.ts
```

Recommended extraction order:

1. Move pure helper functions first.
2. Move stroke geometry generation.
3. Move filter combination and blur-region helpers.
4. Move primitive drawing helpers.
5. Move layer-specific rendering code.
6. Move overlay rendering.
7. Keep `Renderer.ts` as the top-level coordinator and resource owner.

Likely module boundaries:

- `Renderer.ts`
  Keeps `create`, constructor, `resize`, `render`, `renderToSize`, `dispose`, and high-level orchestration.
- `core/RenderTargets.ts`
  Owns framebuffer and texture creation, reuse, and disposal helpers.
- `pipeline/PostProcessPipeline.ts`
  Owns post-process rendering flow and blur-region application.
- `overlays/EditorOverlayRenderer.ts`
  Owns canvas border, selection outlines, and transform handles.
- `layers/*`
  Owns image, shape, stroke, and text rendering details.
- `primitives/ShapePrimitives.ts`
  Owns lower-level drawing helpers and shared vertex upload helpers.
- `strokes/strokeGeometry.ts`
  Owns mesh generation, caps, joins, and point simplification.
- `filters/layerFilters.ts`
  Owns filter merging, scaling, and blur-region calculations.

What success looks like:

- `Renderer.ts` becomes a readable entry point
- render flow reads top-to-bottom
- helper modules are reusable and individually testable later
- WebGL resource ownership remains centralized

### Phase 2: Refactor `Scene.ts`

Current role:

- document model
- layer storage
- layer mutation methods
- hit testing
- serialization
- duplication and disposal helpers
- mask actions and document resizing helpers

Target outcome:

- keep `Scene` as the document state owner
- move non-core helpers into dedicated modules
- make all mutation paths easy to identify

Suggested target structure:

```text
apps/web/src/editor/scene/
  Scene.ts
  SceneTypes.ts
  sceneSerialization.ts
  sceneHitTesting.ts
  sceneLayerCloning.ts
  sceneMaskActions.ts
  sceneResize.ts
  sceneSummaries.ts
```

Recommended extraction order:

1. Serialization and deserialization helpers.
2. Layer summary creation.
3. Layer cloning and disposal helpers.
4. Hit-testing helpers.
5. Mask action helpers.
6. Document resize helpers.

What success looks like:

- `Scene` exposes a clean set of mutation methods
- helper logic is no longer mixed into the main class body
- future undo/redo commands can target `Scene` methods more directly

### Phase 3: Refactor `EditorApp.ts`

Current role:

- central app coordinator
- active document switching
- tool dispatch
- camera management
- text editing state
- image import/export
- project import/export
- command routing to scene and selection systems

Target outcome:

- `EditorApp` stays as the top-level editor orchestrator
- move feature-specific workflows into helper modules or controllers
- isolate text editing and import/export from tool and document orchestration

Suggested target structure:

```text
apps/web/src/editor/app/
  EditorApp.ts
  document/
    DocumentManager.ts
    documentExport.ts
    documentImport.ts
  text/
    TextEditingController.ts
  image/
    imageLayerOperations.ts
  commands/
    applyLayerCommand.ts
    applyDocumentCommand.ts
    applySelectionCommand.ts
```

Recommended extraction order:

1. Export helpers and PDF creation helpers.
2. Image import and image-layer resample helpers.
3. Text editing helpers and caret/selection behavior.
4. Command dispatch helpers.
5. Document switching and persistence helpers.

What success looks like:

- `EditorApp` becomes easier to scan
- text editing no longer hides inside unrelated app logic
- import/export code becomes testable and replaceable
- command boundaries become more visible for undo/redo

### Phase 4: Refactor `EditorPage.tsx`

Current role:

- page layout
- document tabs
- side panel sizes
- file opening flows
- dialog wiring
- action callbacks
- some local utility logic

Target outcome:

- page component focuses on composition
- reusable hooks own stateful UI behavior
- utility logic moves out of the component file

Suggested target structure:

```text
apps/web/src/editor/ui/
  EditorPage.tsx
  hooks/
    useEditorTabs.ts
    useEditorLayoutState.ts
    useProjectOpenActions.ts
    usePanelResize.ts
  utils/
    editorFileNames.ts
    imageDimensions.ts
```

Recommended extraction order:

1. Utility functions.
2. Panel resize logic.
3. Tab lifecycle logic.
4. File/project open flows.
5. Dialog orchestration helpers if needed.

What success looks like:

- `EditorPage.tsx` reads like a layout file instead of an app controller
- hooks expose clear UI responsibilities
- future UI changes affect fewer unrelated lines

### Phase 5: Add Documentation

Once module boundaries are stable, add JSDoc comments.

Add docs in this order:

1. public functions and exported helpers
2. mutation methods
3. browser/WebGL boundary methods
4. private helpers only when behavior is not obvious

Recommended comment style:

```ts
/**
 * Renders the provided scene into the current canvas.
 * Expects the renderer to be initialized and sized.
 * Draws directly to WebGL and does not return a value.
 */
render(scene: Scene, camera: Camera2D, options: RenderOptions): void
```

Each useful doc block should answer:

- what the function does
- what inputs it expects
- what it returns
- whether it mutates state
- whether it has important side effects

Documentation rules:

- keep docs short and factual
- avoid repeating the type signature in prose
- document invariants and side effects, not obvious syntax
- prioritize exported APIs and mutation points

### Phase 6: Prepare For Undo/Redo

After the refactor, identify command boundaries for:

- layer create/delete/duplicate/reorder
- layer transform changes
- layer property changes
- text insert/delete/selection edits
- mask operations
- stroke creation and stroke continuation
- canvas resize
- selection changes

Target outcome:

- one command object per user action
- clear `do` and `undo` boundaries
- scene and editor mutations routed through explicit command handlers

This phase should start only after the main refactor because the refactor will reveal the right ownership boundaries.

## Practical Checklist

Use this checklist while doing the work:

- [ ] Inventory responsibilities in each large file
- [ ] Refactor `Renderer.ts` pure helpers first
- [ ] Refactor `Renderer.ts` layer-specific rendering modules
- [ ] Refactor `Scene.ts` helpers out of the class file
- [ ] Refactor `EditorApp.ts` workflows into focused modules
- [ ] Refactor `EditorPage.tsx` into hooks and utilities
- [ ] Add JSDoc comments for exported APIs and mutation methods
- [ ] Run `npm run typecheck` after each phase
- [ ] Recheck imports and remove dead code after each phase
- [ ] Start undo/redo design only after mutation boundaries are clear

## Recommended Next Step

The best first implementation step is:

1. refactor `apps/web/src/editor/rendering/Renderer.ts`
2. begin with pure helper extraction only
3. leave runtime behavior untouched
4. run typecheck
5. then continue with layer-specific rendering modules

This gives the biggest readability win with the lowest immediate risk.
