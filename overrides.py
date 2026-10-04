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
    "Mallorca": ("Palma", "es"),  # API says "Parma" (geocoded near Seville) - Son Moix is in Palma
    "Wieczysta Kraków": ("Kraków", "pl"),  # API says Sosnowiec; the stadium the API itself lists is in Kraków
    "Groesbeek": ("Groesbeek", "nl"),
    "Ceuta 6 de Junio": ("Ceuta", "es"),
    "Ribadesella CF": ("Ribadesella", "es"),
    "Pinatar": ("San Pedro del Pinatar", "es"),
    "Talayuela": ("Talayuela", "es"),
    "Alcazar": ("Alcázar de San Juan", "es"),
    "Auriense": ("Ourense", "es"),
    "CD San Jose": ("Soria", "es"),
    "Tavernes": ("Tavernes de la Valldigna", "es"),
    "Paris FC": ("Paris", "fr"),
    "Hortaleza": ("Madrid", "es"),
    "Viking": ("Stavanger", "no"),
    "Bodo/Glimt": ("Bodø", "no"),
    "Torreense": ("Torres Vedras", "pt"),
    "Hapoel Beer Sheva": ("Beer Sheva", "il"),
    "Union St. Gilloise": ("Brussels", "be"),
    "Sabah FA": ("Masazir", "az"),
    "Lille": ("Villeneuve-d'Ascq", "fr"),
    "Como": ("Como", "it"),
    "Getafe": ("Madrid", "es"),
    "Lillestrom": ("Lillestrøm", "no"),
    "Lincoln Red Imps FC": ("Gibraltar", "gi"),
    "Lech Poznan": ("Poznań", "pl"),
    # -- from missing_info.csv follow-up, researched by Claude (2026-09-29): API gives no city at all for this obscure club
    "Fazendense": ["Fazendas de Almeirim", "pt"],
}

