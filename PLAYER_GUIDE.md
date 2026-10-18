# EUC Thrills — player guide

The long version of the [README](README.md): how the wheel rides, every
mode, the riders, every control, and what the game saves. Play at
<https://vibezzzcoder.github.io/EUC-thrills/>; the source is at
<https://github.com/VibezZzCoder/EUC-thrills>.

## Riding

You ride a suspension wheel around a town. The game opens on a ring of
streets that leaves a plaza and comes back to it: shops and a boulevard
downtown, houses and a kerb run in the residential quarter, a fork where an
alley offers a quicker and riskier line, a park that drops down to a river
ford, a gravel trail with a berm and a kicker, and a rough road home past an
industrial yard and up the climb into the plaza. Side streets run through the
shopping and residential blocks, so there is often more than one way round,
and every quarter has a landmark to steer by from a long way off.

The town is lived in. People walk the pavements, joggers and other wheel
riders use the park paths, vans circle the side streets, and downtown has a
coffee bar, a grocer and a repair shop with people inside. People and vans are
solid: ride into one fast and you go over the front; slower, you scrub off
them as you would off a wall. People step aside when you are in their way. A
few raised yellow kickers sit on the lawns off the road in free ride,
each marked by a floating arrow: ride up one from any direction and launch.

That town is generated rather than built by hand: it is the route named
`euc`. **Fresh route** builds a new town from the same pieces, a different
shape every time. Beside the towns there are three places built by hand, and
they stay exactly where they are: the **Original city**, the hand-built loop
everything else is measured against — a plaza, a boulevard, a park and a
river ford, a gravel trail, and an alley shortcut; **BelVar Circuit**, a
kart-scale lap with barriers, kerbs, gravel runoff, a start gantry and a
paddock; and **Switchback Park**.

**Switchback Park** is a jump lap: about 950 metres of forested hillside
ridden as a loop, down through the trees and back up a fire road. Nine
features sit along it — a ledge drop, a gap, a skinny plank, a step-up, a
short flight of stairs taken downward, three rock terraces in a rhythm, a
kicker onto a level table, a shelf to spin off, and a crest partway up the
fire road. **Every one of them is optional.** Each takes one half of the trail
and leaves the other half as a bypass that never asks you to leave the
ground, and every one is signed before you reach it: a board points **TECH**
(**AIR** at the kicker) one way and **SAFE** the other, with the same pair
painted on the trail further back.

Some of what the wheel does is specific to a real EUC and worth knowing
before it surprises you:

- **You lean to go.** The throttle tips the wheel forward and the wheel
  pushes back; there is no engine note to chase, only load.
- **It is geared for about 65 mph and is handy at walking pace.** A full-lock
  turn at walking pace fits inside a lane, and backwards riding reaches about
  15 mph, asked for from a standstill.
- **It beeps from a little under 58 mph, and it means it.** About one beep a
  second when they start, faster as you climb, a stream of them at the top.
  Ignore them all the way to the ceiling, about 62 mph, and the motor lets go
  and you go over the front, exactly as a real one does. Backing off even
  slightly is enough; riders call sitting just underneath that limit *riding
  the beeps*. With the sound off, a warning triangle blinks at the same rate.
- **The wheel tells you when it is running out.** Take the climb back to the
  plaza at speed and the status light and the HUD warn you that you are
  asking for more than it has left; push past that and it tilts the pedals
  back to make you slow down.
- **Watch your pedals in a hard carve.** Lean far enough and a pedal grounds,
  which drags and jolts you and costs you speed.
- **Watch the road itself.** A spill or a shallow pothole sets the wheel
  weaving: slow down and it settles, hold your speed and it puts you down. A
  deep hole at speed is simply a crash, and hopping clears any of them.
  Bushes are foliage rather than walls: the wheel pushes through, loses
  speed, and takes one soft wobble. Clean speed, rough ground, kerbs,
  landings, pedal strikes, and the carve you are enjoying never start the
  weave. (The Drunkard weaves on his own with your hands off the steering,
  and that is the character, not the wheel.)

Crashes are non-graphic but not stiff: the rider tumbles, catches the ground
with their limbs, and settles into a comic rest while the wheel can bounce
and spin away. Any riding input remounts once the wipeout has settled, and
waiting a little longer remounts you anyway, so a crash costs speed rather
than the whole run.

## Modes

The title screen offers these, in this order.

