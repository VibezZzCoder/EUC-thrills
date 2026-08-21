# EUC Thrills

**One wheel. Total freedom. Ride anywhere.**

An open-source arcade riding game about electric unicycles, played in the
browser. Lean into the throttle, carve a line through the city, hop a kerb, and
take the alley when you think you can hold it.

> **Play:** [https://vibezzzcoder.github.io/EUC-thrills/](https://vibezzzcoder.github.io/EUC-thrills/)
>
> **Source:** [github.com/VibezZzCoder/EUC-thrills](https://github.com/VibezZzCoder/EUC-thrills) — an original work by [VibezZzCoder](https://github.com/VibezZzCoder)

![EUC Thrills — Cool Rider airborne after striking a small traffic-island bollard, with the riderless wheel, bollard, road, and city each visible](https://vibezzzcoder.github.io/EUC-thrills/media/euc-thrills-gameplay.png)

**This is a work in progress.** The riding is the part that is meant to be
right; everything around it is still growing, and later builds will look,
sound, and handle differently. Saved times are kept against the exact course
they were set on, and a course or save-format change retires the old ones
rather than quietly converting them. If the ride feels wrong somewhere — a
control that fights you, a line that should work and doesn't — the repository
above is the place to say so.

## Riding

You ride a suspension wheel, in a hand-built city loop that leaves a plaza,
runs a boulevard, crosses a park and a river ford, climbs a gravel trail, and
comes back — with a shortcut through an alley that is genuinely faster and
genuinely riskier. **Fresh route** then generates new point-to-point courses
from the same authored places, a different shape every time.

Some of what the wheel does is specific to a real EUC, and worth knowing before
it surprises you:

- **You lean to go.** The throttle tips the wheel forward and the wheel pushes
  back; there is no engine note to chase, only load.
- **It does about 50 mph flat out, and is handy at walking pace.** Top speed
  takes a long straight and about eight seconds of held throttle. At the other
  end, a full-lock turn at walking pace fits inside a lane, and backwards
  riding reaches about 15 mph — asked for from a standstill, twice.
- **It beeps above 40 mph, and it means it.** About one beep a second at 40,
  faster as you climb, a stream of them at the top. Ignore them all the way to
  the ceiling and the motor lets go and you go over the front, exactly as a
  real one does. Backing off even slightly is enough. Riders call sitting just
  underneath that limit *riding the beeps*. With the sound off, a warning
  triangle blinks at the same rate.
- **The wheel tells you when it is running out.** Take the climb back to the
  plaza at speed and the status light and the HUD warn you that you are asking
  for more than it has left; push past that and it tilts the pedals back to
  make you slow down.
- **Watch your pedals in a hard carve.** Lean far enough and a pedal grounds,
  which costs you speed and, if you were fast, the ride.
- **On a Fresh route, watch the road itself.** A spill or a shallow pothole
  sets the wheel weaving — slow down and it settles, hold your speed and it
  puts you down. A deep hole at speed is simply a crash, and hopping clears any
  of them. Bushes are foliage rather than walls: the wheel pushes through, loses
  speed, and takes one jolt. Clean speed, rough ground, kerbs, landings, pedal
  strikes, and the carve you are enjoying never start the weave.

Crashes are non-graphic but not stiff: the rider tumbles, catches the ground
with their limbs, and settles into a comic rest while the wheel can bounce and
spin away. Any riding input remounts once the wipeout has settled, and waiting
a little longer remounts you anyway — either way you return moving, so a crash
costs speed rather than the whole run.

## Modes

**Start ride** — free ride in the world currently loaded. No clock, no
objective, nothing to fail.

**Time trial** — race from the start line through five more checkpoints. The
HUD points at the next one and shows the distance; each crossing gives you a
split and, once you have a time to beat, the gap. Scoring is pure elapsed
time — top speed and landing quality are shown for interest and count for
nothing. Beat your best and the next attempt adds a translucent replay rider,
so you can see *where* the time changed. In the city, the safe route and the
faster alley cross the same checkpoints, so both lines stay comparable.

**Track Day** — lap **BelVar Circuit**, a hand-built kart-scale course with
barriers, kerbs, gravel runoff, a start gantry and a paddock. Choosing it takes
you there; you get an out lap to find the throttle, and the clock starts when
you cross the line.

- Crossing the line again closes that lap and starts the next one, so the
  session is a run of laps rather than a single attempt. Two sector lines split
  the circuit into thirds and give you a gap at each one.
- **The record is your best lap**, and the moment you set one it replaces the
  ghost — so from the next lap on you are racing the lap you just rode, not the
  one you turned up with.
- A lap has to be a lap of the circuit. Ride out through a barrier gate onto the
  field or the infield and that lap will not count; the corner of the screen
  tells you so for the rest of it. Running wide onto the grass verge is not
  cheating — it is a mistake the surface already punishes.
- **You end the session yourself**: pause, then **End session**. The card
  reports your best lap and its sectors, how many laps counted, and what your
  three best sectors would add up to if you ever put them together on one lap.

**Knockabout** — carry a padded paddle along a Fresh route and knock down the
yellow targets on its verges. Time a swing while holding a line near a target
for a clean hit; riding into one also works, but the clumsy hit sheds speed and
adds a recoverable wobble. Your score is targets struck out of the route's
total, the clock counts for nothing, and a target you pass stays standing until
you come back for it. The city has no targets, so choosing Knockabout there
opens the route generator.

**Police chase** — Officer Dorkins starts behind you on a Fresh route, and you
survive five minutes to escape.

- He rides the same terrain, grip, hazards, kerbs, crashes, and recovery you
  do — he is a CPU rider, not an obstacle on a rail. He pursues in either
  direction and cuts across the field when you leave the road.
- On a clear straight he can hold the wheel just under its cutout, so pinning
  the throttle will not lose him. Corners, hazards, rough ground, and a cleaner
  line are where the gap comes from.
- He is a tracker. A gap you stretch past his reach gets closed — he turns up
  on the road behind you again, at your pace, siren rising. Distance buys
  breathing room, never safety.
- He alone carries the paddle. A strike costs speed and adds a wobble; crashing
  while he is close is the bust.
- The route is the arena. Going far into the surround puts a warning and a
  countdown on screen and ends the run if you do not come back. Camping just
  off the road is not a loophole — he follows.

**Fresh route** — generate a new place to ride. **Surprise me** makes one
instantly; typing a seed rebuilds the same place every time, which is how you
send one to a friend. A rare seed may not produce a valid route, and the game
says so and asks for another rather than quietly building something else. The
seed stays visible and becomes part of the address, so sharing the link shares
the ground.

You do not have to come back to that screen for another course. Pause during
any ride, or finish a run, and **New route** builds a fresh one and puts you
straight back into whatever you were playing.

Records are kept per course and per mode: time trial, best lap, Knockabout, and
chase survival never overwrite each other, and switching riders changes nothing about
any of them.

## Riders

There are five, the line under the title screen's buttons says who you are, and
that line opens the chooser. The difference is **entirely cosmetic** — each has
their own crash sound, none is faster, and the custom wheels ride identically to
the standard one, down to the last number.

**Cool Rider** wears black moto gear with reflective blue panels and a
full-face helmet; his clothes and riding style are based on what the project
owner wears, credited at
[@edwin_rodmen](https://www.instagram.com/edwin_rodmen/). He does not reproduce
the owner's face, and the character name is not the owner's public name.

**Trollina** began life as a joke drawing somebody sent the author to make fun
of the graphics, and ended up in the game with wild magenta hair, a skater dress
over black tights, and her own idea of what falling off sounds like.

**Red Rider** is a real rider who asked to appear and is here with his
permission — the red-and-black armour, harness, and camera are his, and he was
the first rider whose machine looks different too: a red saddled wheel modelled
on his own customized machine. His public riding and photography persona is
credited as [@r3d__rider](https://www.instagram.com/r3d__rider/) at his and the
project owner's direction.

**Adonisb2** is also a real rider, and he asked from the other direction — he
contacted the owner to have his avatar added so he could share it, supplied the
reference photo of himself and his machine, and chose his in-game name. He rides
in black kit under big neon-green guards with a mirrored visor, on a blocky
off-road wheel carrying the green angry-eye plate from his own machine. **His
crash is real:** he contributed a recording of one of his own falls, and that is
the sound his character crashes with. His public persona is credited as
[@adonisjg_v11](https://www.tiktok.com/@adonisjg_v11) at his and the project
owner's direction.

**Maribel Vargas** is a real competitive rider who asked to be in the game and
is here under her own name, at her request. She wears black race kit with aqua
and coral flashes and rides a wheel in her own colours; her logo appears exactly
as she supplied it, and her crash is a recording she made herself. **BelVar
Circuit is named after her** — Mari*bel* and *Var*gas — and the course exists
because she suggested it. It was designed from the *kinds* of corner a compact
kart circuit asks for rather than traced from anything she rides. Her public
racing persona is credited as
[@baymv_](https://www.instagram.com/baymv_) at her and the project owner's
direction.

For every real rider, no legal or private identity is published anywhere in this
project, and their likenesses appear here with permission for this game only —
see [`NOTICE.md`](NOTICE.md).

## Controls

Three ways to ride, and **all of them are live at once**: a phone with a pad
paired to it, or a laptop with a touchscreen, does not have to choose.

### Touch — phone and tablet

The controls appear on their own on a touchscreen, in portrait and landscape.
Rotating mid-ride is fine; nothing moves except the size of things.

| Action | Control |
|---|---|
| Accelerate | Push the floating stick up |
| Brake, and reverse from a standstill | Pull the floating stick down |
| Carve | Move the stick left or right — diagonal rides and carves together |
| Crouch, and charge a bigger hop | Hold **CHARGE** |
| Hop | Tap **HOP** — hold **CHARGE** first for a bigger jump |
| Swing the paddle | Tap **SWING** — Knockabout only |
| Pause · quick reset · camera view | The three small buttons along the bottom |

The stick has no fixed spot: **put your thumb down anywhere on that side of the
screen and ride from there.** In **Settings → Touch controls** you can force the
controls on or off, mirror them for a **left-handed layout**, and set a **size**
that scales the controls and both stick throws together — a bigger stick is a
gentler one, not a twitchier one.

### Keyboard

| Action | Keys |
|---|---|
| Accelerate | `W` or `↑` |
| Brake, and reverse from a standstill | `S` or `↓` |
| Carve left / right | `A` `D` or `←` `→` |
| Hop | `Space` |
| Crouch, and charge a bigger hop | `Shift` |
| Swing the paddle — Knockabout only | `F` |
| Quick reset — back to the start, or restart the run | `R` |
| Mute · camera view · pause | `M` · `C` · `Esc` |

Every key except `Esc` can be reassigned in **Settings → Controls**. `Esc`
always pauses, and `F3`/`F4` open developer overlays.

### Gamepad

| Action | Control |
|---|---|
| Accelerate | Left stick forward, right trigger, or D-pad up |
| Brake / reverse | Left stick back, left trigger, or D-pad down |
| Carve | Left stick left and right, or D-pad left and right |
| Hop · crouch | A · left bumper |
| Swing the paddle — Knockabout only | Right bumper |
| Quick reset · camera view · pause | X · Y · Start |
| In menus | Stick or D-pad to move, A to confirm, B to go back |

The dead zone is adjustable in Settings and the pad can be switched off there.
Face-button names are the Xbox layout; a PlayStation pad reports the same
positions (A is ✕, B is ○, X is □, Y is △).

## Put it on your home screen

The game installs as a web app, so it opens from an icon, full screen, with no
address bar in the way. There is nothing to download and no store involved.

**iPhone and iPad** — open the game in **Safari**, tap the **Share** button,
then **Add to Home Screen**. (It has to be Safari. Chrome and Firefox on iOS
can add a bookmark, but only Safari installs the web app.)

**Android** — open the game in Chrome and use **⋮ → Add to Home screen**, or
take the **Install** prompt if the browser offers one.

**Desktop** — Chrome and Edge can install it from their own menu (*Cast, save
and share → Install page as app*, or *Apps → Install this site as an app*).

Two honest notes. **It still loads over the network each time it opens** — this
is an installed launcher, not an offline game, and there is no cached copy yet.
Some browsers reserve their strongest install prompt for apps that do work
offline, which is why the menu route above is the one that always works. And
your saved times live in the browser's storage for this page, so a game launched
from the home screen and the same game opened in a tab may not always be looking
at the same records.

## Settings, saving, and your data

Quality, field of view, and speed units; master, ride, and warning volumes on
separate faders, so the wheel can still warn you with everything else turned
down; full key rebinding; gamepad toggle and dead zone; on-screen controls,
handedness, and size.

The ride itself is **identical at every setting** — nothing you can change
alters how the wheel behaves, so a time set on Low compares with one set on
High, and a time set with thumbs compares with one set on keys.

Your settings and best times are saved **in your own browser** and go nowhere
else. There is no account, no server, and no analytics; the game makes no
network requests after it loads. Clearing your browser's site data for this page
clears your times with it — there is deliberately no in-game button that can
delete them by accident. If many seeded routes eventually fill the browser's
storage, the game recycles the **oldest ghost replay first** and keeps that
route's time and splits. In a private window, or with site data blocked, the
game still runs and still times you; it simply says up front that nothing will
survive the tab closing.

## Requirements

A current browser with WebGL2 — Chrome, Edge, Firefox, or Safari, on a desktop,
laptop, phone, or tablet. Hardware acceleration should be on; if the browser
cannot give the game a graphics context it says so on the loading screen rather
than sitting blank.

On a phone the game is doing the same work it does on a desktop, so an older
handset will run it slower. **Quality** in Settings is the first thing to turn
down, and it changes nothing about how the wheel rides.

## Building from source

This repository is the source. `src/` holds the game as readable TypeScript with
its tests beside it; `tests/` holds the browser suite; `docs/` is the built game
that GitHub Pages serves and is regenerated per release, so there is never a
reason to edit anything in it.

```
npm install
npm run dev            # play your working copy locally
npm run typecheck
npm test               # the headless suite — over a thousand tests, no browser
npm run test:browser   # the Playwright suite (once: npx playwright install chromium)
npm run build
```

Two notes for contributors. The repository is a per-release snapshot of a
private working tree, so its history moves one release at a time — see
[`CONTRIBUTING.md`](CONTRIBUTING.md) for how a pull request lands. And some code
comments cite internal design documents that are not part of this distribution;
the code stands without them.

## Roadmap

Direction, not a release schedule. No dates, and the order is not a priority
list.

### Accepted direction

- **Local split-screen multiplayer, on one desktop.** Two riders, two views,
  one keyboard-and-pads — no accounts, no server, and nothing to connect to.
  This is the shape the project is actually building toward: local multiplayer
  on desktop, single-player on mobile. Playing across two devices is not
  cancelled, but it is behind this and behind everything else. The split-screen
  mode gets its own, higher graphics budget so that nothing about the
  single-player game on a phone has to give way for it.

### Recently landed

- **Track Day, and the circuit it is for** — BelVar Circuit, a hand-built kart
  course, and a lap mode with sector splits, a best-lap record, and a ghost that
  restarts beside you on every lap.
- **A fifth rider, and the first with a course named after her** — Maribel
  Vargas, a real racer who asked to appear and suggested the venue.
- **A fourth rider with his own wheel and his own real crash** — Adonisb2, who
  asked to be in the game and contributed a recording of one of his own falls.
  The rider chooser, title, and pause screens now also fit every supported phone
  and tablet size in both orientations.
- **Police chase** — Officer Dorkins pursues any playable rider across Fresh
  routes, including off-road escapes, with a siren that rises as he closes.
- **Knockabout**, and before it **fun wipeouts and soft bushes** — active
  ragdoll crashes with a protective, non-graphic tumble, and foliage that drags
  and cushions instead of stopping you like concrete.

### Ideas under consideration

- **Jump lines and airtime.** A deliberate sequence of ramps, a jumpable tall
  platform, and off-road crests that let the wheel properly leave the ground —
  among the clearest repeated rider requests.
- **More challenges and progression.** Flow, hill-climb, technical-trail,
  downhill, delivery, scoring, and crash-count ideas all belong here; none has a
  settled ruleset yet.
- **A course that is alive.** Moving traffic or animals on a route of their own,
  which could also be the natural home for a different time of day.
- **More racing.** Preset skill-level and developer ghosts, AI riders sharing a
  course, and more venues to lap. Track Day is the first of this and is
  deliberately one rider against the clock; nothing about it is a race yet.
- **More world.** Downtown, hillside, industrial, deeper woodland, and more
  riverside — while protecting the city-to-trail transition riders already like.
- **More rider voices.** Varied crash reactions and occasional hop, carve,
  impact, and top-speed calls, without turning the ride bed into chatter.
- **More character and presentation.** A richer procedural look, more wheels and
  cosmetic-equal riders, a custom wheel designer, music, helmet/wheel/replay
  cameras, and photo mode.
- **More for the phone.** The controls are in and the game is properly playable
  on one; what is not there yet is anything that takes advantage of it — an
  offline copy, haptics on a landing or a pedal strike, a layout that adapts to
  a folding screen.

### Deliberately not planned

Hosted multiplayer servers, accounts, cloud saves, a story campaign, an in-game
economy or marketplace, and VR. The multiplayer plan above is intentionally
small: the game asking you to sign in to ride is exactly what it is trying not
to be.

## Licence

Code is **MIT**. Original game assets are **CC BY 4.0**. Four of the ten shipped
sounds derive from public-domain (CC0) recordings; two crashes derive from the
author's own recording — the third rider's is that same wipeout with the
author's voice removed. Two shipped sounds sit outside the CC BY 4.0 claim: the
second rider's crash is a composed one-shot whose voice is machine-generated,
and the fourth rider's crash is **his own contributed recording of his own
fall**, used in this game with his permission and with no copyright over it
claimed by this project. Cool Rider is an original fictional character whose
clothes and style draw on what the project owner wears; Red Rider and Adonisb2
are real people represented with permission, and no licence in this project
covers their names, likenesses, or personas. Full terms, attribution, and
per-file provenance are in [`LICENSE`](LICENSE) and [`NOTICE.md`](NOTICE.md).

The wheels in this game are original fictional designs — two are modelled, with
their riders' permission, on their own customized machines, without reproducing
any manufacturer's identity or any third-party sticker artwork. This project is
not affiliated with, endorsed by, or associated with any electric unicycle
manufacturer or retailer.