VENUE_OVERRIDE = {
    "Groesbeek": "Sportpark Noord",
    "Exmouth": "Southern Road",
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
    "CD San Jose": "Campo de Fútbol Municipal San Juan",
    "Hortaleza": "Municipal Sporting Hortaleza",
    "Inter": "San Siro",
    "Viking": "Viking Stadion",
    "FC Porto": "Estádio do Dragão",
    "Slovan Bratislava": "Tehelné pole",
    "Torreense": "Estádio Manuel Marques",
    "Union St. Gilloise": "Joseph Marien Stadium",
    "Marseille": "Stade Vélodrome",
    "Como": "Stadio Giuseppe Sinigaglia",
    "Real Madrid": "Bernabéu",
    "Lillestrom": "Åråsen Stadion",
    "Lincoln Red Imps FC": "Victoria Stadium",
    "AC Milan": "San Siro",
    "Ferencvarosi TC": "Ferencváros Stadion",
    "Benfica": "Estádio da Luz",
    "Hapoel Beer Sheva": "Turner Stadium",
    # API returns two different names for the same physical stadium across fixtures - a
    # leftover sponsor name ("zondacrypto Arena") the city itself dropped in April 2026,
    # reverting to the official one
    "Raków Częstochowa": "Miejski Stadion Pilkarski Rakow",
    # -- from missing_info.csv, filled in by the user (2026-09-29): missing stadiums
    "AFC Rushden & Diamonds": "Hayden Road",
    "Academico Viseu": "Estádio Municipal do Fontelo",
    "Almeria": "UD Almería Stadium",
    "Alverca": "Complexo Desportivo FC Alverca",
    "Arminia Bielefeld": "Schüco Arena",
    "Arouca": "Estádio Municipal Arouca",
    "Athletic Club": "San Mamés Stadium",
    "Avia Świdnik": "Czesław Krygier Municipal Stadium",
    "Barton Town Old Boys": "Marsh Lane",
    "Bedford Town": "The New Eyrie",
    "Birmingham": "St. Andrew's @ Knighthead Park",
    "Bologna": "Stadio Renato Dall'Ara",
    "Boulogne": "Stade de la Libération",
    "Brackley Town": "St James Park",
    "Brentwood Town": "Brentwood Centre Arena",
    "Bury": "Gigg Lane",
    "Bury Town": "Ram Meadow",
    "Buxton": "Tarmac Silverlands Stadium",
    "Cambridge City": "Sawston Community Stadium",
    "Casa Pia": "Estádio Municipal de Rio Maior",
    "Chesham United": "The Meadow",
    "Cordoba": "Estadio Nuevo Arcángel",
    "Cray Wanderers": "Flamingo Park",
    "Crowborough Athletic": "Crowborough Community Stadium",
    "Dijon": "Stade Gaston Gérard",
    "Dorking Wanderers": "Meadowbank",
    "Ebbsfleet United": "Stonebridge Road",
    "Elche": "Estadio Manuel Martínez Valero",
    "Estrela": "Estádio José Gomes",
    "GIL Vicente": "Estádio Cidade de Barcelos",
    "Gainsborough Trinity": "The Northolme",
    "Guiseley AFC": "Nethermoor Park",
    "Górnik Łęczna": "Łęczna Stadium",
    "Hanwell Town": "Reynolds Field",
    "Harborough Town": "Bowden Park",
    "Hellas Verona": "Stadio Marcantonio Bentegodi",
    "Kauno Žalgiris": "Darius and Girėnas Stadium",
    "Kettering Town": "Latimer Park",
    "Leatherhead": "Fetcham Grove",
    "Leiston": "Victory Road",
    "Levante": "Estadio Ciudad de Valencia",
    "Macclesfield": "Moss Rose",
    "Marine": "Rossett Park",
    "Maritimo": "Estádio do Marítimo",
    "Monza": "Stadio Brianteo",
    "Morecambe": "The Halo Aerospace Stadium",
    "Moreirense": "Estádio Comendador Joaquim de Almeida Freitas",
    "Mulbarton Wanderers": "Mulberry Park",
    "Nacional": "Estádio da Madeira",
    "Olimpia Grudziądz": "Bronisław Malinowski Central Stadium",
    "Oxford City": "The MGroup Stadium",
    "PEC Zwolle": "MAC³PARK stadium",
    "Plymouth Parkway": "Bolitho Park",
    "Polonia Środa": "Stadion Średzki",
    "Puszcza Niepołomice": "Niepołomice Stadium",
    "Radomiak Radom": "Stadion RKS Radomiak",
    "Real Sociedad II": "Estadio Zubieta",
    "Redditch United": "Valley Stadium",
    "Rio Ave": "Estádio do Rio Ave FC",
    "SC Braga": "Estádio Municipal de Braga",
    "SSV Jeddeloh": "HASKAMP-Arena",
    "Salisbury": "Raymond McEnhill Stadium",
    "Santa Clara": "Estádio de São Miguel",
    "Sassuolo": "Mapei Stadium",
    "Sevilla": "Ramón Sánchez-Pizjuán Stadium",
    "Sheppey United": "Holm Park",
    "Siarka Tarnobrzeg": "Tarnobrzeg Municipal Stadium",
    "Sokół Kleczew": "Kleczew Municipal Stadium",
    "Southampton": "St Mary's Stadium",
    "Spennymoor Town": "The Brewery Field",
    "Sporting CP": "Estádio José Alvalade",
    "Sporting Gijon": "Estadio Municipal El Molinón-Enrique Castro \"Quini\"",
    "Stafford Rangers": "Marston Road",
    "Tadley Calleva": "Barlows Park",
    "Thame United": "The ASM Stadium",  # fixed a typo in the user's correction ("Stadiium")
    "Tonbridge Angels": "Longmead Stadium",
    "Trafford": "Shawe View",
    "Truro City": "Truro City Stadium",
    "Union Berlin": "Stadion An der Alten Försterei",
    "Uxbridge": "Honeycroft",
    "VfL Osnabrück": "Bremer Bruecke Stadium",
    "Vitória SC": "Estádio D. Afonso Henriques",
    "Weymouth": "Bob Lucas Stadium",
    "Widzew Łódź": "Stadion Widzewa Łódź",
    "Worksop Town": "The KC Sofas Stadium",
    "York": "LNER Community Stadium",
    # -- from missing_info.csv, filled in by the user (2026-09-29): missing stadiums (fixture currently out of the rolling window)
    "Camacha": "Complexo Desportivo da Camacha",
    # -- from missing_info.csv follow-up, researched by Claude (2026-09-29): API gives no city at all for this obscure club
    "Fazendense": "Complexo Desportivo Prof. José Sousa Gomes",
    # from the user's filled-in missing_info.csv (2026-10-02)
    "ACV": "Univé Sportpark",
    "RKAV Volendam": "RKAV Volendam complex",
    "VVV Venlo": "Seacon Stadion - De Koel",
    "Hoek": "Sportpark Denoek",
    "Quick Boys": "Sportpark Nieuw Zuid",
    "Koninklijke HFC": "Sportpark Koninklijke HFC Novi8 water",
    "Rijnsburgse Boys": "Middelmors",
    "Alpendorada": "Estádio Municipal de Alpendorada",
    "Academica": "Estádio Municipal Cidade de Coimbra",
    "Paredes": "Estádio Municipal das Laranjeiras",
    "Felgueiras 1932": "Estádio Dr. Machado de Matos",
    "Arezzo": "Stadio Città di Arezzo",
    "SC Genemuiden": "De Wetering",
    "Vvsb": "De Boekhorst",
    "Excelsior '31": "De Koerbelt",
    "Purmersteijn": "Purmersteijn Sports Park",
    "Kloetinge": "Wesselopark",
    "AVS": "Estádio do CD Aves",
    "CF Os Belenenses": "Estádio do Restelo",
    "Atlético CP": "Estádio da Tapadinha",
    "Alcochetense": "Estádio António Almeida Correia",
    "Vianense": "Estádio Dr. José de Matos",
    "Vitoria Setubal": "Estádio do Bonfim",
    "Olhanense": "Estádio José Arcanjo",
    "Tondela": "Estádio João Cardoso",
    "União de Leiria": "Estádio Dr. Magalhães Pessoa",
    "Louletano": "Estádio Algarve",
    "Lusitânia Lourosa": "Estádio do Lusitânia de Lourosa FC",
    "Salgueiros": "Complexo Desportivo de Campanhã",
    "Sanjoanense": "Estádio Conde Dias Garcia",
    "Fátima": "Estádio Papa Francisco",
    "Farense": "Estádio de São Luís",
    "Florgrade": "Parque Desportivo do Buçaquinho",
    "Recreativa de Lamelas": "Campo Padre José Tavares",
    "Atherton Collieries": "Dreams2Reality Stadium",
    "Halesowen Town": "Grove Recreation Ground",
    "Wingate & Finchley": "The Maurice Rebak Stadium",
    "Spalding United": "Sir Halley Stewart Field",
    "Scarborough Athletic": "Scarborough Sports Village",
    "Celje": "Stadion Z'dežele",
}

