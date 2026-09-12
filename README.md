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

Beside the city there are two places built by hand rather than generated, and
both stay exactly where they are: **BelVar Circuit**, a kart-scale lap (see
**Track Day**), and **Switchback Park**.

**Switchback Park** is a jump lap — about 950 metres of forested hillside with
some fourteen metres of height in it, ridden as a loop: you come down through
the trees and climb a fire road back up. Nine features sit along it — a ledge
drop, a gap, a skinny plank, a step-up, a short flight of stairs taken
downward, three rock terraces in a rhythm, a kicker onto a level table, a shelf
to spin off, and a crest partway up the fire road. **Every one of them is
optional.** Each takes one half of the trail and leaves the other half as a
bypass that never asks you to leave the ground, and the trail is marked before
each one: chevrons counting you in, an arrow pointing at the easy line, a word
where a word helps (**DOWN** at the stairs, **180 TAP** at the spin shelf), and
a painted landing box at the kicker and at the shelf. **Track Day** offers it
directly; **Fresh route** loads it to ride freely, and a couch room can race
three laps of it.

Some of what the wheel does is specific to a real EUC, and worth knowing before
it surprises you:

- **You lean to go.** The throttle tips the wheel forward and the wheel pushes
  back; there is no engine note to chase, only load.
- **It does about 65 mph flat out, and is handy at walking pace.** Top speed
  takes a long straight and about eleven seconds of held throttle. At the other
  end, a full-lock turn at walking pace fits inside a lane, and backwards
  riding reaches about 15 mph — asked for from a standstill, twice.
- **It beeps above 52 mph, and it means it.** About one beep a second when they
  start, faster as you climb, a stream of them at the top. Ignore them all the way to
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
  strikes, and the carve you are enjoying never start the weave. (The Drunkard
  weaves on his own with your hands off the stick, and that is the character,
  not the wheel — see **Riders**.)

Crashes are non-graphic but not stiff: the rider tumbles, catches the ground
with their limbs, and settles into a comic rest while the wheel can bounce and
spin away. Any riding input remounts once the wipeout has settled, and waiting
a little longer remounts you anyway — either way you return moving, so a crash
costs speed rather than the whole run.

## Modes

**Start ride** — free ride in the world currently loaded, which is the city
until you choose otherwise. No clock, no objective, nothing to fail — and the
way to practise BelVar Circuit or Switchback Park with nothing running.

**2–4 Players (desktop)** — up to four riders on one screen. On a
desktop-shaped machine the title screen offers **2–4 Players**: each player
presses a button on their own controller — a gamepad, or this keyboard — to
take a seat, picks their rider (you ride as different characters), chooses
where the room is riding and what it is doing, and **Start riding** puts you in
the world together, each in your own pane with your own camera and HUD. Two of
you split the
screen in halves; three or four get a two-by-two grid, and with three the
spare quadrant becomes the room's scoreboard. Any player can pause for
everybody, and each of you beeps, crashes, and recovers on your own. Riders
are solid to each other: ride into a friend and you both get shoved apart,
however fast you met, and an ordinary bump never knocks anybody down. Nothing
a couch session does is saved. The mode is desktop-only: it needs a window at
least 1000 pixels wide to keep the panes readable, so a phone never sees the
button.

The join panel offers three things to do, and the pause menu and the results
card both let you swap between them without going back to the title:

- **Free ride** — the world, shared. No clock, no objective, nothing to fail,
  and no paddles.
- **Race** — three laps of **BelVar Circuit** or **Switchback Park**, up to
  four of you; which one is the **Riding at** row's answer, on the join panel or
  on the Fresh route screen before anybody sits down. Everybody sits frozen on
  the grid through a countdown and launches on GO; from there
  it is Track Day's lap rules for each rider — the line always ends a lap, a
  lap that skipped a sector line does not count, and the grass verge is a
  mistake rather than cheating — with one clock for the whole room. Your pane
  shows your position, lap, and the gap to the rider ahead; quick reset (`R`)
  is a decision, and it costs you the lap you are on and nobody else's. When
  the leader takes the flag everybody else finishes the lap they are on, a
  finished rider keeps riding under a banner with their place locked, and the
  card lists the room by laps, then by time — two riders who cross together
  share the place, and the card counts what each of you landed the way Track
  Day's does. No records, no ghost. Choosing it on a place that does not close
  a lap — the city, or a generated route — takes the room to BelVar.
