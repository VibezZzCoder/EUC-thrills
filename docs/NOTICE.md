# Notices, Licensing, and Disclaimers

## Origin

*EUC Thrills* is an original work by **VibezZzCoder** — <https://github.com/VibezZzCoder>.

| | |
|---|---|
| Source | <https://github.com/VibezZzCoder/EUC-thrills> |
| Play | <https://vibezzzcoder.github.io/EUC-thrills/> |
| Copyright | © 2026 VibezZzCoder |

The same origin is carried inside the build itself — as a banner at the top of the bundled script, as `author`, `canonical`, and `code-repository` metadata in the page, and as one line printed to the browser console at startup — so that a copy of the published files still says where it came from.

**Forking is welcome.** That is what the MIT licence is for, and no permission needs to be asked. What the licence does require of every copy, including a fork that renames the game, is that this notice and the copyright line above travel with it. Presenting this work, or a lightly modified version of it, as an original creation is a licence violation regardless of how automated the copying was.

## Licensing

**Source code** in this project is released under the MIT License. See `LICENSE`.

**Original game assets** authored for this project — 3D models, textures, materials, procedurally generated geometry and audio, and UI art — are released under
[Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).

The two licences are stated separately on purpose: MIT is a software licence and does not read sensibly when applied to models, textures, and sound. If you reuse one but not the other, the terms are unambiguous.

**One limit belongs here rather than in a footnote.** A CC BY 4.0 grant conveys this project's own rights in the assets this project authored. It does not convey — and cannot convey — rights in a real person's name, likeness, or persona. Red Rider is a real person appearing with his permission; the licence above does not extend to his identity. See *Reference material* below.

## Third-party software