**Start ride** — free ride in the world currently loaded, which is the town
until you choose otherwise. No clock, no objective, nothing to fail, and the
way to practise the Original city, BelVar Circuit or Switchback Park with
nothing running.

**2–4 Players** — see the next section. The button appears only on a window
at least 1000 pixels wide with a mouse, trackpad or gamepad, so a phone never
sees it.

**Time trial** — race from the start line through five more checkpoints. The
HUD points at the next one and shows the distance; each crossing gives you a
split and, once you have a time to beat, the gap. Scoring is pure elapsed
time; top speed and landing quality are shown for interest and count for
nothing. Once you have a best, the next attempt adds a translucent replay rider,
so you can see *where* the time changed. Where a route offers a way round,
both lines cross the same checkpoints. The people and traffic start from the
same places at every start, here and in Trick Run, Track Day and the couch
race, so an attempt never depends on where they had wandered to. Time trial
runs in the town, on every Fresh route and in the Original city; the button
is hidden while one of the two circuits is loaded.

**Track Day** — lap a hand-built course. The button asks which: **BelVar
Circuit** or **Switchback Park**. Pick one and it loads and starts you on an
out lap to find the throttle; the clock starts when you cross the line.

- Crossing the line again closes that lap and starts the next one, so the
  session is a run of laps rather than a single attempt. Two sector lines
  split the lap into three sectors and give you a gap at each one.
- **The record is your best lap**, and the moment you set one it replaces the
  ghost, so from the next lap on you are racing the lap you just rode.
- A lap has to be a lap of the course. Ride out through a barrier gate onto
  the field or the infield at BelVar, or off the trail and across the
  hillside at the park, and that lap will not count; the corner of the screen
  tells you so for the rest of it. Running wide onto the verge is a mistake
  the surface already punishes, not cheating.
- **You end the session yourself**: pause, then **End session**. The card
  reports your best lap and its sectors, how many laps counted, and what your
  three best sectors would add up to on one lap. It also counts clean
  landings, charged hops, 180s landed and one-foot airs: counts only, never a
  score.

**Trick Run** — ninety seconds at Switchback Park, and points for what you
land. The button takes you straight to the park and starts the clock on the
first step; the lap does not matter and nothing ends the run but the clock.
Every flight you land is worth its tricks: a clean landing is 10, a charged
hop 25, a landed 180 is 200 and a one-foot air 100; two different tricks in
one flight add 50; a clean landing multiplies the flight's tricks by 1.25, a
heavy one leaves them alone and a wobbly one halves them; a crash costs you the
flight you were in and nothing you had banked. **Tricks only score on a
flight that left the ground from one of the nine features**; a 180 or a
one-foot air off a flat hop is rideable and worth its landing, and
the pane says *off feature* so you know why. **Each feature pays in full once
a minute**: hit the same one again sooner and the whole flight pays half,
then a quarter, and the game forgets one of those repeats for every minute
you leave it alone. The card at the end shows where every point came from,
and a completed run is compared with your best at the park; **Ride it again**
starts another. Pause offers **Retry run** and **End run**; a run ended early
is shown but never saved.

**Knockabout** — carry a padded paddle round the town or a Fresh route and
knock down the yellow targets on its verges. Time a swing while holding a
line near a target for a clean hit; riding through any visible part of a
stand also works, but the clumsy hit sheds speed and adds a recoverable
wobble. Your score is targets struck out of the route's total, the clock
counts for nothing, and a target you pass stays standing until you come back
for it. The places built by hand have no targets, so choosing Knockabout on
one of them opens the Fresh route screen.

**Police chase** — Officer Dorkins starts right behind you, two more patrol
cops are waiting further round the town, and you survive five minutes to
escape. It runs in the town and on any Fresh route; on a place built by hand
the button opens the Fresh route screen.

- The cops ride the same terrain, grip, hazards, kerbs, crashes and recovery
  you do; they are CPU riders, not obstacles on a rail. They pursue in either
  direction, cut across the field when you leave the road, and ride round
  people rather than through them.
- On a clear straight they ride near the wheel's top speed, so pinning the
  throttle will not lose them. Corners, hazards, rough ground and a cleaner
  line are where the gap comes from.
- A patrol wakes when you ride near it. The cops are trackers, too: stretch a
  gap and a cop turns up on the road behind you again, siren rising, and
  another can be sent ahead to wait on your road. Distance buys breathing
  room, never safety, and a cop who is close rides round a building to reach
  you.
