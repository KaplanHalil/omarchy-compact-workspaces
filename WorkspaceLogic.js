.pragma library

// Pure workspace-compaction planning. Kept free of Quickshell types so the
// rules that decide which workspace ids move can run under Node in tests.
//
// Hyprland hands out numeric workspace ids and never reuses the gap a
// destroyed workspace leaves behind. `hl.dsp.workspace.change_id` can move a
// live workspace, windows included, onto a free id. This module answers the
// only question that matters before doing that: which id moves where.

// Normalise the workspace list the caller got from `hyprctl -j workspaces`.
// Only positive numeric ids can be changed: special workspaces are negative
// and named workspaces have a managed id that `change_id` refuses to touch.
function numericWorkspaces(workspaces) {
  var result = []
  if (!workspaces) return result

  for (var i = 0; i < workspaces.length; i++) {
    var workspace = workspaces[i]
    if (!workspace) continue

    var id = Number(workspace.id)
    if (!isFinite(id) || id <= 0 || Math.floor(id) !== id) continue

    result.push({
      id: id,
      monitor: String(workspace.monitor || "")
    })
  }
  return result
}

// Plans the moves that close every gap inside each monitor's own sequence.
//
// Ids are grouped by monitor so monitor banks such as 1-10 / 11-20 compact
// independently and never slide into each other. A workspace is only moved if
// its target id is free everywhere; when another monitor already owns the
// target, that monitor's plan stops rather than stealing an id. That is what
// keeps interleaved layouts (odds on one monitor, evens on another) stable.
//
// The returned moves are in ascending source order, which is also a safe
// execution order: each target has already been vacated by the move before it.
function planCompaction(workspaces, onlyMonitor) {
  var list = numericWorkspaces(workspaces)
  if (list.length === 0) return []

  var groups = {}
  var order = []
  for (var i = 0; i < list.length; i++) {
    var monitor = list[i].monitor
    if (!groups[monitor]) {
      groups[monitor] = []
      order.push(monitor)
    }
    groups[monitor].push(list[i].id)
  }

  var plans = []
  for (var g = 0; g < order.length; g++) {
    var groupMonitor = order[g]
    if (onlyMonitor && groupMonitor !== onlyMonitor) continue

    var ids = groups[groupMonitor].slice().sort(function(left, right) {
      return left - right
    })

    // Target ids owned by a different monitor are off limits. Within this
    // monitor every id below `nextFree` has either stayed put or already been
    // planned into it, so only the other monitors can block a target.
    var external = {}
    for (var m = 0; m < order.length; m++) {
      if (order[m] === groupMonitor) continue
      for (var k = 0; k < groups[order[m]].length; k++) {
        external[groups[order[m]][k]] = true
      }
    }

    var nextFree = ids[0]
    for (var j = 0; j < ids.length; j++) {
      var id = ids[j]
      if (id > nextFree) {
        if (external[nextFree]) break
        plans.push({ from: id, to: nextFree, monitor: groupMonitor })
      }
      nextFree++
    }
  }

  return plans
}
