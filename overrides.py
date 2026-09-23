"""
overrides.py - manual corrections layered on top of what the API returns, for the
handful of small/obscure clubs API-Football gets wrong or leaves blank. All three
dicts are keyed by the exact team name as it appears in fixtures.js (the API's
"home"/"away" string).

TEAM_CITY_OVERRIDE: (city, country-code-for-geocoding) to use when the API gives no
    city at all for a team's home matches.
VENUE_OVERRIDE: stadium name to use instead of (or in place of) whatever the API says
    for that team's home matches - takes priority over the API value.
LOGO_OVERRIDE: local path (under logos/) to use instead of the API's crest - for teams
    where API-Football only has its "OFFICIAL LOGO SOON" / "image not available"
    placeholder, or where a better crest was sourced by hand.

Re-run backfill_hebrew.py after editing this file to apply changes to fixtures.js
without hitting the API again (new cities get geocoded through Nominatim, same as a
normal build_fixtures.py run).
"""

TEAM_CITY_OVERRIDE = {
    "Groesbeek": ("Groesbeek", "nl"),
    "Ceuta 6 de Junio": ("Ceuta", "es"),
    "Ribadesella CF": ("Ribadesella", "es"),
    "Pinatar": ("San Pedro del Pinatar", "es"),
    "Talayuela": ("Talayuela", "es"),
    "Alcazar": ("Alcázar de San Juan", "es"),
    "Auriense": ("Ourense", "es"),
    "CD San Jose": ("Soria", "es"),
    "Tavernes": ("Tavernes de la Valldigna", "es"),
    # API-Football gives this fixture's venue.city as "Isilemulino", which isn't a real
    # place - the venue itself (Stade Jean Bouin) is in Paris, so use that directly.
    "Paris FC": ("Paris", "fr"),
    "Hortaleza": ("Madrid", "es"),
}

VENUE_OVERRIDE = {
    "Groesbeek": "Sportpark Noord",
    "Exmouth": "Southern Road",
    "Thame United": "Meadow View Park",
    "Sparta Nijkerk": "De Ebbenhorst",
    "Zwaluwen": "Zwaluwenlaan Sports Park",
    "JOS Watergraafsmeer": "Sportpark Drieburg",
    "TOGB": "Sportpark Het Hoge Land",
    "Granada CF": "Estadio Nuevo Los Cármenes",
    "Lebrijana": "Municipal de Lebrija",
    "Ceuta 6 de Junio": "Campo Municipal de Fútbol José Martínez Pirri",
    "Anaitasuna": "Txerloia Futbol Zelaia",
    "Tedeón": "Estadio San Miguel",
    "Atletico Calatayud": "San Íñigo",
    "Baztán": "Giltxaurdi",
    "Tenerife": "Heliodoro Rodríguez López",
    "Celta Vigo": "Estadio de Balaídos",
    "Celta de Vigo II": "Estadio de Balaídos",
    "Ribadesella CF": "Campo de Oreyana",
    "Noja": "La Caseta",
    "Pinatar": "José Antonio Pérez",
    "Atlético Melilla": "La Espiguera",
    "Güímar": "Tasagaya",
    "Valladolid": "José Zorrilla",
    "San Rafael": "Municipal",
    "Prat": "Sagnier",
    "Talayuela": "Ciudad Deportiva",
    "Alcazar": "Estadio Municipal",
    "Maracena": "Ciudad Deportiva de Maracena",
    "Tavernes": "Municipal",
    "Burgos": "Estadio Municipal El Plantío",
    "Colchester": "Colchester Community Stadium",
    "Auriense": "Campo Municipal de Oira",
    "CD San Jose": "San Juan",
    "Hortaleza": "Municipal Sporting Hortaleza",
}

LOGO_OVERRIDE = {
    "Ceuta 6 de Junio": "logos/28424.png",
    "Anaitasuna": "logos/28425.png",
    "Tedeón": "logos/28426.png",
    "Baztán": "logos/28427.png",
    "Ribadesella CF": "logos/28428.png",
    "Atlético Melilla": "logos/28429.png",
    "Güímar": "logos/28430.png",
    "Maracena": "logos/28431.png",
}
