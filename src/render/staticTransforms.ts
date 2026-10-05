/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { Object3D } from 'three';

/** Capture world matrices after attachment, then stop recalculating verified
 * static transforms in every colour/shadow/pane pass. An excluded branch keeps
 * its ordinary dynamic update path (the terrain backstop follows the rider).
 * The caller owns the promise that parents and all frozen transforms stay put. */
export function freezeStaticTransforms(root: Object3D, dynamic?: (object: Object3D) => boolean): void {
  root.updateWorldMatrix(true, true);
  const freeze = (object: Object3D): void => {
    if (dynamic?.(object)) return;
    object.matrixAutoUpdate = false; object.matrixWorldAutoUpdate = false;
    for (const child of object.children) freeze(child);
  };
  freeze(root);
}