# non-football events from AllSportDB (build_events.py): the API has no venue field on the free
# plan, so the circuit/stadium is filled in here, keyed by the cleaned event title. Only entries
# I'm certain of live here; suggestions still needing a human check go through the missing-info CSV.
EVENT_VENUE_OVERRIDE = {
    "Azerbaijan Grand Prix": "Baku City Circuit",
    "Bahrain Grand Prix": "Sepang International Circuit",  # the Bahrain GP was moved to Malaysia in 2026
    "Singapore Grand Prix": "Marina Bay Street Circuit",
    "United States Grand Prix": "Circuit of the Americas",
    "Mexico City Grand Prix": "Autódromo Hermanos Rodríguez",
    "São Paulo Grand Prix": "Autódromo José Carlos Pace",
    "Las Vegas Grand Prix": "Las Vegas Strip Circuit",
    "Qatar Grand Prix": "Lusail International Circuit",
    "Abu Dhabi Grand Prix": "Yas Marina Circuit",
    # -- from missing_info.csv, filled in by the user (2026-09-29): missing tennis venues
    "ATP Finals": "Inalpi Arena",
    "China Open": "National Tennis Center",
    "Davis Cup Finals": "BolognaFiere Arena",
    "Erste Bank Open": "Wiener Stadthalle",
    "Japan Open": "Ariake Coliseum",
    "Next Gen ATP Finals": "PalaCalafiore Stadium",
    "Ningbo Open": "Yinzhou Tennis Center",
    "Rolex Paris Masters": "Plenitude Arena",
    "Rolex Shanghai Masters": "Qi Zhong Tennis Center",
    "Swiss Indoors": "St. Jakobshalle",
    "Toray Pan Pacific Open Tennis": "Ariake Coliseum",
    "WTA Finals": "Indian Wells Tennis Garden",
    "Wuhan Open": "Optics Valley International Tennis Center",
    # -- from missing_info.csv, filled in by the user (2026-09-29): annual events, pre-filled for next year (this year already passed and is out of the rolling window)
    "Billie Jean King Cup - Finals": "Shenzhen Bay Sports Center Stadium",
    "Laver Cup": "The O2 Arena",
    "Singapore Tennis Open": "OCBC Arena",
}