- **Knockabout** — a bout, for exactly two of you. You each carry a paddle,
  and **the first to five knockdowns takes the match**. A committed swing
  that lands puts the other rider on the floor; a rider who has just gone
  down is briefly untouchable, so nobody is held there. The route's yellow
  targets are still out there and still worth hitting — the corner of your
  half counts both your knockdowns and your targets struck — but **no number
  of targets wins a bout**, and a target either of you knocks down is gone
  for both of you. If you both reach five on the same instant, the match is
  **drawn**. It needs a course with targets on it, so choosing it in the city
  opens the route generator first. A third player takes it off the menu; its
  four-player rules are not designed yet.

**Time trial** — race from the start line through five more checkpoints. The
HUD points at the next one and shows the distance; each crossing gives you a
split and, once you have a time to beat, the gap. Scoring is pure elapsed
time — top speed and landing quality are shown for interest and count for
nothing. Beat your best and the next attempt adds a translucent replay rider,
so you can see *where* the time changed. In the city, the safe route and the
faster alley cross the same checkpoints, so both lines stay comparable.

**Track Day** — lap a hand-built course. The button asks which: **BelVar
Circuit** is kart-scale, with barriers, kerbs, gravel runoff, a start gantry
and a paddock; **Switchback Park** is the forested jump lap above. Pick one and
it loads and starts you on an out lap to find the throttle; the clock starts
when you cross the line. **Back** leaves you on the title with nothing changed.

- Crossing the line again closes that lap and starts the next one, so the
  session is a run of laps rather than a single attempt. Two sector lines split
  the lap into thirds and give you a gap at each one.
- **The record is your best lap**, and the moment you set one it replaces the
  ghost — so from the next lap on you are racing the lap you just rode, not the
  one you turned up with.
- A lap has to be a lap of the course. Ride out through a barrier gate onto the
  field or the infield at BelVar — or off the trail and across the hillside at
  the park — and that lap will not count; the corner of the screen tells you so
  for the rest of it. Running wide onto the verge is not cheating — it is a
  mistake the surface already punishes.
- **You end the session yourself**: pause, then **End session**. The card
  reports your best lap and its sectors, how many laps counted, and what your
  three best sectors would add up to if you ever put them together on one lap.
- **The card also counts what you landed**: clean landings, charged hops, 180s
  landed, and one-foot airs. They are counts and nothing else — **none of it is
  a score**; nothing is ranked, saved, or spent, and the counts decide nothing
  about the lap.

**Knockabout** — carry a padded paddle along a Fresh route and knock down the
yellow targets on its verges. Time a swing while holding a line near a target
for a clean hit; riding through any visible part of a stand also works, but the
clumsy hit sheds speed and adds a recoverable wobble. Your score is targets
struck out of the route's total, the clock counts for nothing, and a target you
pass stays standing until you come back for it. The city has no targets, so
choosing Knockabout there opens the route generator.

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
- Hands off the law: riding into him is an instant bust. Contact only counts
  when you are the one closing — him running you down scores nothing.
- The route is the arena. Going far into the surround puts a warning and a
  countdown on screen and ends the run if you do not come back. Camping just
  off the road is not a loophole — he follows.

**Fresh route** — generate a new place to ride. **Surprise me** makes one
instantly; typing a seed rebuilds the same place every time, which is how you
send one to a friend. A rare seed may not produce a valid route, and the game
says so and asks for another rather than quietly building something else. The
seed stays visible and becomes part of the address, so sharing the link shares
the ground.