- Only the cops carry paddles, and a landed strike knocks you down, which
  is the bust. So is any crash with a cop close, whatever you crashed into,
  and so is riding into a cop yourself; contact only counts when you are the
  one closing.
- The route is the arena. Going far into the surround puts a warning and a
  countdown on screen and ends the run if you do not come back.

**Fresh route** — generate a new place to ride. **Surprise me** builds one
behind a loading screen; typing a route name rebuilds the same place every
time, which is how you send one to a friend.
The name becomes part of the address, and **Copy link** copies it. A rare
name may not produce a valid route, and the game says so and asks for
another rather than quietly building something else.

That screen is also where the places built by hand are chosen. A **Where to
ride** row offers the **Original city**, **BelVar Circuit** and **Switchback
Park**; pressing one loads it there and then, and **Back** takes you to the
title, where **Start ride** rides it. With Switchback Park loaded the screen
also offers **Trick Run** directly. Those places have addresses of their own:
`?level=switchback` opens Switchback Park and `?level=slice` the Original
city, and `?level=track` BelVar Circuit.

**New route**, on the pause menu and the results card, builds a fresh course
without a visit to that screen. From a Time trial, Knockabout or Police chase
it puts you straight back into the same mode; from Track Day, Trick Run or a
couch race it lands you in free ride on the new course.

Records are kept per course and per mode: time trial, best lap, Knockabout,
Trick Run score and chase survival never overwrite each other, and switching
riders changes nothing about any of them. Each venue is its own course, so a
best lap at BelVar Circuit and a best lap at Switchback Park keep their own
times and their own ghosts.

## 2–4 Players

Up to four riders on one desktop screen. Each player presses a button on
their own controller — a gamepad, or the keyboard — to take a seat, picks
their rider, and the room chooses **Where to ride** and **What to play**;
**Start riding** puts you in the world together, each in your own pane with
your own camera and HUD. Two of you split the screen in halves; three or four
get a two-by-two grid, and with three the spare quadrant becomes the room's
scoreboard. Any player can pause for everybody, and each of you beeps,
crashes and recovers on your own. Riders are solid to each other: ride into a
friend and you both get shoved apart, and an ordinary bump never knocks
anybody down. Nothing a couch session does is saved, except that opening it
with Ultra graphics on switches your saved quality to High. The pause menu
and the results card let you swap between the five activities without going
back to the title, and build a suitable course automatically when the one
you are on will not do:

- **Free ride** — the world, shared. No clock, no objective, no paddles.
- **Race** — three laps of **BelVar Circuit** or **Switchback Park**.
  Everybody sits frozen on the grid through a countdown and launches on GO;
  from there it is Track Day's lap rules for each rider, with one clock for
  the whole room. Your pane shows your position, lap and the gap to the rider
  ahead; a quick reset costs you the lap you are on and nobody else's. When
  the leader takes the flag everybody else finishes the lap they are on, and
  the card lists the room by laps, then by time. Choosing it on a place that
  does not close a lap takes the room to BelVar.
- **Knockabout** — a bout for two, three or four. You each carry a paddle,
  and **the first to five knockdowns takes the match**; a committed swing
  that lands puts the rider you hit on the floor, and a rider who has just
  gone down is briefly untouchable. The route's yellow targets are still
  worth hitting and every pane lists everybody's knockdowns and targets, but
  no number of targets wins a bout, and a match that ends level is drawn.
  Three and four start in a ring on clear ground behind a **3 – 2 – 1**
  count. It needs a course with targets, so the join panel opens the Fresh
  route screen when the room is on a place built by hand.
- **Trick Run** — ninety seconds at Switchback Park for everybody at once,
  one clock and a score per pane; the solo rules, nothing saved, and nobody
  declared the winner.
- **Police chase** — up to three of you on the run from one cop for five
  minutes. **Any one of you can be the cop**: on this ride, and only this
  one, Officer Dorkins joins the rider carousel on the seat cards, and whoever
  picks him is the cop. Nobody on him, and CPU cops fill the room to four:
  two against two of you, one against three. Four humans always include the
  cop; if nobody picks him, the last seat to sit down is dealt him. Everybody
  holds through a **3 – 2 – 1** count. The solo chase's bust rules hold for
  every outlaw; a human cop is the only seat with a paddle, his pane shows
  the clock, his busts and an arrow to the nearest outlaw, and he gets no
  help from the game. An outlaw's quick reset is giving up and counts as a
  bust. A busted outlaw keeps a pane and watches the nearest rider still
  standing, and the card ranks the outlaws by how long they stayed free. It
  runs in the town or on a Fresh route; the join panel opens the Fresh route
  screen when the room is on a place built by hand.

