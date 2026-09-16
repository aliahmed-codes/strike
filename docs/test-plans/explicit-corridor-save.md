# Test plan: explicit "Save Edited Corridors" (Phase A)

Prerequisites: log in, open a quote with at least one previously-saved corridor and at least one filter-matched preview (not-yet-saved) corridor on the Pricing tab.

## A. Editing an existing saved row no longer autosaves
1. Change a field (e.g. Fixed Fee) on an already-saved corridor row.
2. The row's Revenue/Margin/etc. columns should update immediately (live preview), same as before.
3. Click away from the field (blur). **Expected:** nothing is sent to the server — the row does not refresh/flicker, and the row now shows a blue tint + an "Unsaved changes" badge next to its name.
4. The "Save Edited Corridors" button in the section header should now read "Save Edited Corridors (1)" and be enabled.

## B. Editing a preview (not-yet-saved) row also stages, doesn't promote immediately
1. Change a field on an amber "Not saved" preview row.
2. Blur the field. **Expected:** the row stays a preview row (still amber, still "Not saved") — it is *not* created on the server yet, and the "Save Edited Corridors" count increments.

## C. Save Edited Corridors persists everything staged
1. With 1+ dirty saved rows and 1+ dirty preview rows, click "Save Edited Corridors (N)".
2. **Expected:** button shows "Saving…", then on completion: dirty saved rows lose the blue tint/badge and their values match what was saved; dirty preview rows become real saved rows (no longer amber, no "Not saved" badge, now show a Remove button instead of Dismiss).
3. The button reverts to "Save Edited Corridors" (disabled, no count) once everything is saved.

## D. Pending edits survive a Summary ↔ Pricing tab switch
1. Edit a field on a saved row (don't click Save).
2. Switch to the Summary tab, then back to Pricing.
3. **Expected:** the edit is still there — the field still shows your typed value, the row is still blue/"Unsaved changes", and the Save button still shows the same count. (Confirms the edit survived the tab unmount, since it now lives in a persisted store instead of component state.)

## E. A failed save keeps the edit, doesn't lose it
1. Edit a field on a saved row.
2. Stop the backend dev server (or otherwise force the PATCH to fail), then click "Save Edited Corridors".
3. **Expected:** an inline red error banner appears above the table naming the failed corridor(s) ("Couldn't save 1 corridor: …"); the row *stays* blue/"Unsaved changes" — it is not marked as saved, and your typed value is unaffected.
4. Restart the backend, click "Save Edited Corridors" again. **Expected:** it saves successfully this time and the error banner clears.

## F. Multiple edited rows, one fails
1. Edit two different saved rows.
2. Arrange for exactly one to fail server-side (e.g. an invalid value on one row that the backend validator rejects) and click Save.
3. **Expected:** the row that succeeded loses its "Unsaved changes" badge; the row that failed keeps it, and the error banner names only the failed corridor. The Save button's count drops to 1.
