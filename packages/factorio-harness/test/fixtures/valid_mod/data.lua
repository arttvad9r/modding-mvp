local furnace = data.raw["furnace"]["steel-furnace"]
assert(furnace, "steel-furnace prototype missing")
furnace.crafting_speed = furnace.crafting_speed * 2
