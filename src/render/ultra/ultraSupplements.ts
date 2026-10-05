/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import type { UltraBuildContext } from './ultraTypes.ts';
import { ultraSupplementMaterial } from './ultraMaterials.ts';

interface Binding {
  readonly mesh: THREE.Mesh;
  readonly ordinary: THREE.MeshStandardMaterial;
  readonly enriched: THREE.MeshStandardMaterial;
}

/** One material overlay for world-owned display groups. No geometry, maps,
 * lights, actors or clocks are duplicated, and ordinary owners remain intact. */
export class UltraSupplements {
  private roots: readonly THREE.Object3D[] = [];
  private context: UltraBuildContext | null = null;
  private bindings: Binding[] = [];

  setRoots(roots: readonly THREE.Object3D[]): void {
    this.restore();
    this.roots = roots;
    this.context = null;
  }

  sync(context: UltraBuildContext | null): void {
    if (this.context === context) return;
    this.restore();
    this.context = context;
    if (context === null) return;
    const clones = new Map<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>();
    for (const root of this.roots) root.traverse(object => {
      if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial)) return;
      const ordinary = object.material;
      let enriched = clones.get(ordinary);
      if (!enriched) {
        enriched = ultraSupplementMaterial(ordinary, context, object.name === 'street-life-paving');
        clones.set(ordinary, enriched);
      }
      object.material = enriched;
      this.bindings.push({ mesh: object, ordinary, enriched });
    });
  }

  materialOwners(): number {
    return new Set(this.bindings.map(binding => binding.enriched)).size;
  }

  /** Borrowed by the runtime's cache-release walk; this owner frees its clones. */
  programOwnerRoots(): readonly THREE.Object3D[] { return this.roots; }

  private restore(): void {
    const owners = new Set<THREE.Material>();
    for (const binding of this.bindings) {
      binding.mesh.material = binding.ordinary;
      owners.add(binding.enriched);
    }
    for (const material of owners) material.dispose();
    this.bindings = [];
  }

  dispose(): void {
    this.restore();
    this.context = null;
    this.roots = [];
  }
}
