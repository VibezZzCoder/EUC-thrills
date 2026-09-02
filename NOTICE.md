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

**One limit belongs here rather than in a footnote.** A CC BY 4.0 grant conveys this project's own rights in the assets this project authored. It does not convey — and cannot convey — rights in a real person's name, likeness, or persona. **Four of the six riders are real people appearing with their permission** — Red Rider, Adonisb2, Maribel Vargas and Wheel in Motion — and the licence above does not extend to any of those identities. Two of them also contributed a recording and two of them a logo, none of which the licence covers. See *Reference material* below.

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

`crash_adonisb2` (the fourth rider's crash) is **a recording of the rider it belongs to, contributed by him**, and it is the one shipped audio file in this game whose standing is neither this project's own nor a public-domain download. The rider represented here as Adonisb2 recorded his own fall on an electric unicycle and gave the project owner the file for use in this game. What ships is 3.4 s of *his* recording — cut to the shared crash length, the two near-identical channels summed to mono, and the level matched to `crash_wipeout`. Nothing is removed, substituted, modelled, or generated.

He gave permission for it to be in this game, and that is the whole of what is claimed. It is **not** covered by the CC BY 4.0 claim above, no copyright over it is claimed by this project, and no licence in this repository conveys any right to it beyond redistribution with the game. A reuser who wants that recording for anything else should ask him. He is credited by the name he chose for himself here; no other name of his appears in this project's public files.

`crash_maribel` (the fifth rider's crash) is **a recording made by the rider it belongs to, contributed by her**, on the same footing as `crash_adonisb2` and outside the CC BY 4.0 claim for the same reason. What is different is what it is a recording *of*, and it is stated plainly because the file does not sound like a staged take and nobody should have to guess: **it is not a crash.** The project owner asked Maribel Vargas whether she had a usable crash or rider sound; she recorded one for him. In it she rides one of her older electric unicycles into a lift, presses the wheel's power-off button — it beeps — sets the wheel down hard on the floor, and yells. Nobody fell and nobody was hurt.

What ships is 3.4 s of *her* recording, taken as one continuous slice, level-matched to `crash_wipeout`, with **her own power-off beep from the same recording copied into the tail** where her voice stops — because an electric unicycle lying on its side goes on beeping, and the slice left that gap. Her voice is then set 5 dB below the rest of her own take, because she recorded it close to the microphone in a small hard room and the shout would otherwise be louder than the impact it belongs to. Nothing else is moved, nothing is filtered, nothing is substituted, modelled, or generated, and **no sound is in the file that she did not record**. Two further details are hers rather than choices: it is the right-hand channel of her stereo recording rather than a mono sum, because summing her two microphones cancels 12.6 dB at 630 Hz in the middle of her yell; and it is unfiltered, because the low weight under the impact is the impact.

She recorded it at the owner's request and gave permission for it to be in this game, and that is the whole of what is claimed. It is **not** covered by the CC BY 4.0 claim above, no copyright over it is claimed by this project, and no licence in this repository conveys any right to it beyond redistribution with the game. A reuser who wants that recording for anything else should ask her. Her original video is held privately under `references/` and is not redistributed.

`crash_wheel_in_motion` (the sixth rider's crash) is the sibling of `crash_red_rider`, and it stands exactly where that file stands: **inside the CC BY 4.0 claim**, derived from the project owner's own recording and from nothing else. The sixth rider's crash was to be the same as the third's — the owner's wipeout with the owner's voice removed — and this project's own test suite refuses to ship two crashes that are the same file sample for sample, so it is a second render of the same treatment: the same 0.8 s of the same 3.4 s tumble has the band that carries speech replaced with voice-free texture taken from a *different* stretch of the same take, and every sample outside that window is the original recording unchanged — which makes it identical to `crash_red_rider` everywhere except that 0.8 s. It contains **no recording of Wheel in Motion's own voice**, and no such recording is used anywhere in this game. Nothing generated, modelled, or third-party enters it, which is why it is not listed under *Generated audio* below.

## Generated audio

One shipped file is outside the CC BY 4.0 claim above **because part of it is machine-generated**, and is listed separately because that standing differs from everything else in this project. (It is not the only file outside the claim — `crash_adonisb2` and `crash_maribel` are too, for an unrelated reason the section above gives.)

| Shipped file | What it is | Standing |
|---|---|---|
| `crash_trollina` (the second rider's crash) | A composed one-shot. Its slapstick layers — impact, spring, tumble clatter, falling slide and the wheel settling — are synthesized from first principles by a script in this project's development tree and are original work. Its **vocal beats are machine-generated**, produced with a text-to-speech model (OpenAI `gpt-audio`) and then cut, re-timed, pitch-shifted and mixed. | Machine-generated audio has doubtful copyright standing in several jurisdictions, so no copyright is claimed over the vocal layer and it is **excluded from the CC BY 4.0 claim**. It is redistributed with the game on the same terms the rest of the build is redistributed under, and a reuser who needs a clean rights position should replace it. |

This is the same reasoning the project applies to the AI-generated art-direction references under `references/`, applied to a shipped file rather than to a working one. It is recorded here rather than left implicit because a redistributor cannot tell by listening.

Four shipped files a reader might expect in this table are deliberately absent, and the reason differs. `crash_red_rider` and `crash_wheel_in_motion` carry no generated layer at all and stay inside the CC BY 4.0 claim. `crash_adonisb2` and `crash_maribel` carry none either and stay *outside* it, because they are somebody else's recordings rather than this project's. Six riders crash in this game and only one of those six sounds is machine-made; *Third-party audio recordings* above says what the other five are.

## Fictional designs and real-world brands

Electric unicycles in this game are **original fictional designs**. They are informed by the general characteristics of real-world EUC categories — compact commuters, suspension trail wheels, long-range touring wheels — but they do not copy any specific commercial product's shell geometry, panel design, decals, naming, or protected product identity.

**Three machines are qualified, and in every case the qualification is about a person rather than a manufacturer.**

Red Rider's wheel is modelled on the machine he customized himself, from reference material he supplied, with his permission — including the red livery and the identification plate carrying his own name. It is still no manufacturer's product: it reproduces no commercial shell, no panel design, and no protected product identity, and the commercial gear mark visible in his photograph is deliberately not reproduced. The only branding on him or his wheel is his own name.

Adonisb2's wheel is modelled the same way and on the same footing: a blocky off-road form and the green plate with the stylized eyes that personalize his own machine, from reference material he supplied, with his permission. The plate's artwork is drawn from scratch in this project's own style rather than copied. It reproduces no manufacturer's shell, no panel design and no protected product identity, the third-party sticker artwork visible in his photograph and in the supplied mockup is deliberately not reproduced, and his wheel carries no name or wordmark at all.

Wheel in Motion's wheel is the third, on the same footing: a tall black performance body with bright cyan-blue side structures and orange power pads — the colour relationship of the machine he customized himself — from the photograph he supplied, with his permission, and with his own channel's mark on a plate on both flanks. It is the game's own fictional performance form wearing that personalization: it reproduces no manufacturer's shell, no panel design and no protected product identity; the manufacturer's wordmark on the real wheel's bodywork, the pad maker's marks and the third-party sticker on its flank are deliberately not reproduced; and the only mark on him or his wheel is his own.

Maribel Vargas's riding kit follows the same rule, and it needs stating because her reference photographs carry more commercial branding than either of theirs. Her racing suit and helmet in this game keep **colour blocking, panel placement and silhouette** — a black-over-grey one-piece, a matte dark shell, a mirrored blue-cyan visor, and the aqua-and-coral asymmetry that is her own — and reproduce **no manufacturer's mark of any kind**: not the helmet maker's wordmark, not the suit maker's wordmark down the arm and leg, and not its chest device.

**Where those two manufacturer's marks sit on the real kit, this game prints hers.** The chest device is **her own logo**, in her own purple, at the position and roughly the scale the real suit's brand device occupies; the back of the suit carries the same logo alone; and the script down the outside of one thigh reads **VARGAS** — her name, which she publishes and competes under — in lettering drawn as paths by this project rather than set in any typeface. That is a deliberate substitution rather than a coincidence of placement: the project owner asked for the mark that is in the photograph, the mark in the photograph is a manufacturer's trademark, and the resolution was to keep the *place* and use the mark that is hers to grant. The visor's iridescence is a generic blue-cyan gradient with no brand on it. The camera watermark on her supplied video and the application branding on the lap trace she sent do not appear anywhere. The only mark she wears anywhere in this game is her own, and its terms are in her section below.

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

### Adonisb2 — a real person, represented with permission

The fourth rider is **not** an original creation either, and the same narrow terms apply. What is different about this one is worth stating plainly, because it is the actual shape of the permission: **he initiated it.**

**Adonisb2 is represented with permission, at his own request.** He is a real EUC rider. He contacted the project owner asking to have his avatar added to the game so that he could share it, supplied the reference photograph of himself and his machine, **chose the in-game name himself** when the owner asked what it should be — the spelling here is exactly what he typed — and then **contributed a recording of one of his own falls**, which is the sound his character crashes with. The permission conversation and the photograph are retained with the project privately, under `references/`, never redistributed and never shown in the game.

**His public presence:** Adonisb2 rides and posts on TikTok as [@adonisjg_v11](https://www.tiktok.com/@adonisjg_v11) — the handle he watermarks on his own photographs. The link is listed here as credit at the project owner's direction; it is the same public persona that appears in the game, not an additional identity.

**No broader right is claimed or granted.** Adonisb2 is **not** public domain, **not** Creative Commons, and **not** otherwise freely licensed. The CC BY 4.0 grant above covers the geometry, materials, and audio this project authored; it does not place his name, likeness, or persona under any licence, and no licence in this file conveys them. His contributed recording is not under that grant either — *Third-party audio recordings* above says so separately. Permission to appear in *this game* is not permission for reuse, resale, sublicensing, merchandise, or any other project. A reuser who wants this character needs his agreement, which is not the project's to give.

**"Adonisb2" — with the public TikTok persona credited above — is the only identity published.** He chose that name *to be published*. No legal name and no other account of his is disclosed anywhere in this project or its distributions, and the conversation that granted the permission is internal evidence rather than a public-facing asset.

### Maribel Vargas — a real person, under her own name, with her permission

The fifth rider is **not** an original creation, the same narrow terms apply, and two things about this one are different enough to state plainly.

**Maribel Vargas is represented with permission, at her own request, under her real name.** She is a real competitive electric-unicycle racer. She contacted the project owner asking for a woman rider in the game and then to be one — *"I would like to be one of those"* — and supplied the reference photographs and video the character is built from. **The name on her card is her own**, published at the project owner's decision because it is the name she competes and is known under; the two riders above appear under chosen personas, and she does not. The permission conversation and the reference material are retained with the project privately, under `references/`, never redistributed and never shown in the game.

**Her public presence:** Maribel posts as [@baymv_](https://www.instagram.com/baymv_) on Instagram. The link is listed here as credit at the project owner's direction; it is the same public persona that appears in the game, not an additional identity.

**Her logo appears in this game with her permission, and it is her copyrighted work — © Maribel Vargas, all rights reserved — not this project's.** The purple mark she rides under — a grinning devil's head above her initials as lightning: an **M** for Maribel, and a separate **V** for Vargas below it — was identified by her (*"That's my logo"*) when the project owner asked whether it could be used, and she then supplied the complete artwork herself. What ships is **her artwork itself, carried verbatim** — and that changed on 2026-08-20. Until then the mark was drawn from scratch in this project's flat style, redrawn three times against her file, and the project owner's verdict on the third attempt was that it was still butchering her logo. He then supplied `MV_LOGO_ASSET_PACK`, a pack whose own README forbids redrawing, tracing, glyph substitution, procedural approximation, filling the mark's negative space, and stretching it in one axis. So the one file it names as the master, `MV_logo_transparent_CLEAN.png`, is embedded in `src/data/mvLogoAsset.ts` byte for byte, hash-checked against the pack's own manifest on every test run, unpacked at boot by `src/render/pngDecode.ts`, and composited into the rider's texture sheet unchanged. **This is the only piece of her material that is redistributed with the game, and it is redistributed because it is the mark itself, at her grant.** The rest of the pack — the original screenshot, the previews, the source crops — stays under `references/` and is never redistributed. It appears in five places, and nowhere else, and in **her own purple everywhere** — a white colourway shipped until 2026-08-19, when her regenerated reference and the owner's instruction that it *"must look exact to the original"* settled that a logo's colours belong to it: her chest, the back of her suit, both knee guards, the black bodywork between her machine's leg pads — which is where a rider's sticker goes on a real wheel — and her chooser card, which carries only the monogram because the full lockup does not resolve at that size. **The CC BY 4.0 grant above does not cover her mark.** It is hers — the copyright in the mark remains with Maribel Vargas; permission to use it in *this game* is not permission for reuse anywhere else, and a reuser needs her agreement.

**The circuit in this game is named after her, and the venue it takes its inspiration from is not named at all.** She suggested a racing track herself, and agreed in writing that it would be a remixed, original layout rather than a copy — *"more like inspiration unless they give me direct permission to copy it"*, and her reply, *"Yes"* — with one instruction of her own, which is honoured: the lap-timing app she named is not shown anywhere. **BelVar Circuit** takes its name from hers, **Bel** from Mari**bel** and **Var** from **Var**gas, and the tribute is recorded here so the credit is legible rather than private. The real venue's name and city appear nowhere in this game or its distributions.

**She also recorded the sound her character crashes with**, at the project owner's request and after the permission above was already settled — see `crash_maribel` under *Third-party audio recordings*. Like her logo, it is her material appearing here by her grant and not under this project's licence; unlike her logo, it is a performance she staged for the purpose rather than a recording of anything that happened to her.

**Any racing record stated about her is stated in the event's own category wording**, at her reference material's explicit instruction, and is not inflated into a broader claim.

**No broader right is claimed or granted.** Maribel Vargas is **not** public domain, **not** Creative Commons, and **not** otherwise freely licensed. The CC BY 4.0 grant above covers the geometry, materials, and audio this project authored; it does not place her name, likeness, persona, or logo under any licence, and no licence in this file conveys them. Permission to appear in *this game* is not permission for reuse, resale, sublicensing, merchandise, or any other project. A reuser who wants this character needs her agreement, which is not the project's to give.

**Her name and the public Instagram persona credited above are the only identity published.** No other account of hers, and nothing about where she lives or works, is disclosed anywhere in this project or its distributions, and the conversation that granted the permission is internal evidence rather than a public-facing asset.

### Wheel in Motion — a real person, represented with permission

**Wheel in Motion is represented with permission, at his own request.** He is a real electric-unicycle rider with a YouTube channel of that name. He asked to appear in the game in a public conversation — in reply to the project owner stating, in that same thread, that a real person is added only when that person asks for themselves — and the project owner verified the request against his channel before agreeing. The character is based on the reference photograph he supplied; the permission conversation and the reference material are retained with the project privately, under `references/`, never redistributed and never shown in the game.

**His public presence:** Wheel in Motion publishes on YouTube as [Wheel In Motion](https://www.youtube.com/@RealWheelInMotion). The link is listed here as credit at the project owner's direction; it is the same public persona that appears in the game, not an additional identity.

**His mark appears in this game with his permission, and it is his channel's mark — © its owner, all rights reserved — not this project's.** The lettering — a blue **W**, a white **i** and an orange **M** — is the avatar of the persona's accounts across his socials, and the master he supplied is embedded in `src/data/wimLogoAsset.ts` as a scripted crop of that file (the mark's own bounding box with a margin, halved in size, no pixel of the mark removed, redrawn or recoloured), unpacked at boot and composited into the character's texture sheets unchanged. It is never redrawn, traced, re-proportioned, recoloured or filled, and it keeps its own aspect on every surface it lands on. It appears in five places, and nowhere else: his chest, the sticker on his backpack, the shell of his right knee guard, a white plate on both flanks of his wheel, and his chooser card. **The CC BY 4.0 grant above does not cover his mark.** Permission to use it in *this game* is not permission for reuse anywhere else, and a reuser needs his agreement.

**His crash is not a recording of him.** No recording of his voice exists in this game; his character crashes to `crash_wheel_in_motion`, the project owner's own wipeout with the owner's voice removed — see *Third-party audio recordings* above. If he supplies a recording of his own, this entry will change to say so.

**No broader right is claimed or granted.** Wheel in Motion is **not** public domain, **not** Creative Commons, and **not** otherwise freely licensed. The CC BY 4.0 grant above covers the geometry, materials, and audio this project authored; it does not place his name, likeness, persona, or mark under any licence, and no licence in this file conveys them. Permission to appear in *this game* is not permission for reuse, resale, sublicensing, merchandise, or any other project. A reuser who wants this character needs his agreement, which is not the project's to give.

**"Wheel in Motion" — with the public YouTube channel credited above — is the only identity published.** No legal name and no other account of his is disclosed anywhere in this project or its distributions, and the conversation that granted the permission is internal evidence rather than a public-facing asset.

## Attribution

If you use this project's original assets under CC BY 4.0, attribute as:

> Assets from *EUC Thrills* by VibezZzCoder — CC BY 4.0 — https://github.com/VibezZzCoder/EUC-thrills