| Dependency | Version | Licence |
|---|---|---|
| [three.js](https://threejs.org/) | 0.185.1 | MIT |

Development-only tooling (TypeScript, Vite, Playwright, Node type definitions) is not redistributed with the game.

## Third-party audio recordings

Four sound loops in the game derive from public-domain recordings. CC0 requires no attribution; these are recorded as provenance, and they are **not** covered by the CC BY 4.0 claim over this project's original assets above.

| Shipped file | Derived from | Licence |
|---|---|---|
| `tyre_offroad_loop` (offroad tyre bed) | ["VEHBike-TASCAMX8_bike dirt road" by gadesound](https://freesound.org/people/gadesound/sounds/697049/), Freesound #697049 | CC0 / public domain |
| `wind_howl_loop` (wind bed) | ["wind_howl2_stereo" by swiftoid](https://freesound.org/people/swiftoid/sounds/117611/), Freesound #117611 | CC0 / public domain |
| `siren_far_loop` (chase siren, far) | ["Police Siren" by TitanKaempfer](https://freesound.org/people/TitanKaempfer/sounds/746302/), Freesound #746302 | CC0 / public domain |
| `siren_close_loop` (chase siren, close) | ["police siren.wav" by vlammenos](https://freesound.org/people/vlammenos/sounds/52906/), Freesound #52906 | CC0 / public domain |

All four were trimmed, filtered, loop-processed, and level-matched for the game. The per-file processing chain is recorded in the project's development tree, which is not part of this distribution; the summary above is the complete provenance a redistributor needs.

The other two loops are original and are covered by the CC BY 4.0 claim above: `crash_wipeout` is the project owner's own recording — including his own voice, used with his approval — and `tyre_solid_loop` (the tyre rotation) is synthesized from scratch with no external source.

`overspeed_beep` (the max-speed warning) is original and is covered by the CC BY 4.0 claim, and the reason is worth stating because the obvious guess is wrong. The project owner supplied a **public video he did not film** as a reference for what an electric unicycle's over-speed alarm sounds like. **No audio from that video is in this game.** The alarm on it was measured — a 2565 Hz fundamental, a second harmonic 17.4 dB below it, no third harmonic at all, a 10 ms attack — and the shipped file is a tone rebuilt from those measurements by a script in this project's development tree. A two-partial buzzer tone carries no fine structure, so the replica is indistinguishable from the source by ear while being wholly this project's own work; the alternative, redistributing someone else's recording without a licence from them, was not available. The reference video is held privately under `references/` and is not redistributed.

`crash_red_rider` (the third rider's crash) is derived from that same recording and is covered by the CC BY 4.0 claim with it. It is the owner's wipeout with **the owner's voice removed**: for 0.8 s of the 3.4 s tumble, the band that carries speech is replaced with voice-free texture taken from elsewhere in the same take, and every sample outside that window is the original recording unchanged. It contains **no recording of Red Rider's own voice**, and no such recording is used anywhere in this game. Nothing generated, modelled, or third-party enters it, which is why it is not listed under *Generated audio* below.

## Generated audio

One shipped file is **not** covered by the CC BY 4.0 claim above, and is listed separately because its standing differs from everything else in this project.

| Shipped file | What it is | Standing |
|---|---|---|
| `crash_trollina` (the second rider's crash) | A composed one-shot. Its slapstick layers — impact, spring, tumble clatter, falling slide and the wheel settling — are synthesized from first principles by a script in this project's development tree and are original work. Its **vocal beats are machine-generated**, produced with a text-to-speech model (OpenAI `gpt-audio`) and then cut, re-timed, pitch-shifted and mixed. | Machine-generated audio has doubtful copyright standing in several jurisdictions, so no copyright is claimed over the vocal layer and it is **excluded from the CC BY 4.0 claim**. It is redistributed with the game on the same terms the rest of the build is redistributed under, and a reuser who needs a clean rights position should replace it. |

This is the same reasoning the project applies to the AI-generated art-direction references under `references/`, applied to a shipped file rather than to a working one. It is recorded here rather than left implicit because a redistributor cannot tell by listening.

One shipped file that a reader might expect in this table is deliberately absent: `crash_red_rider` carries no generated layer at all and stays inside the CC BY 4.0 claim. *Third-party audio recordings* above says what it is.

## Fictional designs and real-world brands

Electric unicycles in this game are **original fictional designs**. They are informed by the general characteristics of real-world EUC categories — compact commuters, suspension trail wheels, long-range touring wheels — but they do not copy any specific commercial product's shell geometry, panel design, decals, naming, or protected product identity.

**One machine is qualified, and the qualification is about a person rather than a manufacturer.** Red Rider's wheel is modelled on the machine he customized himself, from reference material he supplied, with his permission — including the red livery and the identification plate carrying his own name. It is still no manufacturer's product: it reproduces no commercial shell, no panel design, and no protected product identity, and the commercial gear mark visible in his photograph is deliberately not reproduced. The only branding on him or his wheel is his own name.

This project is not affiliated with, endorsed by, sponsored by, approved by, or otherwise associated with Begode/Gotway, InMotion, King Song, Veteran, Extreme Bull, Solowheel/Inventist, Segway-Ninebot, or any other manufacturer, retailer, or rights holder. Any third-party names, trademarks, service marks, product names, or other protected material remain the property of their respective owners, and are referenced only for identification, commentary, or research context. No ownership is claimed over third-party rights.

## Reference material

Private reference material held locally under `references/` — photographs, supplied artwork, and permission evidence alike — is **not** part of this project's licensed content. It is not redistributed, is excluded from every build, and remains the property of its owner. Nothing under `references/` is covered by the licences above, and none of it is a public-facing asset.

The Cool Rider character model and design are original work. **His riding clothes and style are based on what the project owner wears**, and the owner rides and posts publicly on Instagram as [@edwin_rodmen](https://www.instagram.com/edwin_rodmen/); the link is listed here as the style-inspiration credit at his direction. The character does not reproduce the owner's face, and “Cool Rider” is a fictional character name rather than the owner's public name or nickname. The character name is an affectionate nod to a song title; no association with its rights holders is claimed or implied.

The second rider, "Trollina", is also an original creation. She began as a crude joke drawing sent to the project owner, which he owns and kept; the character in the game is original geometry authored from that concept and is covered by the CC BY 4.0 claim above. The original drawing itself is held privately under `references/` and is not redistributed.

### Red Rider — a real person, represented with permission

The third rider is **not** an original creation, and this entry is written narrowly on purpose.

**Red Rider is represented with permission.** He is a real person. He asked to appear in the game in a public conversation, and the project owner agreed in that same conversation. The character is based on the supplied reference material, and supporting permission evidence is retained with the project — privately, under `references/`, never redistributed and never shown in the game.

**His public presence:** Red Rider rides, photographs, and films as **Red** on Instagram — [@r3d__rider](https://www.instagram.com/r3d__rider/), *"French EUC Rider · Photographer · Filmmaker"*. The link is listed here as credit at the project owner's direction; it is the same public persona that appears in the game, not an additional identity.

**No broader right is claimed or granted.** Red Rider is **not** public domain, **not** Creative Commons, and **not** otherwise freely licensed. The CC BY 4.0 grant above covers the geometry, materials, and audio this project authored; it does not place his name, likeness, or persona under any licence, and no licence in this file conveys them. Permission to appear in *this game* is not permission for reuse, resale, sublicensing, merchandise, or any other project. A reuser who wants this character needs his agreement, which is not the project's to give.

**"Red Rider" — with the public Instagram persona credited above — is the only identity published.** No legal name and no private identity is disclosed anywhere in this project or its distributions, and the conversation that granted the permission is internal evidence rather than a public-facing asset.

## Attribution

If you use this project's original assets under CC BY 4.0, attribute as:

> Assets from *EUC Thrills* by VibezZzCoder — CC BY 4.0 — https://github.com/VibezZzCoder/EUC-thrills
