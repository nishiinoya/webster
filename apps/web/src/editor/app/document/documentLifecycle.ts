import { Camera2D } from "../../geometry/Camera2D";
import { Scene } from "../../scene/Scene";
import { InputController } from "../../tools/input/InputController";

type ReplaceSceneOptions = {
  disposeCurrent?: boolean;
  rememberActiveDocument?: boolean;
};

/**
 * Creates an empty editor scene for a blank document.
 */
export function createBlankDocumentScene(width: number, height: number) {
  return new Scene({
    createDefaultLayer: false,
    documentHeight: height,
    documentWidth: width
  });
}

/**
 * Swaps the active scene and updates camera/input bindings around the new document.
 */
export function replaceEditorScene(input: {
  camera: Camera2D;
  currentScene: Scene;
  inputController: InputController;
  nextScene: Scene;
  notifyCameraChange: () => void;
  disposeCurrent?: boolean;
}) {
  if (input.nextScene === input.currentScene) {
    return input.currentScene;
  }

  if (input.disposeCurrent ?? true) {
    input.currentScene.dispose();
  }

  input.camera.setBounds(input.nextScene.document);
  input.inputController.setScene(input.nextScene);
  input.notifyCameraChange();

  return input.nextScene;
}

/**
 * Switches the active document tab, creating a blank scene for the tab when needed.
 */
export function switchEditorDocument(input: {
  activeDocumentId: string | null;
  currentScene: Scene;
  document: { height: number; id: string; width: number };
  replaceScene: (nextScene: Scene, options?: ReplaceSceneOptions) => Scene;
  tabScenes: Map<string, Scene>;
}) {
  if (input.activeDocumentId === input.document.id) {
    return {
      activeDocumentId: input.activeDocumentId,
      scene: input.currentScene
    };
  }

  if (input.activeDocumentId) {
    input.tabScenes.set(input.activeDocumentId, input.currentScene);
  }

  let nextScene = input.tabScenes.get(input.document.id);

  if (!nextScene) {
    nextScene = createBlankDocumentScene(input.document.width, input.document.height);
    input.tabScenes.set(input.document.id, nextScene);
  }

  const scene = input.replaceScene(nextScene, {
    disposeCurrent: false,
    rememberActiveDocument: false
  });

  return {
    activeDocumentId: input.document.id,
    scene
  };
}

/**
 * Records the currently active scene under a document id.
 */
export function rememberEditorDocument(
  tabScenes: Map<string, Scene>,
  documentId: string,
  scene: Scene
) {
  tabScenes.set(documentId, scene);
  return documentId;
}

/**
 * Removes a remembered document and disposes its scene when it is no longer active.
 */
export function forgetEditorDocument(input: {
  activeDocumentId: string | null;
  documentId: string;
  tabScenes: Map<string, Scene>;
  currentScene: Scene;
}) {
  const scene = input.tabScenes.get(input.documentId);

  if (scene && scene !== input.currentScene) {
    scene.dispose();
  }

  input.tabScenes.delete(input.documentId);

  return input.activeDocumentId === input.documentId ? null : input.activeDocumentId;
}