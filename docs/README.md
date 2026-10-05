# EUC Thrills

**One wheel. Total freedom. Ride anywhere.**

An open-source arcade riding game about electric unicycles, played in the
browser. Lean into the throttle, carve a line through town, hop a kerb, and
take the alley when you think you can hold it.

> **Play:** [https://vibezzzcoder.github.io/EUC-thrills/](https://vibezzzcoder.github.io/EUC-thrills/)
>
> **Source:** [github.com/VibezZzCoder/EUC-thrills](https://github.com/VibezZzCoder/EUC-thrills) — an original work by [VibezZzCoder](https://github.com/VibezZzCoder)

![EUC Thrills in Ultra graphics — a Police chase across the town's brick plaza: Cool Rider rides toward the camera while Officer Dorkins, paddle out, closes in a few metres behind; the screen reads "He is right behind you" and SURVIVE 4:56, and behind them stand warehouses, a green apartment block, the brick water tower and two parked vans, with bollards and trees on the plaza and the rider's long shadow on the brick](https://vibezzzcoder.github.io/EUC-thrills/media/euc-thrills-gameplay.jpg)

**This is a work in progress.** The riding is the part that is meant to be
right; everything around it is still growing, and later builds will look,
sound, and handle differently. Saved times are kept against the exact course
they were set on, and a course or save-format change retires the old ones
rather than quietly converting them. **This build is one of those changes:**
the people and traffic now on the roads change the courses, so earlier times
and ghosts in the town, on every Fresh route, in the Original city and at
Switchback Park start fresh — only BelVar Circuit keeps its records. If the
ride feels wrong somewhere — a
control that fights you, a line that should work and doesn't — the repository
above is the place to say so.

## Riding

You ride a suspension wheel around a town. The game opens on a ring of streets
that leaves a plaza and comes back to it: shops and a boulevard downtown, houses
and a kerb run in the residential quarter, a fork where an alley offers a
quicker and riskier line, a park that drops down to a river ford, a gravel
trail with a berm and a kicker, and a rough road home past an industrial yard
and up the climb into the plaza. Side streets and cross streets run through the
shopping and residential blocks, so there is often more than one way round.
Every quarter has a landmark you can steer by from a long way off — a TV tower
beside the plaza, a church steeple at the fork, a clock tower at the park gate,
a fire lookout at the trailhead, and a water tower and a pair of boiler-house
chimneys in the yard.

The town is lived in. People walk the pavements, a pair stops to talk,
joggers and other wheel riders use the park paths, a couple of vans circle
the side streets, and a worker and a van keep the industrial yard busy.
Downtown has a coffee bar, a grocer and a repair shop you can see into, with
people inside, and you can hear the café, the workshop and the yard as you
ride past. Garden shrubs, trees and fences line the houses and the park, and
the shop forecourts and the yard driveway are paved.

That town is generated rather than built by hand: it is the route named `euc`.
**Fresh route** builds a new town from the same pieces, a different shape every
time, and usually with its own shops, people and traffic.

Beside the towns there are three places built by hand, and they stay exactly
where they are: the **Original city**, the hand-built loop the game used to
open on — a plaza, a boulevard, a park and a river ford, a gravel trail, and an
alley shortcut — and still the route everything else is measured against;
**BelVar Circuit**, a kart-scale lap (see **Track Day**); and **Switchback
Park**. They have people of their own, kept off the riding line where there
is one: walkers on the Original city's plaza and riverside with joggers and
wheel riders along the river, visitors, a worker and a van in BelVar's
paddock, and a jogger up by Switchback's summit.

**Switchback Park** is a jump lap — about 950 metres of forested hillside with
some fourteen metres of height in it, ridden as a loop: you come down through
the trees and climb a fire road back up. Nine features sit along it — a ledge
drop, a gap, a skinny plank, a step-up, a short flight of stairs taken
downward, three rock terraces in a rhythm, a kicker onto a level table, a shelf
to spin off, and a crest partway up the fire road. **Every one of them is
optional.** Each takes one half of the trail and leaves the other half as a
bypass that never asks you to leave the ground, and every one is signed before
you reach it: a board on a post points **TECH** (**AIR** at the kicker) one way
and **SAFE** the other, the same pair is painted on the trail further back,
chevrons and an arrow mark the two lines, a word goes where a word helps
(**DROP** at the ledge, **DOWN** at the stairs, **AIR** at the kicker, **180
TAP** at the spin shelf), and a painted landing box marks the kicker and the
shelf. **Track Day** offers it
directly; **Trick Run** scores ninety seconds on it; **Fresh route** loads it to
ride freely, and a couch room can race three laps of it.

Some of what the wheel does is specific to a real EUC, and worth knowing before
it surprises you:

- **You lean to go.** The throttle tips the wheel forward and the wheel pushes
  back; there is no engine note to chase, only load.
- **It is geared for about 65 mph, and is handy at walking pace.** Held flat
  out on a long straight it is doing nearly 58 mph within six seconds — which
  is where the beeps begin (next). At the other end, a full-lock turn at
  walking pace fits inside a lane, and backwards riding reaches about 15 mph —
  asked for from a standstill, twice.
- **It beeps from about 58 mph, and it means it.** About one beep a second when
  they start, faster as you climb, a stream of them at the top. Ignore them all
  the way to the ceiling, about 62 mph, and the motor lets go and you go over
  the front, exactly as a real one does. Flat out, that is under three seconds
  of warning. Backing off even slightly is enough. Riders call sitting just
  underneath that limit *riding the beeps*. With the sound off, a warning
  triangle blinks at the same rate.
- **The wheel tells you when it is running out.** Take the climb back to the
  plaza at speed and the status light and the HUD warn you that you are asking
  for more than it has left; push past that and it tilts the pedals back to
  make you slow down.
- **Watch your pedals in a hard carve.** Lean far enough and a pedal grounds,
  which costs you speed and, if you were fast, the ride.
- **In the town and on every Fresh route, watch the road itself.** A spill or a
  shallow pothole sets the wheel weaving — slow down and it settles, hold your
  speed and it puts you down. A deep hole at speed is simply a crash, and
  hopping clears any of them. Bushes are foliage rather than walls: the wheel
  pushes through, loses speed, and takes one jolt. Clean speed, rough ground,
  kerbs, landings, pedal strikes, and the carve you are enjoying never start
  the weave. (The Drunkard weaves on his own with your hands off the stick, and
  that is the character, not the wheel — see **Riders**.)
- **People and vans are solid.** Ride into one at more than about 8 mph and
  you go over the front; slower, you scrub or slide off them as you would off a
  wall. People step out of your way when they see you coming, a bumped one
  flinches and nobody falls over, and the traffic waits for you.

Crashes are non-graphic but not stiff: the rider tumbles, catches the ground
with their limbs, and settles into a comic rest while the wheel can bounce and
spin away. Any riding input remounts once the wipeout has settled, and waiting
a little longer remounts you anyway — either way you return moving, so a crash
costs speed rather than the whole run.

## Modes

**Start ride** — free ride in the world currently loaded, which is the town
until you choose otherwise. No clock, no objective, nothing to fail — and the
way to practise the Original city, BelVar Circuit or Switchback Park with
nothing running.

**2–4 Players (desktop)** — up to four riders on one screen. On a
desktop-shaped machine the title screen offers **2–4 Players**: each player
presses a button on their own controller — a gamepad, or this keyboard — to
take a seat, picks their rider (you ride as different characters), chooses
where the room is riding and what it is playing, and **Start riding** puts you
in the world together, each in your own pane with your own camera and HUD. Two
of you split the screen in halves; three or four get a two-by-two grid, and
with three the spare quadrant becomes the room's scoreboard. Any player can
pause for everybody, and each of you beeps, crashes, and recovers on your own.
Riders are solid to each other: ride into a friend and you both get shoved
apart, however fast you met, and an ordinary bump never knocks anybody down.
Nothing a couch session does is saved, except that opening it with Ultra
graphics on switches your saved quality to High. The mode is desktop-only: it needs a
window at least 1000 pixels wide to keep the panes readable, so a phone never
sees the button.

The join panel offers five things to do, and the pause menu and the results
card both let you swap between them without going back to the title. Choosing
Knockabout on a place without targets or enough starting room, or the chase on
a place built by hand, automatically builds a fresh course and takes everybody
there, keeping each controller assigned to the same rider:

- **Free ride** — the world, shared. No clock, no objective, nothing to fail,
  and no paddles.
- **Race** — three laps of **BelVar Circuit** or **Switchback Park**, up to
  four of you; which one is the **Where to ride** row's answer, on the join
  panel or on the Fresh route screen before anybody sits down. Everybody sits
  frozen on the grid through a countdown and launches on GO; from there it is
  Track Day's lap rules for each rider — the line always ends a lap, a lap that
  skipped a sector line does not count, and the grass verge is a mistake rather
  than cheating — with one clock for the whole room. Your pane shows your
  position, lap, and the gap to the rider ahead; quick reset (`R`) is a
  decision, and it costs you the lap you are on and nobody else's. When the
  leader takes the flag everybody else finishes the lap they are on, a finished
  rider keeps riding under a banner with their place locked, and the card lists
  the room by laps, then by time — two riders who cross together share the
  place, and the card counts what each of you landed the way Track Day's does.
  No records, no ghost. Choosing it on a place that does not close a lap — the
  town, the Original city, or any Fresh route — takes the room to BelVar.
- **Knockabout** — a bout, for two, three or four of you. You each carry a
  paddle, and **the first to five knockdowns takes the match**. A committed
  swing that lands puts the rider you hit on the floor; a rider who has just
  gone down is briefly untouchable, so nobody is held there. The route's
  yellow targets are still out there and still worth hitting — the corner of
  every pane lists every rider's knockdowns and targets struck — but **no
  number of targets wins a bout**, and a target any of you knocks down is
  gone for all of you. Riders on the same tally share a place, and a match
  that ends level is **drawn**, named for the riders tied at the top. Three
  and four start together: the room is placed in a ring on clear ground,
  everybody out of everybody's paddle reach and facing the middle, and a
  short **3 – 2 – 1** count holds you there until GO; the draw is fresh
  every bout, so nobody keeps a corner. Two of you still start the moment
  the world loads, on the same line as before. Like everything else on the
  couch, a match is not saved. It needs a course with targets — the town and
  every Fresh route have them; the join panel opens the route generator when
  needed, and the pause and results menus build a suitable course
  automatically.
- **Trick Run** — ninety seconds at **Switchback Park** for everybody at once,
  one clock and a score per pane; the rules are the solo mode's below, nothing
  is saved, and nobody is declared the winner — the numbers are the room's to
  argue about.
- **Police chase** — up to three of you on the run from one cop, for five
  minutes. **Any one of you can be the cop**: on this ride, and only this one,
  Officer Dorkins joins the rider wheel on the seat cards, once, and whoever
  picks him is the cop — the card says so. Nobody on him, and CPU cops fill the
  room to four: two of them against two of you, one against three. Four humans
  always include the cop; if nobody picks him, the last seat to sit down is
  dealt him. Everybody, cops included, holds through a **3 – 2 – 1** count.
  The solo chase's rules hold for every outlaw: a crash with a cop close, or
  riding into one, is a bust. A human cop is the only seat with a paddle, and
  his pane shows the clock, how many he has busted out of how many, and an
  arrow and a distance to the nearest outlaw; he wins by busting everybody
  before the five minutes are up.
  He gets no help from the game — nothing puts him back behind you if you
  shake him, and his quick reset only picks him up where he fell. An outlaw's
  quick reset is giving up, and counts as a bust. A busted outlaw keeps a pane
  and watches the nearest rider still standing — the camera button switches
  who — and the card ranks the outlaws by how long they stayed free and names
  who busted each one. It runs in the town or on a Fresh route: the join panel
  opens the route generator when needed, and the pause and results menus build
  one automatically.

**Time trial** — race from the start line through five more checkpoints. The
HUD points at the next one and shows the distance; each crossing gives you a
split and, once you have a time to beat, the gap. Scoring is pure elapsed
time — top speed and landing quality are shown for interest and count for
nothing. Beat your best and the next attempt adds a translucent replay rider,
so you can see *where* the time changed. Where a route offers a way round — the
alley, a side street — both lines cross the same checkpoints, so every line
stays comparable. The people and traffic start from the same places
at every start — here and in Trick Run, Track Day and the couch race — so an
attempt never depends on where they had wandered to.

**Trick Run** — ninety seconds at Switchback Park, and points for what you
land. The button takes you straight to the park and starts the clock on the
first step; the lap does not matter and nothing ends the run but the clock.
Every flight you land is worth its tricks: a clean landing is 10, a charged
hop 25, a landed 180 is 200 and a one-foot air 100; two different tricks in one
flight add 50; a clean landing multiplies the flight's tricks by 1.25, a heavy
one leaves them alone and a wobble halves them; a crash costs you the flight
you were in and nothing you had banked. **Tricks only score on a flight that
left the ground from one of the nine features**; a 180 or a one-foot air off a
flat hop is as rideable as ever and worth its landing, and the pane says *off
feature* so you know why. **Each feature pays in full once a minute**: hit the
same one again sooner and the whole flight pays half, then a quarter, and the
game forgets one of those repeats for every minute you leave it alone — so
the score is in riding the lap, not in camping one kicker. Your pane shows the
clock, your banked score, a charged hop still in the air as *pending*, and the
last thing you landed. The card at the end shows where every point came from,
and a completed solo run is compared with your best at the park; **Ride it
again** starts another. A run ended early from the pause menu is shown but
never saved.

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

**Knockabout** — carry a padded paddle round the town or a Fresh route and
knock down the yellow targets on its verges. Time a swing while holding a line
near a target for a clean hit; riding through any visible part of a stand also
works, but the clumsy hit sheds speed and adds a recoverable wobble. Your score
is targets struck out of the route's total, the clock counts for nothing, and a
target you pass stays standing until you come back for it. The places built by
hand have no targets, so choosing Knockabout on one of them opens the route
generator.

**Police chase** — Officer Dorkins starts right behind you, two more patrol
cops are waiting further round the town, and you survive five minutes to
escape. It runs in the town and on any Fresh route; on a place built by hand
the button opens the route generator.

- The cops ride the same terrain, grip, hazards, kerbs, crashes, and recovery
  you do — they are CPU riders, not obstacles on a rail. They pursue in either
  direction, cut across the field when you leave the road, and ride round
  people rather than through them.
- On a clear straight they ride right up near the wheel's top speed, so
  pinning the throttle will not lose them. Corners, hazards, rough ground, and
  a cleaner line are where the gap comes from.
- A patrol wakes when you ride near it, and it joins in. The cops are
  trackers, too: stretch a gap and it gets closed — a cop turns up on the road
  behind you again, at your pace, siren rising, and another can be sent ahead
  to wait on your road as a roadblock. None of them is ever put back where you
  can see it happen, and a quiet spell is answered within seconds. Distance
  buys breathing room, never safety.
- Hiding does not work for long. Duck behind a building or a wall and a cop who
  is close rides round it to reach you, and stopping altogether invites a
  strike.
- Only the cops carry paddles. A strike costs speed and adds a wobble; crashing
  with any cop close is the bust, whatever you crashed into — a pedestrian or
  a van included.
- Hands off the law: riding into any cop is an instant bust. Contact only
  counts when you are the one closing — a cop running you down scores nothing.
- The route is the arena. Going far into the surround puts a warning and a
  countdown on screen and ends the run if you do not come back; side streets
  are part of the route. Camping just off the road is not a loophole — they
  follow.

**Fresh route** — generate a new place to ride. **Surprise me** builds one in
a few seconds, behind a loading screen; typing a route name (old hands call it the seed) rebuilds the same
place every time, which is how you send one to a friend — the town the game
opens on is `euc`. A rare name may not produce a valid route, and the game says
so and asks for another rather than quietly building something else. The name
stays visible and becomes part of the address, so sharing the link shares the
ground.

That screen is also where the places built by hand are chosen. A **Where to
ride** row offers the **Original city**, **BelVar Circuit** and **Switchback
Park**; pressing one loads it there and then and says so, and **Back** takes
you to the title, where **Start ride** rides it. With Switchback Park selected
the screen also offers **Trick Run** directly. (**Track Day** asks for its
track itself, so it needs no visit here.) Those places have addresses of their
own — `?level=switchback` opens Switchback Park, and `?level=slice` the
Original city — so such a link shares as cleanly as a route name does.

You do not have to come back to that screen for another course. Pause during
any ride, or finish a run, and **New route** builds a fresh one and puts you
straight back into whatever you were playing.

Records are kept per course and per mode: time trial, best lap, Knockabout,
Trick Run score and chase survival never overwrite each other, and switching
riders changes nothing about any of them. Each venue is its own course, so a
best lap at BelVar Circuit and a best lap at Switchback Park keep their own
times and their own ghosts. (Times set before the living-world update are
kept in your browser but no longer shown, except at BelVar Circuit, whose
records carry over.)

## Riders

There are nine, the line under the title screen's buttons says who you are,
and that line opens the chooser. Eight of them differ only in **looks and
sound** — each has their own crash sound, none is faster, and the custom wheels
ride identically to the standard one, down to the last number. The Drunkard
shares that same speed, grip and braking but rides his own way on purpose: a
slow weave and the odd stumble that really do move him about the road. See
The Drunkard below for what that is and is not. (Officer Dorkins is not one of
the nine: he is the law, and the only way to ride as him is to be the cop in a
couch **Police chase**.)

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
| Swing the paddle — Knockabout, or the cop in a couch chase | `F` |
| Quick reset — back to the start, or restart the run (in a race it costs you the lap; as an outlaw in a couch chase it means giving up) | `R` |
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
| Swing the paddle — Knockabout, or the cop in a couch chase | Right bumper |
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

Quality (Low, Medium, High, or Ultra — below), field of view, and speed units;
master, ride, and warning volumes on separate faders, so the wheel can still
warn you with everything else turned down; full key rebinding; gamepad toggle
and dead zone; on-screen controls, handedness, and size. A phone or tablet
starts on Medium the first time it plays and a desktop on High; whatever you
choose after that is kept.

The ride itself is **identical at every setting** — nothing you can change
alters how the wheel behaves, so a time set on Low compares with one set on
Ultra, and a time set with thumbs compares with one set on keys.

**Ultra graphics** is an optional fourth quality level for riding alone, on a
desktop or a phone. It is never on unless you turn it on: with the **Ultra
Graphics** button on the title screen, beside **Settings**, or with **Settings →
Quality → Ultra**. Both are the same saved choice, and switching the title
button off takes you back to the quality you had. Ultra lights the world from
its own sky, gives buildings, trees and riders crisp shadows that carry on into
the distance, grounds the riders with soft contact shade, and adds detail to
facades, trees, road edges and the sky. It asks a lot of the graphics chip —
the title button says *Higher GPU demand*, and Settings says smoothness and
battery use vary by device. Switching takes a few seconds behind a loading
screen that says **Loading Ultra graphics…** (or **Turning Ultra off…**), and
presses are ignored until it is done. Loading a new place also takes a moment
longer with Ultra on. If your device cannot start it, the game says so and
draws High instead. Ultra is for riding alone: opening **2–4 Players** with it
on switches you to High, and it stays High afterwards — turn Ultra back on when
you ride alone again.

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
than sitting blank. The first load takes several seconds while the town and its
street life are built — the loading screen counts the steps — and if a download
fails it offers **Retry loading**.

On a phone the game is doing the same work it does on a desktop, so an older
handset will run it slower. **Quality** in Settings is the first thing to turn
down, and it changes nothing about how the wheel rides. **Ultra** wants a
capable graphics chip on any device; if it stutters, High is one press away.

## Building from source

This repository is the source. `src/` holds the game as readable TypeScript with
its tests beside it; `tests/` holds the browser suite; `docs/` is the built game
that GitHub Pages serves and is regenerated per release, so there is never a
reason to edit anything in it.

```
npm install
npm run dev                         # play your working copy locally
npm run typecheck
npm run test:groups                 # available headless groups
npm test -- src/input/bindings.test.ts
npm run test:browser -- tests/touch.spec.ts  # once: npx playwright install chromium
npm run build
```

Choose tests for the changed behavior and the contracts it affects. `npm test`
requires file names or `--group=<name>`; `test:browser` requires file names or
`-g <title pattern>`. `test:browser:one` and `test:browser:serial` also require a
target and run Chromium with one worker; they do not mean one test case.
`test:browser:smoke` runs a small fixed set of UI checks.

When a broad regression check is justified, use `npm run test:full` for every
headless test available in this checkout, or `npm run test:browser:full` for the
functional browser suite. Wall-clock budgets run separately with
`npm run test:performance`, on an otherwise idle machine. The public snapshot
omits private release tooling and its tests, so the `release` headless group is
unavailable here. Avoid running expensive suites concurrently or repeating a
suite when the relevant inputs have not changed.

Two notes for contributors. The repository is a per-release snapshot of a
private working tree, so its history moves one release at a time — see
[`CONTRIBUTING.md`](CONTRIBUTING.md) for how a pull request lands. And some code
comments cite internal design documents that are not part of this distribution;
the code stands without them.

## Roadmap

Direction, not a release schedule. No dates, and the order is not a priority
list.

### Accepted direction

- **A desktop app to download.** The same game packaged to run as an app on
  Windows, macOS and Linux, for anyone who would rather not play it in a
  browser tab. It is planned next; the browser version stays exactly where it
  is.
- **Multiplayer stays on one screen for now.** Every couch mode the plan named
  — free ride, the bump, a race, Knockabout for up to four, and now the chase —
  has landed (see **2–4 Players** above). Local multiplayer stays a desktop
  thing and the phone stays single-player; playing across two devices is not
  cancelled, but it sits behind all of this.

### Recently landed

- **A living world** (2026-10-05). The towns have people walking the
  pavements, joggers and other wheel riders in the parks, and slow traffic on
  the side streets; downtown has a coffee bar, a grocer and a repair shop with
  people inside, and quiet street sounds to go with them. Gardens, park
  planting, fuller trees and paved forecourts in every quality level, a few
  people at the hand-built places, signed TECH and SAFE lines at Switchback
  Park, a proper loading screen, and phones starting on Medium. People and
  vans are solid, step aside for you, and never fall over; times on the
  changed courses start fresh.
- **A police chase with a pack, and a couch chase** (2026-09-25). Riding
  alone, it is you against Officer Dorkins and two patrols, and the cops got
  much harder to shake: they ride round buildings to reach a rider hiding
  behind one, a quiet spell is answered within seconds, and a patrol can be
  sent ahead to wait on your road. On one desktop screen, two to four of you
  can play it too — up to three outlaws against one cop, who is either one of
  you riding as Officer Dorkins or CPU cops filling the room.
- **Ultra graphics** (2026-09-24). An optional fourth quality level for riding
  alone, on desktop and phone: sky lighting, long crisp shadows that include the
  buildings, contact shade under the riders, and richer trees, facades, road
  edges and skies — with a loading notice while it switches. The ride is
  identical at every quality level.
- **A town to ride round** (2026-09-22). The game now opens on a generated
  town: one ring of streets out of the plaza and back — boulevard, kerb run,
  fork and alley, park, river ford, gravel trail, berm, kicker and the climb
  home — plus shopping and residential blocks with their own side streets.
  Houses have pitched roofs, an industrial yard lines the road home, and six
  landmarks tell you where you are. Every Fresh route is a town of its own,
  and the hand-built city stays as the **Original city**.
- **The overspeed cutout comes sooner** (2026-09-22). Players said they liked
  the high-speed wipeout, and it was too hard to reach: the beeps now start at
  about 58 mph instead of 52, and flat out the cutout arrives after under three
  seconds of them instead of six and a half.
- **Trick Run** (2026-09-13). Ninety seconds at Switchback Park with the four
  counted events given values, a landing-quality multiplier, a bonus for two
  tricks in one flight, tricks that score only from the park's features and
  pay less when the same feature is revisited inside a minute, a per-venue
  personal best, and a couch version for two to four with a score per pane
  and no winner.
- **Knockabout for three and four** (2026-09-13). The paddle bout takes the
  whole room: two, three or four claims on the join panel, a fair ring and a
  3 – 2 – 1 count for three and four, first to five knockdowns, and every
  rider's knockdowns and targets in every pane. Two players start at once,
  exactly as they did.
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
  downhill, delivery and crash-count ideas all belong here; none has a settled
  ruleset yet. Scoring now exists for one run at one park (**Trick Run**);
  progression, upgrades and unlockables are deliberately not part of it.
- **A course that is even more alive.** Animals, more kinds of traffic, and a
  different time of day.
- **More racing.** Preset skill-level and developer ghosts, AI riders sharing a
  course, and more venues to lap. Track Day and the couch race, now at two
  venues, are the first of this; a race against something other than a friend on
  the same screen is still an idea.
- **More world.** More kinds of district, deeper woodland and more riverside in
  the towns, and more places built by hand — while protecting the
  town-to-trail transition riders already like. Switchback Park is a hillside
  of its own rather than more of this world.
- **More rider voices.** Varied crash reactions and occasional hop, carve,
  impact, and top-speed calls, without turning the ride bed into chatter.
- **More character and presentation.** A richer procedural look, more wheels and
  cosmetic-equal riders, a custom wheel designer, music, helmet/wheel/replay
  cameras, and photo mode.
- **More for the phone.** The controls are in and the game is properly playable
  on one; what is not there yet is anything that takes advantage of it — an
  offline copy, haptics on a landing or a pedal strike, a layout that adapts to
  a folding screen.
- **More languages.** The menus in languages other than English.

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
project included. The street sounds that came with the living world are generated
in code as the game runs, and add no sound files. Cool Rider is an
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
