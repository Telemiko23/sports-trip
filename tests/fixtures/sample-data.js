// Deterministic, sanitized sample of the feed shape (NOT production data): used by unit tests and the Playwright
// suite (served in place of fixtures.js). Dates are fixed so tests never depend on the rolling production feed.
// Includes: an eligible Arsenal fixture + alternatives in London, a Premier League match in Manchester, a French
// match near London (cross-water), a multi-day tennis tournament with sessions, a darts event, and a multi-city event.
window.TRIP_DATA = {
  generated: '2026-10-01T10:00',
  days_ahead: 120,
  competitions: [
    { id: 39, label: 'Premier League', country: 'England', label_he: 'הפרמייר ליג' },
    { id: 40, label: 'Championship', country: 'England', label_he: "הצ'מפיונשיפ" },
    { id: 2, label: 'Champions League', country: 'Europe', label_he: 'ליגת האלופות' },
    { id: 61, label: 'Ligue 2', country: 'France', label_he: 'ליג 2 הצרפתית' },
    { id: 1000260, label: 'ATP Tour', country: 'Tennis', label_he: 'סיבוב ה-ATP', sport: 'tennis' },
    { id: 2000001, label: 'PDC Majors', country: 'Darts', label_he: 'טורנירי הענק של PDC', sport: 'darts' },
    { id: 1000461, label: 'Tennis United Cup', country: 'Tennis', label_he: 'גביע יונייטד', sport: 'tennis' }
  ],
  fixtures: [
    { id: 101, dt: '2026-10-09T20:00', status: 'NS', home: 'West Ham', away: 'QPR', home_he: 'ווסט האם', away_he: "קווינס פארק ריינג'רס", comp_id: 40, comp: 'Championship', comp_he: "הצ'מפיונשיפ", country: 'England', round: 'R10', venue: 'London Stadium', city: 'London', city_he: 'לונדון', lat: 51.5074, lng: -0.1278, venue_lat: 51.5386, venue_lng: -0.0166 },
    { id: 102, dt: '2026-10-10T12:30', status: 'NS', home: 'Arsenal', away: 'Leeds', home_he: 'ארסנל', away_he: 'לידס', comp_id: 39, comp: 'Premier League', comp_he: 'הפרמייר ליג', country: 'England', round: 'R7', venue: 'Emirates Stadium', city: 'London', city_he: 'לונדון', lat: 51.5074, lng: -0.1278, venue_lat: 51.555, venue_lng: -0.1084 },
    { id: 103, dt: '2026-10-10T12:30', status: 'NS', home: 'Charlton', away: 'Bristol City', home_he: "צ'רלטון", away_he: 'בריסטול סיטי', comp_id: 40, comp: 'Championship', comp_he: "הצ'מפיונשיפ", country: 'England', round: 'R10', venue: 'The Valley', city: 'London', city_he: 'לונדון', lat: 51.5074, lng: -0.1278, venue_lat: 51.4865, venue_lng: 0.0364 },
    { id: 104, dt: '2026-10-11T14:00', status: 'NS', home: 'Crystal Palace', away: 'Nottingham Forest', home_he: 'קריסטל פאלאס', away_he: 'נוטינגהאם פורסט', comp_id: 39, comp: 'Premier League', comp_he: 'הפרמייר ליג', country: 'England', round: 'R7', venue: 'Selhurst Park', city: 'London', city_he: 'לונדון', lat: 51.5074, lng: -0.1278, venue_lat: 51.3983, venue_lng: -0.0855 },
    { id: 105, dt: '2026-10-10T17:30', status: 'NS', home: 'Man United', away: 'Liverpool', home_he: "מנצ'סטר יונייטד", away_he: 'ליברפול', comp_id: 39, comp: 'Premier League', comp_he: 'הפרמייר ליג', country: 'England', round: 'R7', venue: 'Old Trafford', city: 'Manchester', city_he: "מנצ'סטר", lat: 53.4808, lng: -2.2426, venue_lat: 53.4631, venue_lng: -2.2913 },
    { id: 106, dt: '2026-10-10T19:00', status: 'NS', home: 'Boulogne', away: 'Sochaux', home_he: 'בולון', away_he: 'סושו', comp_id: 61, comp: 'Ligue 2', comp_he: 'ליג 2 הצרפתית', country: 'France', round: 'R9', venue: 'Stade de la Libération', city: 'Boulogne-sur-Mer', city_he: 'בולון סור מר', lat: 50.7264, lng: 1.6147, venue_lat: 50.7117, venue_lng: 1.6143 },
    { id: 107, dt: '2026-10-11T19:45', status: 'TBD', home: 'Aston Villa', away: 'Dortmund', home_he: 'אסטון וילה', away_he: 'דורטמונד', comp_id: 2, comp: 'Champions League', comp_he: 'ליגת האלופות', country: 'England', round: 'League', venue: null, city: 'Birmingham', city_he: 'ברמינגהאם', lat: 52.4862, lng: -1.8904, venue_lat: null, venue_lng: null },
    { id: 1000000001, sport: 'tennis', dt: '2026-10-09T00:00', date_to: '2026-10-14', status: 'TBD', title: 'Sample Indoors', title_he: 'סמפל אינדורס', comp_id: 1000260, comp: 'ATP Tour', comp_he: 'סיבוב ה-ATP', country: 'England', venue: 'Sample Arena', city: 'London', city_he: 'לונדון', lat: 51.5074, lng: -0.1278, venue_lat: 51.5, venue_lng: -0.2, web_url: 'https://example.org/atp/sample',
      sessions: { '2026-10-09': [{ series: 'מגרש מרכזי', name: 'משחק 1', start: '11:00', main: true }], '2026-10-10': [{ series: 'מגרש מרכזי', name: 'משחק 1', start: '13:00', main: true }] }, sessions_note: 'לוח זמנים לדוגמה' },
    { id: 1000000002, sport: 'darts', dt: '2026-10-10T00:00', date_to: '2026-10-10', status: 'TBD', title: 'Sample Darts Night', title_he: 'ערב דארטס לדוגמה', comp_id: 2000001, comp: 'PDC Majors', comp_he: 'טורנירי הענק של PDC', country: 'England', venue: null, city: 'London', city_he: 'לונדון', lat: 51.5074, lng: -0.1278, venue_lat: null, venue_lng: null },
    { id: 1000000003, sport: 'tennis', dt: '2027-01-01T00:00', date_to: '2027-01-10', status: 'TBD', title: 'Sample United Cup', title_he: 'גביע יונייטד לדוגמה', comp_id: 1000461, comp: 'Tennis United Cup', comp_he: 'גביע יונייטד', country: 'Australia', venue: null, city: 'Sydney', city_he: 'סידני', lat: -33.8698, lng: 151.2083, venue_lat: null, venue_lng: null,
      locs: [{ city: 'Sydney', country: 'Australia', src: 'AllSportDB' }, { city: 'Perth', country: 'Australia', src: 'AllSportDB' }], loc_provisional: true },
    { id: 108, dt: '2026-11-21T15:00', status: 'NS', home: 'Arsenal', away: 'Chelsea', home_he: 'ארסנל', away_he: "צ'לסי", comp_id: 39, comp: 'Premier League', comp_he: 'הפרמייר ליג', country: 'England', round: 'R12', venue: 'Emirates Stadium', city: 'London', city_he: 'לונדון', lat: 51.5074, lng: -0.1278, venue_lat: 51.555, venue_lng: -0.1084 }
  ]
};
