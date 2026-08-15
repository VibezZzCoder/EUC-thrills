# EUC Thrills

**One wheel. Total freedom. Ride anywhere.**

An open-source arcade riding game about electric unicycles, played in the
browser. Lean into the throttle, carve a line through the city, hop a kerb, and
take the alley when you think you can hold it.

> **Play:** [https://vibezzzcoder.github.io/EUC-thrills/](https://vibezzzcoder.github.io/EUC-thrills/)
>
> **Source:** [github.com/VibezZzCoder/EUC-thrills](https://github.com/VibezZzCoder/EUC-thrills) — an original work by [VibezZzCoder](https://github.com/VibezZzCoder)

## ⚠️ This game is a work in progress

What you can play today starts with one complete hand-built city loop, then
opens into **procedurally generated Fresh routes** that can be ridden free,
against the clock, with a paddle in Knockabout, or with Officer Dorkins in
pursuit. The city runs start to finish; the generated routes are point-to-point.
The riding is the part that is meant to be right — but this is still the
foundation of the game rather than the whole of it.

Worth knowing before you start:

- **The wheel is much faster, and much handier at walking pace.** Top speed is
  now around 50 mph — it takes a long straight and about eight seconds of held
  throttle to find it, and it is worth finding. **It will also cut out on you
  up there**, which is the next point. At the other end, a full-lock
  turn at walking pace is now roughly half the circle it used to be, so weaving
  between two lamp posts or turning around inside a lane is something the wheel
  will actually do. Backwards riding went from a shuffle to about 15 mph; it is
  still asked for the same way, from a standstill, twice.
- The hand-built city is still the default and the place the ride is tuned
  against. **Fresh route** uses procedural generation to build you a brand-new
  place to ride.
  Press **Surprise me** and it makes one — no typing, and that is the whole
  path. Every route also has a name, and typing the same name again always
  builds the same place, which is how you send one to a friend. A rare name may
  not produce a valid route, in which case the game says so and asks for
  another rather than quietly giving you a different world.
- **There are three selectable riders now.** The title screen says who you are
  riding as and that line opens the chooser: **Cool Rider** in black and reflective blue;
  **Trollina**, who has wild magenta hair, a skater dress over black tights, and
  her own idea of what falling off sounds like; and **Red Rider**, a real rider
  who asked to be in the game and appears with his permission, in his own
  red-and-black gear on his own customized wheel. Cool Rider is the first-time
  default; after you choose, the game remembers your rider. It is looks only —
  all three ride exactly the same, and your best times carry across.
- **Police chase is live on Fresh routes.** Officer Dorkins is a CPU rider on
  the same wheel physics as you, not a moving obstacle on a rail. Stay ahead for
  five minutes; use the road, hazards, and rough ground to make his pursuit
  difficult. He follows onto the grass when you leave the road, while riding too
  far into the surround starts a warning and can end the run.
- **Phones and tablets ride it too**, on their own on-screen controls, in
  portrait or landscape. That is new, and it is the part of this build most
  likely to want adjusting on a handset nobody has tried it on yet — the size
  and the handedness of the controls are both in Settings.
- **Fresh routes carry road hazards, and bushes are soft hazards.** Liquid
  spills and potholes appear on generated routes. Bushes appear in the city and
  generated worlds, but they are foliage rather than walls: the wheel pushes
  through, loses speed, and takes one wobble jolt instead of crashing as though
  it hit concrete. Slow down to settle the weave; carve as hard as you like on
  clean ground and it never starts by itself.
- **Your saved times may not survive every update.** Best times and ghosts are
  stored against the city or the exact Fresh-route seed they were set on; if a
  course or the save format changes, old records are left behind rather than
  silently converted into something they are not. The earlier road-hazard
  revision deliberately retired pre-hazard Fresh-route records.
- Things will look, sound, and handle differently in later builds. If the ride
  feels wrong somewhere — a control that fights you, a line that should work
  and doesn't — the repository linked above is the place to say so.

There is a [roadmap](#roadmap) further down.

![EUC Thrills — Cool Rider airborne after striking a small traffic-island bollard, with the riderless wheel, bollard, road, and city each visible](https://vibezzzcoder.github.io/EUC-thrills/media/euc-thrills-gameplay.png)

*That is not a posed image: the rider clipped the small black bollard beside
the riderless wheel, and the tumble is the game's own crash physics. The close
oblique view is the game's selectable inspection camera; the road and traffic
island remain visible behind the action. The screenshot shows the hand-built
city, which remains the default world.
Fresh routes use seeded procedural generation to rearrange its authored riding
pieces. Both are drawn
by the game at startup, so the repository is small. The root of it is the
game's TypeScript source — see [Building from source](#building-from-source) —
and the playable build that GitHub Pages serves lives under `docs/`,
regenerated with each release. `SHA256SUMS.txt` is a manifest listing the
checksum of every published file except itself.*

## Riding

You are **Cool Rider**, **Trollina**, or **Red Rider**, on a suspension wheel.
The three are the same to ride, down to the last number — the choice changes
what you and your wheel look like and what you shout when it goes wrong. The default ride is a
loop that leaves a plaza, runs a boulevard, crosses a park and a river ford,
climbs a gravel trail, and comes back — with a shortcut through an alley that
is genuinely faster and genuinely riskier. Fresh routes reuse those authored
places in a procedurally generated point-to-point ride with a different shape
each time. Its seed makes that generation repeatable and shareable.

Some of what the wheel does is specific to a real EUC, and worth knowing before
it surprises you:

- **You lean to go.** The throttle tips the wheel forward and the wheel pushes
  back; there is no engine note to chase, only load.
- **The wheel tells you when it is running out.** Take the climb back to the
  plaza at speed and the machine's status light and the HUD warn you that you
  are asking for more than it has left. Push a wheel past that point and it
  tilts the pedals back to make you slow down — which is the real behaviour this
  is modelling, and the reason a rider watches the warning rather than the
  speed.
- **The wheel beeps at you above 40 mph, and it means it.** About one beep a
  second at 40, faster and faster as you climb, and a stream of them at the
  top — the same cadences a real wheel's alarm uses. Ignore them all the way
  to the ceiling and the wheel gives up: the motor
  lets go and you go over the front, exactly as a real one does when you ask for
  more than it has. Backing off even slightly is enough. Riders call sitting
  just underneath that limit *riding the beeps*, and it is the fastest you can
  go without paying for it. If you ride with the sound off, a small warning
  triangle in the same place blinks at the same rate.
- **Watch your pedals in a hard carve.** Lean far enough and a pedal grounds,
  which costs you speed and, if you were fast, the ride.
- **On a Fresh route, watch the road itself.** A dark pothole or a wet spill is
  exactly what it looks like. A spill and a shallow hole set the wheel weaving —
  slow down and it settles; hold your speed and it grows until it puts you
  down. A deep hole at speed is simply a crash, and hopping clears any of them.
  A bush can also start the weave while dragging the wheel, but remains
  pass-through and can never crash you directly. Clean speed, rough ground,
  kerbs, landings, pedal strikes, and the carve you are enjoying do not trigger
  wobble.

Crashes are non-graphic but no longer stiff: the rider tumbles, catches the
ground and walls with their limbs, and settles into a comic rest while the
wheel can bounce and spin away on a hard hit. A bush cushions the tumble rather
than stopping it like concrete. Once the wipeout has settled, any riding input
remounts; wait a little longer and the rider remounts automatically. Either way
you return moving, so a crash costs speed rather than the whole run.

## Controls

Three ways to ride, and **all of them are live at the same time**: a phone with
a pad paired to it, or a laptop with a touchscreen, does not have to choose.

### Touch — phone and tablet

The controls appear on their own on a touchscreen, in both portrait and
landscape. Rotating mid-ride is fine; nothing moves except the size of things.

| Action | Control |
|---|---|
| Accelerate | Push the floating stick up |
| Brake, and reverse from a standstill | Pull the floating stick down |
| Carve | Move the stick left or right — diagonal movement rides and carves together |
| Crouch, and charge a bigger hop | Hold **CHARGE** — the touch equivalent of `Shift` |
| Hop | Tap **HOP** — the touch equivalent of `Space`; hold **CHARGE** first for a bigger jump |
| Swing the paddle | Tap **SWING** — the touch equivalent of `F`. It only appears in Knockabout |
| Pause · quick reset · camera view | The three small buttons along the bottom |

The stick has no fixed spot: **put your thumb down anywhere on that side of the
screen and ride from there.** It follows your thumb rather than making you
find it. Up/down is the same forward/braking lean as `W`/`S`; left/right is the
same carve as `A`/`D`.

Three things in **Settings → Touch controls**: whether the controls are shown
at all (they work it out for themselves by default, and you can force them on
or off), a **left-handed layout** that mirrors the two sides, and a **size**
that scales the controls and both stick axes together — a bigger stick is a
gentler one, not a twitchier one.

### Keyboard

| Action | Keys |
|---|---|
| Accelerate | `W` or `↑` |
| Brake, and reverse from a standstill | `S` or `↓` |
| Carve left | `A` or `←` |
| Carve right | `D` or `→` |
| Hop | `Space` |
| Crouch, and charge a bigger hop | `Shift` |
| Swing the paddle — Knockabout only | `F` |
| Quick reset — back to the start, or restart the current run | `R` |
| Mute | `M` |
| Camera view | `C` |
| Pause | `Esc` |

Every key above except `Esc` can be reassigned in **Settings → Controls**.
`Esc` always pauses, and `F3`/`F4` open developer overlays.

### Gamepad

A standard controller works alongside the keyboard and the touchscreen — all of
them stay live at once, so you can put the pad down mid-ride and keep going on
the keys, or on your thumbs.

| Action | Control |
|---|---|
| Accelerate | Left stick forward, right trigger, or D-pad up |
| Brake / reverse | Left stick back, left trigger, or D-pad down |
| Carve | Left stick left and right, or D-pad left and right |
| Hop | A |
| Crouch, and charge a bigger hop | Left bumper |
| Swing the paddle — Knockabout only | Right bumper |
| Quick reset | X |
| Camera view | Y |
| Pause | Start |
| In menus | Left stick or D-pad to move, A to confirm, B to go back; on the Fresh-route seed field, A rides the seed shown |

The stick dead zone is adjustable in Settings, and the pad can be switched off
there entirely. Face-button names are the Xbox layout; a PlayStation pad
reports the same positions (A is ✕, B is ○, X is □, Y is △).

## Modes

### Start ride

Free ride in the world currently loaded: no clock, no objective, nothing to
fail. In the city, ride the loop or ignore it entirely and go and look at the
river.

### Time trial

Race from the start line through five more checkpoints. The HUD points toward
the next one and shows the distance; each crossing shows your split and, once
you have a time to beat, how far ahead or behind you are.

- Scoring is **pure elapsed time**. Top speed and landing quality are shown for
  interest and count for nothing.
- Beat your best and the next attempt adds a translucent replay rider, so you
  can see *where* the time changed. Results break the run down leg by leg.
- In the hand-built city, the safe route and the faster alley cross the same
  checkpoints, so both lines remain comparable.

### Knockabout

Carry a padded paddle along a Fresh route and knock down the yellow targets
standing on its verges.

- Time a swing while holding a line near the target for a clean hit.
- Riding into a target also knocks it down. The target never becomes a solid
  wall and never causes a direct crash, but the clumsy hit sheds speed and adds
  a recoverable wobble.
- Your score is targets struck out of the route's total. The clock is shown but
  counts for nothing: there is no time limit or miss penalty, and a target you
  pass stays standing until you come back for it. The run ends when all are
  down.
- The hand-built city has no targets. Choosing Knockabout there opens the route
  generator; Knockabout personal bests are kept per route and never overwrite
  time-trial records.

### Police chase

Officer Dorkins starts behind you on a Fresh route. Survive for five minutes to
escape.

- Dorkins rides the same terrain, grip, hazards, kerbs, crashes, and recovery as
  the player. He can pursue along the route in either direction and cut across
  the field when you leave the road.
- On a clear straight he can hold the wheel just under its cutout, so simply
  pinning the throttle will not leave him behind. Corners, hazards, rough ground,
  and a cleaner line are where the gap comes from.
- He is a tracker: he always knows where you are, and a gap you stretch past
  his reach gets closed — he turns up on the road behind you again, at your
  pace, siren rising as he comes. Distance buys breathing room, never safety;
  the escape is surviving the clock.
- He alone carries the padded paddle. A strike costs speed and adds a
  recoverable wobble; crashing while he is close is the bust.
- The route is the arena. Going far into the surround puts a warning on screen
  with an arrow back to the road and a countdown, and ends the run if you do not
  return. Camping just off the road is not a safe loophole—the cop follows.
- Survival records are kept per Fresh-route seed and do not overwrite time-trial
  or Knockabout records.

### Fresh route

Procedurally generate a new place to ride. Choose **Surprise me** for an instant
seed, or type a seed to rebuild the same place every time; then ride it freely,
start its time trial, play Knockabout, or start a Police chase.

**You do not have to come back here for another one.** Pause during any ride,
or finish a run, and **New route** builds a fresh course and puts you straight
back into whatever you were playing — same chase, same time trial, new place.
This screen is for when you want to type a seed a friend sent you, share a link
to the one you are on, or start a time trial on a specific route.

The seed stays visible and becomes part of the address, so sending the link
sends the same ground. Personal bests and ghosts stay with that route and are
kept per route, not per rider—switching riders changes nothing about your
records.

## Riders

The line under the title screen's buttons says who you are riding as, and
opens the chooser. There are three, and the difference is entirely cosmetic:
**Cool Rider** in black moto gear with reflective blue panels and a full-face
helmet; his clothes and riding style are based on what the project owner wears,
credited at [@edwin_rodmen](https://www.instagram.com/edwin_rodmen/). Cool Rider
does not reproduce the owner's face, and the fictional character name is not
the owner's public name or nickname. **Trollina** began life as a joke drawing somebody sent the
author to make fun of the graphics and ended up in the game; and **Red Rider**,
a real rider who asked to appear and is in the game with his permission — his
red-and-black armour, harness, and camera are his, and he is the first rider
whose machine looks different too, a red saddled wheel modelled on his own
customized machine. Each has their own crash sound. None is faster, and
Red Rider's wheel rides identically to the standard one, down to the last
number. His public riding/photography persona is credited as
[@r3d__rider](https://www.instagram.com/r3d__rider/) at his and the project
owner's direction; no legal or private identity is published, and his likeness
appears here with permission for this game only — see [`NOTICE.md`](NOTICE.md).

## Settings

Quality, field of view, and speed units (km/h or mph); master, ride, and
warning volumes on separate faders, so the wheel can still warn you with
everything else turned down; full key rebinding; gamepad toggle and dead zone;
on-screen controls, handedness, and control size.

The ride itself is **identical at every setting** — nothing you can change
alters how the wheel behaves, so a time set on Low is comparable with a time
set on High, and a time set with thumbs is comparable with one set on keys.

## Saving, and your data

Your settings and your best times are saved **in your own browser** and go
nowhere else. There is no account, no server, and no analytics; the game makes
no network requests after it loads. Clearing your browser's site data for this
page clears your times with it — there is deliberately no in-game button that
can delete them by accident.

Every route keeps its best time. If many seeded routes eventually fill the
browser's storage, the game recycles the **oldest ghost replay first** and keeps
that route's time and splits. There is no storage inbox for you to manage.

In a private window, or with site data blocked, the game still runs and still
times you; it simply says up front that nothing will survive the tab closing.

## Requirements

A current browser with WebGL2 — Chrome, Edge, Firefox, or Safari, on a desktop,
a laptop, a phone, or a tablet. Hardware acceleration should be on; if the
browser cannot give the game a graphics context it says so on the loading
screen rather than sitting blank.

On a phone the game is doing the same work it does on a desktop, so an older
handset will run it slower. **Quality** in Settings is the first thing to turn
down, and it changes nothing about how the wheel rides.

## Building from source

This repository is the source. `src/` holds the game as readable TypeScript
with its tests beside it; `tests/` holds the browser suite; `docs/` is the
built game that GitHub Pages serves and is regenerated per release, so there
is never a reason to edit anything in it.

```
npm install
npm run dev            # play your working copy locally
npm run typecheck
npm test               # the headless suite — over a thousand tests, no browser needed
npm run test:browser   # the Playwright suite (once: npx playwright install chromium)
npm run build
```

Two honest notes. The repository is a per-release snapshot of a private
working tree, so its history moves one release at a time — see
[`CONTRIBUTING.md`](CONTRIBUTING.md) for how a pull request lands. And some
code comments cite internal design documents (a plans file, a design bible)
that are not part of this distribution; the code stands without them.

## Roadmap

Direction, not a release schedule. There are no dates and the order is not a
priority list. The first group is accepted direction; everything in **Ideas**
may change or never happen.

### Planned direction

- **Player-hosted multiplayer.** A basic invite-based peer-to-peer or LAN game
  is planned. Police chase now supplies the first concrete game shape and the
  third rider, but this build is still single-player and the cop is CPU-driven.
  Multiplayer will not depend on accounts, cloud saves, or a central game
  server.

### Recently landed

- **A third rider, and the first with his own wheel.** Red Rider — a real
  rider who asked to appear, in the game with his permission — joins the
  chooser in his own gear on a red saddled wheel modelled on his customized
  machine. Cosmetic-equal like the others, with his own crash sound.

- **Police chase.** Officer Dorkins now pursues any playable rider across
  Fresh routes, including off-road escapes. Survive five minutes, avoid his
  paddle, and use the same terrain and hazards he has to ride. The single-player
  mode is complete; player-hosted multiplayer remains future direction.

- **Knockabout.** The mode the roadmap called "something to swing at" is in
  this build, under its real name. Fresh routes carry targets on the verge and
  the rider carries a padded paddle. The first owner ride found the mode fun
  and its forgiving body knock fair; more rider feedback is welcome.

- **Fun wipeouts and soft bushes.** Crashes now use a short-lived active
  ragdoll with a protective, non-graphic tumble; hard impacts give the wheel
  its own bounce and spin-out. Bushes changed from solid blocks to soft foliage
  hazards that drag, wobble, and cushion without directly causing a crash.
- **Wobble, redesigned, with readable road hazards.** Speed wobble was the
  missing third EUC risk, and it arrived the way the roadmap promised: paired
  with spills and potholes that can be seen and avoided, so it is recoverable
  and situational rather than the thing that ruins an ordinary carve. It is
  live in this build on Fresh routes, with soft foliage as the corresponding
  off-road hazard in every world that contains bushes.
- **Performance verification is complete.** Generated routes carry structural
  draw-call and triangle limits, and both the desktop and the handset ride
  checks are done.

### Ideas under consideration

- **Jump lines and airtime.** A deliberate sequence of ramps, a jumpable tall
  platform, and off-road hill crests that let the wheel properly leave the
  ground are among the clearest repeated rider requests.
- **More challenges and progression.** Flow, hill-climb, technical-trail,
  downhill, delivery, scoring, crash-count, and meaningful reward ideas all
  belong here; none has a settled ruleset yet.
- **A living closed-loop course.** A separate hand-built route with moving
  animals or cars is accepted in principle. It could also be the natural home
  for a different time of day without changing the generated routes.
- **More racing.** Preset skill-level and developer ghosts, AI riders, and
  routes with genuinely different lines beside your own saved ghost.
- **More world.** Downtown, hillside, industrial, deeper woodland, and more
  riverside — while protecting the city-to-trail transition riders already
  like.
- **More rider voices.** Varied crash reactions and occasional hop, carve,
  impact, and top-speed calls, without turning the ride bed into chatter.
- **More character and presentation.** A richer procedural look, more wheels
  and cosmetic-equal riders, a custom wheel designer, music,
  helmet/wheel/replay cameras, and photo mode.
- **More for the phone.** The controls are in and the game is properly
  playable on one; what is not there yet is anything that takes advantage of
  it — a layout that adapts to a folding screen, haptics on a landing or a
  pedal strike, or a way to keep riding with the screen off.

### Deliberately not planned

Hosted multiplayer servers, accounts, cloud saves, a story campaign, an in-game
economy or marketplace, and VR. The player-hosted plan above is intentionally
small: the game asking you to sign in to ride is exactly what it is trying not
to be.

## Licence

Code is **MIT**. Original game assets are **CC BY 4.0**. Four of the eight
shipped sounds derive from public-domain (CC0) recordings; two crashes derive
from the author's own recording — the third rider's is that same wipeout with
the author's voice removed; and the second rider's crash is a composed one-shot
whose voice is machine-generated and is therefore excluded from the CC BY 4.0
claim. Cool Rider is an original fictional character whose clothes and style
draw on what the project owner wears; Red Rider is a real person represented
with permission, and no licence in this project covers his name, likeness, or
persona. Full terms,
attribution, and per-file provenance are in [`LICENSE`](LICENSE) and
[`NOTICE.md`](NOTICE.md).

The wheels in this game are original fictional designs — one is modelled, with
its rider's permission, on his own customized machine, without reproducing any
manufacturer's identity. This project is not affiliated with, endorsed by, or
associated with any electric unicycle manufacturer or retailer.