LOGO_OVERRIDE = {
    # -- 8 entries removed here 2026-09-30 (Ceuta 6 de Junio, Anaitasuna, Tedeón, Baztán,
    # Ribadesella CF, Atlético Melilla, Güímar, Maracena): each pointed at a "logos/<numeric-id>.png"
    # file that was never actually placed in logos/, so the crest 404'd on the live site since
    # whenever these were added. download_logos.py now warns instead of silently no-op'ing when
    # this happens again. All 8 are early-round Copa del Rey amateur clubs; not worth sourcing a
    # crest for a team that drops out of the rolling window within days - if one comes back and
    # still has no crest, add a real local file + an entry here.
}


# ---- non-football events (build_events.merge_events applies these) ----
# competition label (as AllSportDB / events_manual.json name it) -> local crest in comp_logos/
EVENT_COMP_LOGO = {
    "Formula 1": "comp_logos/formula-one.webp",
    "ATP Tour": "comp_logos/ATP.webp",
    "ATP Finals": "comp_logos/ATP.webp",
    "Next Gen ATP Finals": "comp_logos/ATP.webp",
    "WTA Tour": "comp_logos/WTA.webp",
    "WTA Finals": "comp_logos/WTA.webp",
    "Billie Jean King Cup": "comp_logos/Billie_Jean_King_Cup.webp",
    "Davis Cup Finals": "comp_logos/Davis_Cup.webp",
    "Laver Cup": "comp_logos/Laver_Cup.png",
    "Tennis United Cup": "comp_logos/united-cup.png",
    "PDC Majors": "comp_logos/Professional_Darts_Corporation.webp",
    "PDC European Tour": "comp_logos/Professional_Darts_Corporation.webp",
    "PDC Europe Galas": "comp_logos/Professional_Darts_Corporation.webp",
}

# host country (English, as it appears in event rows) -> flag file code in flags/ (ISO 3166-1
# alpha-2, or a subdivision like gb-eng). An event whose country is missing here just shows no flag.
COUNTRY_FLAG = {
    "Australia": "au", "Austria": "at", "Azerbaijan": "az", "Bahrain": "bh", "Belgium": "be", "Brazil": "br",
    "Canada": "ca", "China": "cn", "Croatia": "hr", "Czech Republic": "cz", "Denmark": "dk", "England": "gb-eng",
    "Finland": "fi", "France": "fr", "Germany": "de", "Hungary": "hu", "India": "in", "Ireland": "ie",
    "Italy": "it", "Japan": "jp", "Kazakhstan": "kz", "Malaysia": "my", "Mexico": "mx", "Monaco": "mc",
    "Morocco": "ma", "Netherlands": "nl", "Poland": "pl", "Portugal": "pt", "Qatar": "qa", "Saudi Arabia": "sa",
    "Scotland": "gb-sct", "Singapore": "sg", "South Africa": "za", "South Korea": "kr", "Spain": "es",
    "Sweden": "se", "Switzerland": "ch", "Thailand": "th", "Turkey": "tr", "Türkiye": "tr", "United Arab Emirates": "ae",
    "United Kingdom": "gb", "United States": "us", "Wales": "gb-wls",
}