## Riders

There are eleven, the line under the title screen's buttons says who you
are, and that line opens the chooser. Ten of them differ only in **looks and
sound**: each has their own crash sound, none is faster, and the custom
wheels ride identically to the standard one. The Drunkard shares that same
speed, grip and braking but rides his own way on purpose. Officer Dorkins is
not one of the eleven: the only way to ride as him is to be the cop in a couch
**Police chase**.

Eight of the eleven are real people, here with their permission, and each is
credited by the public handle they chose. Apart from Maribel Vargas, who
rides under her own name, no legal or private identity is published anywhere
in this project; their likenesses appear here with permission for this game
only, and their logos and the recordings they contributed are theirs. The
full terms are in [`NOTICE.md`](NOTICE.md).

- **Cool Rider** wears tailored black moto gear with reflective blue panels,
  padded trousers, fingerless gloves and a full-face helmet. He is a
  fictional character whose clothes and riding style are based on what the
  author wears, credited at
  [@edwin_rodmen](https://www.instagram.com/edwin_rodmen/). He does not
  reproduce the author's face, and the name is not the author's.
- **Trollina** began life as a joke drawing somebody sent the author, and
  ended up in the game with wild magenta hair, a
  skater dress over black tights, and her own idea of what falling off
  sounds like. She is fictional.
- **Red Rider** is a real rider who asked to appear, in red-over-black
  armour on a red saddled wheel modelled on his own customized machine.
  Credit
  [@r3d__rider](https://www.instagram.com/r3d__rider/).
- **Adonisb2** contacted the author to have his avatar added, supplied the
  reference of himself and his machine, and chose his in-game name. He rides
  in black kit under big neon-green guards with a mirrored visor, on a blocky
  off-road wheel carrying the green angry-eye plate from his own machine.
  **His crash is real**: a recording of one of his own falls. Credit
  [@adonisjg_v11](https://www.tiktok.com/@adonisjg_v11).
- **Maribel Vargas** is a real competitive rider who asked to be in the game
  and appears under her own name, the name she competes under. She wears black race kit with aqua and coral flashes, her logo
  appears exactly as she supplied it, and her crash is a recording she made
  herself. **BelVar Circuit is named after her** — Mari*bel* and *Var*gas —
  and exists because she suggested it. Credit
  [@baymv_](https://www.instagram.com/baymv_).
- **Wheel in Motion** is a real rider with a YouTube channel of that name,
  who asked in public. He rides in his blue-and-yellow jersey and a blue lid
  with yellow stripes, his channel's mark on his chest, his pack and his
  wheel, which is modelled on his own customized machine. His crash is the
  author's own wipeout with the author's voice removed. Credit
  [Wheel In Motion](https://www.youtube.com/@RealWheelInMotion).
- **The Drunkard** is not a real person, and that is the point of him. People
  kept asking for a rider with a beer; the real riders are not going to be
  drawn drinking, so the joke got a rider of its own: a wholly fictional
  parody in a two-can beer hat with drinking tubes, a hydration pack full of
  the wrong drink, and a beer-themed wheel with no real brand anywhere on
  him. **He rides like he looks.** Take your hands off the steering at speed and
  he weaves a slow, lazy S down the road and stumbles every so often; touch
  the steering and the wheel goes exactly where you point it, because underneath
  the theatre he is the same wheel as everybody else and your best times
  carry across. He is based on nobody, and nothing in this game endorses
  riding under the influence.
- **FloWithZo** is a real racer who asked in public. He rides in a light
  silver race suit, a pewter full-face lid over a big dark visor, and large
  white knee and shin armour, on his own wheel: a dark body between two pale
  side shells with a low orange band on each flank. His crash is the author's
  wipeout with the voice removed. Credit
  [@flowithzo_euc](https://www.instagram.com/flowithzo_euc).
- **Seal on a Wheel** asked for himself on Instagram. He rides in all black
  with a light grey sweatshirt knotted at his waist, a red, white and black
  full-face lid, a day-pack and big hard knee shells, on his own wheel: a
  tall cyan body trimmed in hot pink. His crash is the author's wipeout with
  the voice removed and **a seal barking in place of that voice**, a
  public-domain recording mixed in as the joke his name is. Credit
  [@seal_on_a_wheel](https://www.instagram.com/seal_on_a_wheel).
- **Wyldist** worked it out with the author directly, chose his in-game name,
  and sent the photos and videos he is built from. He rides in his turquoise
  Hawaiian shirt, worn partly open, a red full-face lid with a black **50** in
  a white circle on the back, charcoal cargo trousers and red-and-black
  gloves, on a compact charcoal wheel with angular red side accents, the
  game's own design rather than his machine. One small print on his sleeve is
  somebody else's mark, there because he asked for it; its terms are in
  [`NOTICE.md`](NOTICE.md). **His crash is real**: a clip of his wheel
  getting away from him at a kerb. Credit
  [@wyldist](https://www.instagram.com/wyldist/).
- **Gnarwheel** wears black: a soft hoodie with his white brush logo on the
  chest, back and sleeves, a dark full-face helmet with a chin-mounted action
  camera, black protection and patterned gloves. His cyan-and-black wheel
  with a lime rim is a fictional design. His crash uses the recordings he
  contributed, with a synthesized alarm. Credit
  [@\_gnarwheel\_](https://www.instagram.com/_gnarwheel_/).

## Controls

Three ways to ride, and **all of them are live at once**: a phone with a pad
paired to it, or a laptop with a touchscreen, does not have to choose.

### Keyboard

| Action | Keys |
|---|---|
| Accelerate | `W` or `↑` |
| Brake, and reverse from a standstill | `S` or `↓` |
| Carve left / right | `A` `D` or `←` `→` |
| Hop | `Space` |
| 180° spin | `Space` again on the way up; hold a direction to pick which way |
| One-foot air | Keep `Space` held down as you leave the ground |
| Crouch, and charge a bigger hop | hold `Shift` |
| Swing the paddle — Knockabout, or the cop in a couch chase | `F` |
| Quick reset — back to the start, or restart the run (in a race it costs you the lap; as an outlaw in a couch chase it means giving up) | `R` |
| Mute · camera view · pause | `M` · `C` · `Esc` |

Every action except pause can be given a different key in **Settings →
Controls**: press **Change** on a row, then the key you want, which replaces
that row's keys and is taken away from any other row that had it. `Esc`
always pauses, and `F3`, `F4` and `Tab` cannot be assigned. `F3` and `F4`
open developer overlays; changing a value in the `F4` panel disqualifies the
Trick Run you are in.

### Gamepad

| Action | Control |
|---|---|
| Accelerate | Left stick forward, right trigger, or D-pad up |
| Brake / reverse | Left stick back, left trigger, or D-pad down |
| Carve | Left stick left and right, or D-pad left and right |
| Hop · crouch | A · left bumper |
| 180° spin | A again on the way up |
| One-foot air | Keep A held down as you leave the ground |
| Swing the paddle | Right bumper |
| Quick reset · camera view · pause | X · Y · Start |
| In menus | Stick or D-pad to move, A to confirm, B to go back |

The pad has to report the browser's standard mapping, and the game says so
in Settings when one does not. The stick dead zone is adjustable there and
the pad can be switched off. Face-button names are the Xbox layout; a
PlayStation pad reports the same positions (A is ✕, B is ○, X is □, Y is △).
The keyboard keeps working while a pad is connected.

### Touch — phone and tablet

The controls appear on their own on a touchscreen, in portrait and
landscape, and only while you ride. Rotating mid-ride is fine.

| Action | Control |
|---|---|
| Accelerate | Push the floating stick up |
| Brake, and reverse from a standstill | Pull the floating stick down |
| Carve | Move the stick left or right; diagonal rides and carves together |
| Crouch, and charge a bigger hop | Hold **CHARGE** |
| Hop | Tap **HOP** |
| 180° spin | Tap **HOP** again on the way up |
| One-foot air | Keep **HOP** held down as you leave the ground |
| Swing the paddle | Tap **SWING**, shown whenever you carry a paddle |
| Pause · quick reset · camera view | **II** · **RESET** · **VIEW**, the three small buttons along the bottom |

The stick has no fixed spot: put your thumb down anywhere in its corner of
the screen and ride from there. In **Settings → Touch controls** you can
force the controls on or off, mirror them for a **left-handed layout**, and
set a **size** that scales the controls and both stick throws together, so a
bigger stick is a gentler one. Touch always drives player one.

### The air moves

**The one-foot air is the same gesture everywhere**: keep Hop held as the
wheel leaves the ground, and a moment later the rider takes a foot off the
pedal and has it back down before you land. It is a show move: the wheel
rides identically with the foot out. Ask for it too late on the way down and
nothing happens, and holding through the landing never gives you a second
hop. **The 180** is a second press of Hop while you are in the air, once per
flight; it turns the wheel round so you land riding backwards, and holding a
direction picks which way it spins. Let go, tap for the spin, then hold again
and you can have both out of one hop.

## Settings, saving, and your data

**Display**: Quality (Low, Medium, High, Ultra), a field-of-view trim, speed
units (km/h or mph), and a frame-rate counter that is off unless you turn it
on. **Audio**: Master, Ride and effects, and Warnings on separate faders, so
the wheel can still warn you with everything else turned down, plus Mute
everything. **Controls**: the key remap above, the gamepad on or off, and
its stick dead zone. **Touch controls**: Automatic, Always show or Never
show, the left-handed layout, and the size. **About and licences**: the
version, the links, and the full licence and notices that travel with the
game. **Reset everything to defaults** puts every setting back and touches
no record. A phone or tablet starts on Medium the first time it plays and a
desktop on High; whatever you choose after that is kept.

The ride itself is **identical at every setting**: nothing in Settings
alters how the wheel behaves, so a time set on Low compares with one set on
Ultra, and a time set with thumbs compares with one set on keys.

**Ultra graphics** is an optional fourth quality level for riding alone, on a
desktop or a phone. It is never on unless you turn it on, with the **Ultra
Graphics** button on the title screen beside **Settings** or with **Settings
→ Quality → Ultra**; both are the same saved choice, and switching the title
button off takes you back to the quality you had. Ultra lights the world
from its own sky, gives buildings, trees and riders crisp shadows that carry
into the distance, grounds the riders with soft contact shade, and adds
detail to facades, trees, road edges and the sky. It asks a lot of the
graphics chip: the title button says *Higher GPU demand*, and Settings says
smoothness and battery use vary by device. Switching takes a moment behind a
notice that says **Loading Ultra graphics…** or **Turning Ultra off…**. If
your device cannot start it, the game says so and draws High instead. Ultra
is for riding alone: opening **2–4 Players** with it on switches you to High,
and it stays High afterwards.

Your settings and best times are saved **in your own browser** and go
nowhere else. There is no account, no server and no analytics, and the game
loads nothing but its own files. Clearing your browser's site data for this
page clears your times with it; there is deliberately no in-game button that
can delete them by accident. If many routes eventually fill the browser's
storage, the game recycles the **oldest ghost replay first** and keeps that
route's time and splits. In a private window, or with site data blocked, the
game still runs and still times you; Settings and the results cards say that
nothing will survive the tab closing.

## Put it on your home screen

The game installs as a web app, so it opens from an icon in its own window,
with no address bar in the way. There is nothing to download and no store
involved.

- **iPhone and iPad** — open the game in Safari, tap **Share**, then **Add to
  Home Screen**.
- **Android** — open the game in Chrome and use **⋮ → Add to Home screen**,
  or take the **Install** prompt if the browser offers one.
- **Desktop** — Chrome and Edge can install it from their own menu.

Two honest notes. **It loads over the network each time it opens**: this is
an installed launcher, not an offline copy, so some browsers hold back their
strongest install prompt, which is why the menu route above is the one that
always works. And your saved times live in the browser's storage
for this page, so a game launched from the home screen and the same game
opened in a tab may not always be looking at the same records.

For a copy that works with no network at all, the **Releases page** at
<https://github.com/VibezZzCoder/EUC-thrills/releases> carries the whole game
as one file for computers, with its own README.

## Requirements

A current browser with WebGL2 — Chrome, Edge, Firefox or Safari, on a
desktop, laptop, phone or tablet. Hardware acceleration should be on; if the
browser cannot provide WebGL the loading screen says so rather than sitting
blank. The first load takes a while as the town and its street life are
built; the loading screen counts the steps, and if a download fails it
offers **Retry loading**.

On a phone the game is doing the same work it does on a desktop, so an older
handset runs it slower. **Quality** in Settings is the first thing to turn
down, and it changes nothing about how the wheel rides. **Ultra** wants a
capable graphics chip on any device; if it stutters, High is one press away.

## Deliberately not planned

Hosted multiplayer servers, accounts, cloud saves, a story campaign, an
in-game economy or marketplace, and VR. Multiplayer is one screen on purpose:
the game asking you to sign in to ride is exactly what it is trying not to be.