That screen is also where the hand-built places are chosen. A **Riding at** row
offers **The city**, **BelVar Circuit** and **Switchback Park**; pressing one
loads it there and then and says so, and **Back** takes you to the title, where
**Start ride** rides it. (**Track Day** asks for its track itself, so it needs
no visit here.) Those places have addresses
of their own — `?level=switchback` opens Switchback Park — so such a link
shares as cleanly as a seed does.

You do not have to come back to that screen for another course. Pause during
any ride, or finish a run, and **New route** builds a fresh one and puts you
straight back into whatever you were playing.

Records are kept per course and per mode: time trial, best lap, Knockabout, and
chase survival never overwrite each other, and switching riders changes nothing about
any of them. Each venue is its own course, so a best lap at BelVar Circuit and a
best lap at Switchback Park keep their own times and their own ghosts.

## Riders

There are nine, the line under the title screen's buttons says who you are,
and that line opens the chooser. Eight of them differ only in **looks and
sound** — each has their own crash sound, none is faster, and the custom wheels
ride identically to the standard one, down to the last number. The Drunkard
shares that same speed, grip and braking but rides his own way on purpose: a
slow weave and the odd stumble that really do move him about the road. See
The Drunkard below for what that is and is not.

**Cool Rider** wears tailored black moto gear with reflective blue panels,
padded trousers, fingerless gloves and a full-face helmet with a lightly
tinted visor. His original stylized face has natural upper and lower lashes.
His clothes and riding style are based on what the project
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

