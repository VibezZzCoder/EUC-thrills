/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** A sealed epoch owns placement and same-slot controller-replacement boundaries. */
export interface PopulationOwnerSerial { readonly id: string; readonly serial: number; readonly controller?: object }
export class PopulationOwnerSerialHistory {
  private readonly committed = new Map<string, { readonly serial: number; readonly controller: object | undefined }>();
  begin(owners: readonly PopulationOwnerSerial[]): ReadonlySet<string> {
    const seen = new Set<string>(), changed = new Set<string>();
    for (const owner of owners) {
      if (!owner.id || seen.has(owner.id) || !Number.isSafeInteger(owner.serial) || owner.serial < 0) throw new Error('Owner serial history needs distinct finite nonnegative integer identities');
      seen.add(owner.id); const prior = this.committed.get(owner.id);
      if (prior !== undefined && (prior.serial !== owner.serial || prior.controller !== owner.controller)) changed.add(owner.id);
    }
    return changed;
  }
  seal(owners: readonly PopulationOwnerSerial[]): void {
    this.begin(owners); this.committed.clear();
    for (const owner of owners) this.committed.set(owner.id, { serial: owner.serial, controller: owner.controller });
  }
  clear(): void { this.committed.clear(); }
}
