/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { InstancedMesh } from 'three';

/** Slots follow their matrix/colour when reordered; simulation ids never move. */
export interface VisibleInstanceSlot { index: number; visibleForView: boolean }

/** Pack an existing allocation in place, before WebGLObjects uploads it.
 * No extra mesh, shader, GPU buffer or per-view allocation. Restore count after
 * the draw; the next pane independently selects from the complete slot list. */
export function compactVisibleInstances<T extends VisibleInstanceSlot>(mesh: InstancedMesh, slots: T[]): void {
  const matrices = mesh.instanceMatrix.array, colours = mesh.instanceColor?.array;
  let count = 0, swapped = false;
  for (let index = 0; index < slots.length; index++) {
    const slot = slots[index];
    if (!slot.visibleForView) continue;
    if (index !== count) {
      const other = slots[count];
      for (let word = 0; word < 16; word++) {
        const a = index * 16 + word, b = count * 16 + word, value = matrices[a];
        matrices[a] = matrices[b]; matrices[b] = value;
      }
      if (colours) for (let word = 0; word < 3; word++) {
        const a = index * 3 + word, b = count * 3 + word, value = colours[a];
        colours[a] = colours[b]; colours[b] = value;
      }
      slots[count] = slot; slots[index] = other; slot.index = count; other.index = index;
      swapped = true;
    }
    count++;
  }
  mesh.count = count;
  if (swapped) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}