**Wheel in Motion** is a real rider with a YouTube channel of that name, and
he asked in public — in the same thread where the author had just said that a
real person is only added when that person asks for themselves. The author
checked, and he had. He rides in his blue-and-yellow jersey and a blue lid
with yellow stripes, his channel's mark on his chest, his pack and his wheel,
on a black wheel with cyan-blue pads and orange power pads modelled on his
own customized machine. His crash is the author's own wipeout with the
author's voice removed, until he sends one of his own. His channel is credited
as [Wheel In Motion](https://www.youtube.com/@RealWheelInMotion) at his and
the project owner's direction.

**FloWithZo** is a real racer, and he asked in public too — the ask came from
his own account, written in the third person, so the author repeated that a
real person only goes in when that person asks for themselves, and he said in
the same thread that it was him, then sent two photographs of himself racing
for the character to be built from. He rides in a light silver race suit with
a two-tone band across the hip, a pewter full-face lid over a big dark visor,
black gloves and low pale trainers, under large white knee and shin armour —
plates from above the knee to the ankle, because that is what he races in. His
wheel is his own: a dark performance body between two pale side shells, on
broad pale pedals, with a low orange band on each flank and a small orange
badge on the nose, modelled on the machine in his photographs. His crash is the author's own wipeout with the
author's voice removed, until he sends one of his own. He is credited as
[@flowithzo_euc](https://www.instagram.com/flowithzo_euc) at his and the
project owner's direction.

**Seal on a Wheel** is a real rider too, and he asked for himself: the ask
came on Instagram, in his own words, from his own account, under a post of the
author's about a different project, and the author said he would look into it
and then did. He rides in all black with a light grey
sweatshirt knotted at his waist and hanging down his left hip, a red, white
and black full-face lid, a black day-pack, big hard knee shells, black gloves
with a red knuckle, and low black shoes with a pale yellow sole band; his arms
are bare between a short sleeve and a short glove cuff, which is what makes
him read at distance. His wheel is his own: a tall cyan body trimmed in hot
pink — a broad plate high on the nose, bars along each flank, wedges at the
corners — modelled on the machine in his reference stills. His crash is the
author's own wipeout with the author's voice removed, with **a seal barking
where that voice used to be**: a public-domain recording, mixed in as the
joke his name is, and not a sound of his. He is credited as
[@seal_on_a_wheel](https://www.instagram.com/seal_on_a_wheel) at the project
owner's direction.

**The Drunkard** is not a real person, and that is the point of him. People
kept asking for a rider with a beer; the real riders above are here with their
permission and are not going to be drawn drinking, so the joke got a rider of
its own — a wholly fictional parody in a two-can beer hat with drinking tubes,
a hydration pack full of the wrong drink, a can in his free hand, and a
beer-themed wheel: amber, cream and brown, a hop cone where a logo would go,
and no real brand anywhere on him. **He rides like he looks.** Take your hands
off the stick at speed and he weaves a slow, lazy S down the road, sways with
it, and stumbles every so often; touch the stick and the wheel goes exactly
where you point it, because underneath the theatre he is the same wheel as
everybody else — the same top speed, grip and brakes, measured to a tenth of a
percent, and your best times carry across. If the weave looks like a bug, it is
not; it is him. He is fictional and based on nobody, and nothing in this game
endorses riding under the influence.

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
| 180° spin jump | Tap **HOP** again on the way up — lands you riding fakie |
| One-foot air | Keep **HOP** held down as you leave the ground |
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
| 180° spin jump | `Space` again on the way up |
| One-foot air | Keep `Space` held down as you leave the ground |
| Crouch, and charge a bigger hop | `Shift` |
| Swing the paddle — Knockabout only | `F` |
| Quick reset — back to the start, or restart the run (in a race, it costs you the lap) | `R` |
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
| 180° spin jump | A again on the way up |
| One-foot air | Keep A held down as you leave the ground |
| Swing the paddle — Knockabout only | Right bumper |
| Quick reset · camera view · pause | X · Y · Start |
| In menus | Stick or D-pad to move, A to confirm, B to go back |

The dead zone is adjustable in Settings and the pad can be switched off there.
Face-button names are the Xbox layout; a PlayStation pad reports the same
positions (A is ✕, B is ○, X is □, Y is △).

**The one-foot air is the same gesture everywhere**, on thumbs, keys and pad
alike: keep Hop held as the wheel leaves the ground, and a moment later the
rider takes a foot off the pedal and has it back down before you land. Tap Hop
again instead and you get the 180; let go, tap for the spin, then hold again
and you can have both out of one hop. Ask for it too late on the way down and
nothing happens — there has to be enough air left to see it — and holding
through the landing never gives you a second hop. It is a show move, and that
is all it is: the wheel rides identically with the foot out.

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
npm test               # the headless suite — over two thousand tests, no browser
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

- **More couch multiplayer.** Free ride, the bump, a two-rider Knockabout
  bout, and now a four-seat race have all landed (see **2–4 Players** above).
  What is left is real design rather than a switch: **Knockabout for three or
  four** (free-for-all or teams, and where four paddles start fairly), and
  **couch chase** behind it. The shape is unchanged — local multiplayer on
  desktop, single-player on mobile — and playing across two devices is not
  cancelled but sits behind all of this.

### Recently landed

- **A jump lap, in a place of its own** — **Switchback Park**: about 950 metres
  of forested hillside, lapped on Track Day or raced three laps by a couch room
  of up to four, with nine optional features on it — a ledge drop, a gap, a
  skinny, a step-up, stairs taken downward, rock terraces, a kicker onto a level
  table, a spin shelf and a crest — each one signed on the trail ahead of it and
  each with a bypass line that never leaves the ground. It is a second place to
  lap rather than a change to the city, which is untouched.
- **A one-foot air, and a count of what you land.** Hold Hop through take-off
  and the rider drops a foot off the pedal and has it back before touching
  down — on thumbs, keys and pad. It changes nothing about how the wheel rides.
  Lap and race cards now also count clean landings, charged hops, 180s landed
  and one-foot airs: counts, deliberately not a score.
- **A ninth rider, in black with a cyan wheel** — Seal on a Wheel, a real rider
  who asked for himself on Instagram: a light grey sweatshirt tied at his
  waist, a red-white-black full-face lid, a day-pack and hard knee shells, on
  a tall cyan wheel trimmed hot pink. His crash is the author's wipeout with a
  public-domain seal bark where the author's voice was.
- **An eighth rider, a racer in silver** — FloWithZo, a real racer who asked in
  public, with his own wheel: white armour from above the knee to the ankle, a
  pewter lid over a dark visor, and a dark wheel with pale shells and a low
  orange band.
- **A seventh rider, who rides like he looks** — The Drunkard, a fictional
  parody rider in a two-can beer hat on a beer-themed wheel of his own, with a
  crash voice composed for him. Hands off the stick he weaves and staggers for
  show; on the stick he is the same wheel as everybody, measured.
- **A sixth rider, with his own wheel** — Wheel in Motion, a YouTuber who
  asked in public to be in the game. His channel's mark rides on his chest,
  his pack and his wheel, and the wheel is modelled on his own customized
  machine: black, cyan-blue and orange.
- **A couch race, and four seats.** Up to four riders on one desktop screen —
  halves for two, a grid for three or four — and a three-lap race at BelVar
  Circuit with a countdown, live standings, per-rider lap rules, one shared
  clock, and a results card that reads for the whole room. Measured against
  its own, third graphics budget, so neither the single-player frame nor the
  two-player one gave anything up for it.
- **Knockabout for two.** The paddle mode became a bout: first to five
  knockdowns, targets counted but never decisive, and a draw if you get there
  together. Both halves of the screen show both scores.
- **Riders meet now.** In **2 Players**, riding into each other shoves you both
  apart instead of ghosting through, and an ordinary bump never knocks either
  of you down — only a swung paddle does that.
- **Local split-screen multiplayer, on one desktop** — the **2 Players** mode
  above: two riders, two views, one keyboard-and-pads, no accounts, no server,
  and nothing to connect to. The split frame carries its own, higher graphics
  budget, measured separately, so nothing about the single-player game on a
  phone gave way for it.
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

- **More challenges and progression.** Flow, hill-climb, technical-trail,
  downhill, delivery, scoring, and crash-count ideas all belong here; none has a
  settled ruleset yet. Switchback Park counts what you land, but nothing decides
  what a trick is worth — that ruleset does not exist.
- **A course that is alive.** Moving traffic or animals on a route of their own,
  which could also be the natural home for a different time of day.
- **More racing.** Preset skill-level and developer ghosts, AI riders sharing a
  course, and more venues to lap. Track Day and the couch race, now at two
  venues, are the first of this; a race against something other than a friend on
  the same screen is still an idea.
- **More world.** Downtown, industrial, deeper woodland, and more riverside —
  while protecting the city-to-trail transition riders already like. Switchback
  Park is a hillside of its own rather than more of this world.
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

Code is **MIT**. Original game assets are **CC BY 4.0**. Four of the sixteen
shipped sounds derive from public-domain (CC0) recordings and a fifth carries
one public-domain layer inside it; five crashes derive from the author's own
recording — the third, sixth, eighth and ninth riders' are that same wipeout
with the author's voice removed, rendered four times so that no two of them
are the same file. Five shipped sounds sit
outside the CC BY 4.0 claim, and part of a sixth does: two of the nine crashes
are composed one-shots
whose voices are machine-generated — the second rider's and the seventh's, the
two characters who exist nowhere to be recorded — and so is the seventh
rider's short stumble sound; the fourth and fifth riders' crashes are
**their own contributed recordings**, used in this game with their permission
and with no copyright over them claimed by this project; and the ninth rider's
crash is this project's own render of the author's recording with **one
public-domain seal bark mixed into it**, which is claimed by nobody, this
project included. Cool Rider is an
original fictional character whose clothes and style draw on what the project
owner wears, and The Drunkard is an original fictional character based on
nobody; Red Rider, Adonisb2, Maribel Vargas, Wheel in Motion, FloWithZo and
Seal on a Wheel are
real people represented with permission, and no licence in this project covers
their names, likenesses, personas, or the two riders' own logos. Full terms,
attribution, and per-file provenance are in [`LICENSE`](LICENSE) and
[`NOTICE.md`](NOTICE.md).

The wheels in this game are original fictional designs — five are modelled,
with their riders' permission, on their own customized or raced machines,
without reproducing any manufacturer's identity or any third-party sticker
artwork, and the seventh rider's is modelled on nothing at all. This project is
not affiliated with, endorsed by, or associated with any electric unicycle
manufacturer or retailer.