# ---- UEFA Nations League: one venue per (home team, match date) ----
# A national team plays home games at several stadiums across a season (unlike a club), so this
# can't be a simple TEAM_CITY_OVERRIDE/VENUE_OVERRIDE (both keyed by team name only). Keyed by
# f"{home}|{date}" (date = the fixture's local date, "YYYY-MM-DD"); value: (venue, city, country-code).
# Sourced by the user from ticket-listing sites (schedules/*-next-games.png, 2026-09-26) for the
# 2026-27 League A matchdays where API-Football doesn't publish a venue yet (too far ahead).
NATION_MATCH_VENUE = {
    # -- single-venue fills the user gave earlier (before the schedules/ screenshots), applied to
    # that team's currently-scheduled home matchday(s) (2026-09-29). Denmark's fixture below was a
    # genuine bug fix: the live API had briefly attached "Cardiff City Stadium" to Denmark vs Portugal
    # (verified wrong, and the real venue, via web search) - not a guess.
    "England|2026-10-06": ("Wembley Stadium", "London", "gb"),
    "England|2026-11-12": ("Wembley Stadium", "London", "gb"),
    "Bosnia & Herzegovina|2026-10-05": ("Bilino Polje Stadium", "Zenica", "ba"),
    "Wales|2026-11-17": ("Cardiff City Stadium", "Cardiff", "wls"),
    "Serbia|2026-11-13": ("Rajko Mitić Stadium", "Belgrade", "rs"),
    "Denmark|2026-10-01": ("Parken Stadium", "Copenhagen", "dk"),

    "France|2026-10-02": ("Stade de France", "Saint-Denis", "fr"),
    "Poland|2026-10-02": ("PGE Narodowy", "Warsaw", "pl"),
    "Croatia|2026-10-03": ("Stadion HNK Rijeka", "Rijeka", "hr"),
    "Spain|2026-10-03": ("Estadio Carlos Tartiere", "Oviedo", "es"),
    "Portugal|2026-10-04": ("Estadio do Dragão", "Porto", "pt"),
    "Netherlands|2026-10-04": ("Philips Stadion", "Eindhoven", "nl"),
    "Greece|2026-10-04": ("Toumba Stadium", "Thessaloniki", "gr"),
    "France|2026-10-05": ("Stade de France", "Saint-Denis", "fr"),
    "Italy|2026-10-05": ("Stadio Renato Dall'Ara", "Bologna", "it"),
    "Croatia|2026-10-06": ("Poljud Stadion", "Split", "hr"),
    "Italy|2026-11-12": ("Stadio San Siro", "Milan", "it"),
    "Czechia|2026-11-12": ("epet ARENA", "Prague", "cz"),
    "Netherlands|2026-11-13": ("Johan Cruyff ArenA", "Amsterdam", "nl"),
    "Portugal|2026-11-14": ("Estádio Municipal de Braga", "Braga", "pt"),
    "Romania|2026-11-14": ("Steaua Stadium", "Bucharest", "ro"),
    "Belgium|2026-11-15": ("King Baudouin Stadium", "Brussels", "be"),
    "France|2026-11-15": ("Stade Matmut Atlantique", "Bordeaux", "fr"),
    "Spain|2026-11-15": ("Riyadh Air Metropolitano", "Madrid", "es"),
    "Germany|2026-11-16": ("Olympic Stadium Berlin", "Berlin", "de"),
    "Poland|2026-11-17": ("Tarczyński Arena Wrocław", "Wrocław", "pl"),
}
