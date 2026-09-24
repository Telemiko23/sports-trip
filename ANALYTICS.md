# Analytics - Google Analytics 4

Measurement ID: `G-BKHDQGMC8T`. Wired into `index.html` (gtag.js snippet in `<head>`).
Every custom event also runs through `track()`, which logs it to the browser console as
`[analytics] <name> {...params}` - open DevTools → Console (filter: `analytics`) to see
events fire live while using the site, without needing the GA dashboard. To confirm an
event actually reached Google (not just that our code called `gtag`): DevTools → Network
tab → filter `collect` - each request there is one delivered event.

Besides everything below, GA4 also collects its own automatic events (`page_view`,
`session_start`, `first_visit`, scroll, outbound click via Enhanced Measurement, etc.) -
those aren't listed here since we didn't add them and don't control their params.

## Trip building

### `add_to_trip` / `remove_from_trip`
- **Params**: `sport` (`"football"` | `"f1"` | `"tennis"` - added in v1.2.0; older events lack
  it), `comp` (competition label, English), `country`, `city`, `days_until_match`
  (integer, can be negative if oddly in the past), `source` (`"list"` | `"map"` |
  `"trip_panel"`).
- **Trigger**: clicking "הוסף לטיול" on a match card in the results list, in a map
  popup, or clicking the ✕ remove button on a stub in "הטיול שלי". Fires once per click,
  named by whether the match was just added or just removed.
- **Use**: which competitions/countries/cities/lead-times actually turn into planned
  trips (not just views) - the strongest "real interest" signal on the site. `source`
  shows whether people build trips from the list or the map.

## View & map

### `view_toggle`
- **Params**: `view` (`"list"` | `"map"`).
- **Trigger**: clicking the רשימה/מפה toggle above the results.
- **Use**: adoption of the map view vs the original list.

### `map_marker_click`
- **Params**: `city`, `venue` (empty string if the pin is a city-level fallback, not a
  precise stadium), `match_count` (how many fixtures are behind that pin).
- **Trigger**: clicking a pin on the map (opens its popup).
- **Use**: which stadiums/cities draw exploration interest on the map.

### `venue_maps_click`
- **Params**: `venue` (the displayed stadium name).
- **Trigger**: clicking a stadium name (the dashed-underline link) anywhere it appears -
  opens Google Maps pinned at that stadium.
- **Use**: whether the stadium-precise-location feature is actually used.

## Outbound links (trip tools)

### `flight_link_click`
- **Params**: none.
- **Trigger**: clicking a "טיסת הלוך/חזור" / "חיפוש טיסות" button in "הטיול שלי".
- **Use**: outbound engagement with flight search, per trip.

### `hotel_link_click`
- **Params**: `city`.
- **Trigger**: clicking a "חיפוש לינה: <עיר>" button in "הטיול שלי".
- **Use**: outbound engagement with lodging search, per city - the number to watch once
  the Booking.com affiliate link is live, to gauge real revenue potential.

## Filters

### `base_city_set`
- **Params**: `city`.
- **Trigger**: selecting a base city from the autocomplete (only on an actual selection,
  not while typing).
- **Use**: which cities people plan trips around most.

### `radius_change`
- **Params**: `radius_km`.
- **Trigger**: releasing the radius slider (fires on `change`, once per drag - not once
  per pixel moved while dragging).
- **Use**: typical radius preference.

### `date_range_change`
- **Params**: `field` (`"from"` | `"to"`), `value` (the new date).
- **Trigger**: changing either date picker.
- **Use**: how far ahead people plan and typical trip-window length.

### `competition_toggle`
- **Params**: `comp` (competition label), `checked` (boolean).
- **Trigger**: checking/unchecking one competition's own checkbox.
- **Use**: which specific competitions people actually care about or exclude - a direct
  signal for which leagues/cups are worth expanding vs dropping.

### `competition_country_toggle`
- **Params**: `country`, `checked`.
- **Trigger**: clicking a country's own "הכל / כלום" link in the filter sidebar.
- **Use**: bulk country-level interest (e.g. "turn off everything English").

### `competition_all_toggle`
- **Params**: `checked`.
- **Trigger**: clicking the global "הכל / כלום (כל התחרויות)" button.
- **Use**: how often people use the global shortcut vs picking manually.

## Other

### `origin_airport_selected`
- **Params**: `airport` (full label as shown in the combobox).
- **Trigger**: selecting an airport from the "טיסה מ-" autocomplete.
- **Use**: mostly a sanity check on the assumed audience (Israel-based) - a surprising
  spread of origins would be worth knowing.

### `copy_trip`
- **Params**: `trip_size` (number of matches in the trip at that moment).
- **Trigger**: clicking "העתק את הטיול כטקסט".
- **Use**: how many people export their trip as text instead of only using the booking
  links directly.

### `clear_trip`
- **Params**: `trip_size` (size right before clearing).
- **Trigger**: clicking "נקה את הטיול".
- **Use**: trip abandonment, and how large a trip typically gets before being cleared.

### `legal_dialog_open`
- **Params**: none.
- **Trigger**: clicking "מידע משפטי ופרטיות" in the footer.
- **Use**: mostly a curiosity/compliance signal - whether anyone actually reads it.
