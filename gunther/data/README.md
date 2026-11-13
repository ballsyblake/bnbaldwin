# Gunther game data and mods

Everything the game knows about Aldmoor lives in the JSON files in this folder. Change a number here and reload the page: no code changes needed. Mods use the same format to change the game without editing these files.

## The files

| File | What it holds |
|---|---|
| `rules.json` | `daySeconds`: seconds of travel per in-game day. `yearDays`: days per year (everyone ages one year per year; a season is a quarter of it). Pacing: `lootPerPower` (low and high gold per point of beaten enemy strength), `siteLootPerPower`, `renownPerPower` (renown per point of enemy strength, less for weak enemies), `wageScale` (multiplies every troop's weekly wage), `ransomPerPower`, `smithBase` (price of an upgrade is base x level x (level + 1)), `smithLocalMax` (the best level an ordinary town smith can make; above it bows come from elf towns for timber, armour from dwarf towns for iron, and swords from beaten lords) and `craftRelationPerLevel` (standing the elves or dwarves ask for, per level above that). |
| `factions.json` | Realms by id. `name`, `short` (used in sentences), `colour`, `ruler` (filled in from the lords), `race`, and `kingdom: true` for realms that have lords, halls and wars. `player`, `free` and `horde` must stay. |
| `races.json` | Peoples by id. `recruit`: troop volunteers join as. `army`: what their lords field, weakest to best, as `[melee, ranged]` pairs. `adult`: age a child comes of age. `old`: age after which death by old age gets likely. `titles`: `[man, woman]` titles for a `ruler` and a `lord`. `names`: first names `m` and `f` for heirs and spouses. |
| `troops.json` | Troop types by id. `hp`, `dmg` (per hit), `cd` (seconds between attacks), `range` (pixels), `speed`, `power` (rough worth, used by auto-resolve and AI), `wage` (gold a week), `guard` (0 to 1, how well it reads Gunther's sword), `block` (0 to 1, melee damage soaked), `armour` (0 to 1, share of arrow damage stopped; bolts and javelins pierce some), `shield` (0 to 1, chance to stop an arrow coming from the front), `ranged`, `bolt` or `javelin` for missile type, `race`, `orc`, `upgrades` (`to`, `xp`, `cost`). `sprite` and `kind` pick the look: see below. |
| `goods.json` | Trade goods by id. `base` price and `food: true` for things the party can eat. `grain` and `fish` must stay. |
| `places.json` | `settlements`: each has `id`, `name`, `kind` (`town`, `village`, `camp`, `stronghold`), `faction` (who holds it at the start), `x`, `y` (the island is 3600 by 2400), `makes` and `wants` (goods), `race` (if its people differ from its ruler's), `bound` (for a village, the town it belongs to), `art` (town picture 0 to 2). `roads`: pairs of place ids. |
| `lords.json` | Each lord: `id`, `name`, `faction`, `ruler`, `traits` (`bold`, `cautious`, `honourable`, `cruel`, `greedy`), `sex` (`m`/`f`), `age`, `house` (family name heirs inherit), `home` (a place id). |
| `skills.json` | Gunther's skills: `name`, `how` (what trains it), `effect`. The effects themselves are in code, so only the wording can change here. |
| `names.json` | `orcChiefs`: names for orc warband leaders. |

### Looks

A troop's `sprite` is `soldier` for humans, elves and dwarves (orcs use `grunt`, `brute`, `shaman`, `warlord`). For soldiers, `kind` picks the painted look: `recruit`, `spear`, `sword`, `archer`, `elfscout`, `elfarcher`, `sentinel`, `elfblade`, `dwarfminer`, `dwarfaxe`, `ironguard`, `dwarfxbow`. An unknown kind is drawn as a recruit.

## Making a mod

A mod is one JSON file. It can have a `name` and `description`, and any of these keys: `rules`, `factions`, `races`, `troops`, `goods`, `skills`, `settlements`, `lords`, `roads`, `orcChiefs`.

- `rules`, `factions`, `races`, `troops`, `goods`, `skills`: merged by id, field by field. `{"troops": {"spearman": {"hp": 40}}}` changes one number and keeps the rest. A new id adds a new entry. `null` removes a field or an entry. Lists inside an entry (like `upgrades` or `traits`) are replaced whole.
- `settlements` and `lords`: lists of entries matched by `id`. A known id is changed field by field, a new id is added, and `"remove": true` deletes one.
- `roads` and `orcChiefs`: a list replaces the whole thing; `{"add": [...]}` appends.

The game checks a mod before using it: every troop, race, faction, place and road must point at something that exists, and the orc troops (`grunt`, `brute`, `shaman`, `warlord`), `recruit`, `bowman`, `grain` and `fish` cannot be removed. A mod that fails is skipped, and the Mods screen says why.

See `../mods/example-highlands.json` for a small example.

## Using a mod

- **As a player:** title screen, Mods, "Load a mod from your device". It is kept in your browser; turn it off or remove it there. Reload to apply.
- **For everyone playing this copy of the game:** put the file in `gunther/mods/` and add its file name to the `mods` list in `gunther/mods/mods.json`.

Start a new campaign after changing mods: an old save may refer to things a mod removed.

## story.json

Gunther's storyline, The Wall Tithe. `prologue` is shown on `startDay`; the player can accept or put it off.
Each entry in `chapters` has:

- `id`, `title`, `goal` (shown in the journal).
- `step`: what finishes the chapter. One of:
  - `{"type": "visit", "place": "<settlement id>", "button": "...", "needs": {"renown": 30, "gold": 250}}`: a story button in that place. `needs` is optional.
  - `{"type": "visits", "places": [...], "count": 3, "button": "...", "each": "text", "eachReward": {...}}`: the button in `count` of those places.
  - `{"type": "defeat", "near": "<settlement id>" or "at": "player", "dx", "dy", "spread", "party": {"name", "faction", "troops", "desc"}}`: an enemy the story puts on the map, marked with !. `"at": "player"` is an ambush that hunts Gunther down.
  - A list of steps, each with `if` or `unless`: the first that fits is used.
- `scene`: paragraphs shown when the step is done. A paragraph can be `{"if": "flag", "text": "..."}` or use `unless`.
- `choices` (optional): `{"label", "flag", "text", "reward"}`. Picking one sets its flag for later `if`/`unless`.
- `reward` (optional): any of `gold`, `spend` (gold paid), `renown`, `troops` ({type: n}), `recruits` (local recruits, `visits` only), `relations` ({faction: n}), `say`, `chronicle`.

A mod changes the story with `"story": {"chapters": [...]}`; chapters merge by `id` like lords and places, and `"remove": true` drops one.

## Realms and diplomacy

Any faction with `"kingdom": true` is a realm: it has lords, holds towns, and makes war, peace and alliances with every other realm (js/diplomacy.js). The orc clans (`horde`) are a realm like the others, with race `orc`. A ruler's traits decide how warlike (bold, cruel; cautious holds back) and how faithless (cruel, greedy; honourable holds back) the realm is. `outlaws` fight everyone; `compact` fights only Gunther and is used by the story.
