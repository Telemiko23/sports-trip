/* ToSport v2 - interface strings. Hebrew is the complete default release. English (LTR) and Arabic (RTL) are PREPARED
   (locale registry, direction, fallback to Hebrew) but intentionally empty: no selector is shipped until a locale's visible
   flows are actually translated, and unknown Arabic entity names are never machine-invented (source-language names stay as
   they are, isolated with <bdi>). Add a locale by filling DICT.<code> and listing it in READY. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.ToSport = root.ToSport || {}; root.ToSport.i18n = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DICT = {
    he: {
      'app.loadError': 'לא ניתן לטעון את נתוני האירועים. נסו לרענן את הדף.',
      'app.noscript': 'האתר דורש JavaScript כדי לחפש אירועים ולהרכיב טיול.',
      'skip': 'דלג לתוכן הראשי',
      'logo.alt': 'ToSport - דף הבית',
      'nav.label': 'ניווט ראשי',
      'nav.search': 'חיפוש אירועים', 'nav.plan': 'תכנון טיול', 'nav.trip': 'הטיול שלי',
      'nav.tripCount.one': 'אירוע אחד בטיול', 'nav.tripCount.other': '{n} אירועים בטיול',
      'storage.off': 'השמירה בדפדפן אינה זמינה - השינויים לא יישמרו אחרי סגירת הדף.',
      'storage.migrated': 'שחזרנו את הטיול והחיפוש האחרונים שלכם מהגרסה הקודמת של האתר. עותק גיבוי נשמר בדפדפן.',
      'storage.issues': 'חלק מהנתונים השמורים בדפדפן לא היו תקינים ולא נקלטו. עותק שלהם נשמר ולא נמחק.',

      'ob.title': 'גלו את אירועי הספורט שיהפכו את הטיול שלכם לחוויה.',
      'ob.sub': 'בחרו יעד ותאריכים, מצאו אירועים מענפים שונים והרכיבו את הטיול שמתאים לכם.',
      'ob.browse': 'עדיין אין לי יעד',
      'ob.browseHint': 'נציג אירועים מכל היעדים לתקופה שתבחרו.',

      'form.dest': 'יעד',
      'form.destPlaceholder': 'לדוגמה: לונדון או אנגליה',
      'form.destHint': 'עיר או מדינה. אפשר להקליד בעברית או באנגלית ולבחור מההצעות.',
      'form.destResolvedCity': 'יעד נבחר: {name} ({country}).',
      'form.destResolvedCountry': 'יעד נבחר: כל {name}.',
      'form.destUnresolved': 'עדיין לא בחרתם יעד מהרשימה. בחרו אחת מההצעות.',
      'form.destUnknown': 'לא מצאנו יעד בשם הזה. בדקו את האיות או נסו עיר/מדינה אחרת.',
      'form.destAmbiguous': 'יש כמה יעדים בשם הזה. בחרו אחד מהרשימה.',
      'form.destRequired': 'בחרו יעד, או לחצו על ״עדיין אין לי יעד״.',
      'form.noResults': 'אין הצעות מתאימות',
      'form.suggest.one': 'הצעה אחת', 'form.suggest.other': '{n} הצעות',
      'form.dates': 'תאריכים',
      'form.fixed': 'יש לי תאריכים', 'form.flexible': 'התאריכים שלי גמישים',
      'form.from': 'מתאריך', 'form.to': 'עד תאריך',
      'form.month': 'חודש', 'form.duration': 'משך הטיול', 'form.durationDays': '{n} ימים',
      'form.flexNote': 'נציע עד שלושה חלונות תאריכים מתאימים בטווח שבחרתם, לפי האירועים שנמצאו.',
      'form.datesPast': 'תאריכי הטיול כבר עברו. בחרו תאריכים עתידיים.',
      'form.datesOrder': 'תאריך הסיום חייב להיות באותו יום או אחרי תאריך ההתחלה.',
      'form.datesMissing': 'בחרו תאריכי התחלה וסיום.',
      'form.go': 'מצאו אירועים', 'form.save': 'שמירה', 'form.cancel': 'ביטול',
      'form.newSearch': 'חיפוש חדש',
      'form.radius': 'אזור קרוב', 'form.radiusKm': 'עד {n} ק״מ (במרחק אווירי)',
      'form.editTitle': 'שינוי יעד ותאריכים',

      'ctx.edit': 'שינוי יעד ותאריכים',
      'ctx.destCity': '{name}', 'ctx.destCountry': 'כל {name}', 'ctx.destNone': 'כל היעדים',
      'ctx.scope': 'אזור קרוב: עד {n} ק״מ (במרחק אווירי)',
      'ctx.scopeCountry': 'כל האירועים במדינה',
      'ctx.scopeNone': 'ללא הגבלת יעד',
      'ctx.label': 'הקשר החיפוש',
      'ctx.flex': 'תאריכים גמישים: {range}, טיול של {n} ימים',
      'ctx.flexPick': 'בחרו חלון תאריכים ב״תכנון טיול״',
      'ret.welcome': 'ברוכים השבים',
      'ret.trip.one': 'בטיול שלכם אירוע אחד', 'ret.trip.other': 'בטיול שלכם {n} אירועים',
      'ret.continue': 'המשך הטיול שלי', 'ret.new': 'חיפוש חדש', 'ret.dismiss': 'סגירה',
      'ret.pastDates': 'התאריכים ששמרתם ({range}) כבר עברו. האירועים שבחרתם נשמרו.',
      'ret.pickDates': 'בחירת תאריכים חדשים',

      'view.label': 'תצוגת תוצאות', 'view.list': 'רשימה', 'view.map': 'מפה',
      'filter.button': 'סינון', 'filter.buttonCount': 'סינון ({n})',
      'sports.label': 'ענפים', 'sports.all': 'כל הענפים',
      'days.label': 'בחירת יום', 'days.all': 'כל הימים', 'days.select': 'יום', 'days.count.one': 'אירוע אחד', 'days.count.other': '{n} אירועים',
      'results.summary': '{n} אירועים ב־{d} ימים',
      'results.summaryGroups': '{n} אירועים ב־{d} ימים (מהם {m} ימי טורניר מתוך {g} טורנירים רב־יומיים)',
      'results.noPos': '{n} אירועים בלי מיקום מזוהה לא נכללים בחיפוש לפי קרבה.',
      'results.coverage': 'הנתונים שלנו מכסים אירועים עד {date}. אחרי התאריך הזה ייתכן שיש עוד אירועים שעדיין לא הגיעו לעדכון.',
      'more.show.one': 'הצג עוד פריט אחד', 'more.show.other': 'הצג עוד {n} פריטים',
      'results.announce': 'נמצאו {n} אירועים',
      'empty.title': 'לא נמצאו אירועים בכיסוי הנתונים הנוכחי',
      'empty.note': 'זה לא אומר שאין אירועי ספורט ביעד - רק שאין אירועים תואמים בנתונים שלנו. אפשר לנסות:',
      'empty.extendDates': 'הרחבת התאריכים בשבוע', 'empty.growRadius': 'הגדלת האזור ל־{n} ק״מ',
      'empty.clearFilters': 'הסרת הסינון', 'empty.allSports': 'כל הענפים',
      'empty.noDay': 'אין אירועים ביום הזה. אפשר לבחור יום אחר או ״כל הימים״.',
      'fchip.comps': 'תחרויות מוסתרות: {n}', 'fchip.days': 'ימי שבוע מוסתרים: {n}', 'fchip.remove': 'הסרת הסינון',
      'filters.reset': 'איפוס מסננים',
      'filters.resetScope': 'מאפס רק מסננים אופציונליים - לא את היעד, התאריכים או הטיול.',
      'fd.title': 'סינון', 'fd.radius': 'אזור קרוב', 'fd.weekdays': 'ימים בשבוע', 'fd.weekdaysHint': 'ימים מסומנים מוצגים.',
      'fd.comps': 'תחרויות', 'fd.compsHint': 'תחרויות מסומנות מוצגות.', 'fd.all': 'הכל', 'fd.none': 'כלום',
      'fd.apply': 'הצג {n} אירועים', 'fd.cancel': 'ביטול', 'fd.close': 'סגירת הסינון',

      'ev.add': 'הוסף לטיול', 'ev.added': 'בטיול ✓', 'ev.details': 'פרטים',
      'ev.timeUnpublished': 'שעה לא פורסמה', 'ev.day': 'יום {n}', 'ev.dayOf': 'יום {n} מתוך {m}',
      'ev.placeUnknown': 'מיקום מדויק עדיין לא ידוע',
      'ev.placeCityOnly': 'מיקום מדויק עדיין לא ידוע',
      'ev.provisional': 'מיקום משוער (אירוע רב־עירוני)',
      'ev.groupDays.one': 'יום אחד בטווח', 'ev.groupDays.other': '{n} ימים בטווח',
      'ev.pickDay': 'בחירת יום / סשן', 'ev.sessions': 'סשנים', 'ev.sessionsNone': 'לוח הסשנים של היום הזה לא זמין.',
      'ev.official': 'לאתר הרשמי של האירוע', 'ev.close': 'סגירה',
      'ev.when': 'מתי', 'ev.where': 'איפה', 'ev.tickets': 'כרטיסים', 'ev.about': 'פרטי האירוע',
      'ev.ticketsNone': 'מידע על כרטיסים אינו זמין כרגע. כדאי לבדוק באתר הרשמי של האירוע או של המועדון.',
      'ev.timeNote': 'השעות הן שעון מקומי באתר האירוע (לא שעון ישראל), והן עשויות להשתנות.',
      'ev.dateOnly': 'האירוע נמשך כל היום; השעות נקבעות לפי הסשן.',
      'ev.locationsKnown': 'מיקומים שידועים לנו (מקור: {src}). עדיין לא ברור היכן יתקיים כל יום:',
      'ev.round': 'שלב: {r}', 'ev.parentRange': '{name}: {range}',
      'ev.approxMap': 'מרכז העיר בלבד - לא סיכת אצטדיון מאומתת.',

      'trip.title': 'הטיול שלי',
      'trip.empty': 'עוד לא בחרתם אירועים לטיול.',
      'trip.emptyHint': 'חפשו אירועים ביעד שלכם והוסיפו אותם - הם יופיעו כאן לפי ימים.',
      'trip.goSearch': 'חיפוש אירועים',
      'trip.counts': '{n} אירועים ב־{d} ימים · {nights} לילות',
      'trip.countsOne': 'אירוע אחד ביום אחד · {nights} לילות',
      'trip.dates': 'תאריכי הטיול', 'trip.arrival': 'הגעה', 'trip.departure': 'חזרה',
      'trip.datesSource.search': 'לפי התאריכים שבחרתם בחיפוש.',
      'trip.datesSource.derived': 'משוער לפי האירועים (הגעה ביום האירוע הראשון, חזרה למחרת האחרון) - אפשר לתקן.',
      'trip.datesSource.explicit': 'נקבע על ידיכם.',
      'trip.datesSource.none': '',
      'trip.datesAuto': 'חזרה לתאריכים אוטומטיים',
      'trip.outside': 'יש אירועים מחוץ לתאריכי הטיול ({n}). שנו את התאריכים או הסירו אותם - לא מחקנו כלום.',
      'trip.free': 'זמן פנוי', 'trip.freeNote': 'לא נבחר אירוע ליום הזה. זה לא אומר שאין אירועים.',
      'trip.searchDay': 'חיפוש אירועים ליום הזה',
      'trip.lock': 'חובה בטיול', 'trip.unlock': 'ביטול ״חובה בטיול״',
      'trip.remove': 'הסרה מהטיול', 'trip.removeNamed': 'הסרת {title} מהטיול',
      'trip.removed': 'האירוע הוסר מהטיול', 'trip.undo': 'ביטול', 'trip.cleared': 'הטיול נוקה',
      'trip.added': 'נוסף לטיול: {title}',
      'trip.missing': 'האירוע כבר לא מופיע בעדכון האחרון - כדאי לבדוק את הפרטים',
      'trip.missingNote': 'אירוע שנעלם מהעדכון לא בהכרח בוטל. שמרנו את הפרטים שבחרתם.',
      'trip.changed': 'פרטי האירוע השתנו בעדכון האחרון',
      'trip.was': 'היה: {v}', 'trip.now': 'עכשיו: {v}', 'trip.ack': 'אישור השינוי',
      'trip.decisions': 'דורש החלטה',
      'trip.dayHeading': 'יום {n}',
      'travel.title': 'טיסות ולינה', 'travel.origin': 'טיסה מ־',
      'travel.flightReturn': 'חיפוש טיסות הלוך-חזור', 'travel.flightOut': 'טיסת הלוך: {city}', 'travel.flightBack': 'טיסת חזור מ{city}',
      'travel.hotel': 'חיפוש לינה: {city}', 'travel.hotelDates': '{a} – {b} ({n} לילות)',
      'travel.noNights': 'אין לילה ב{city} בתאריכים האלה - לא נוצר חיפוש לינה.',
      'travel.note': 'קישורי הטיסה והלינה פותחים חיפוש כללי לפי תאריכי הטיול שלמעלה. לא מוצגים מחירים.',
      'actions.copy': 'העתקת הטיול כטקסט', 'actions.copied': 'הועתק ✓',
      'actions.export': 'ייצוא גיבוי', 'actions.import': 'ייבוא גיבוי',
      'actions.clear': 'ניקוי הטיול', 'actions.clearConfirm': 'לנקות את כל הטיול? אפשר יהיה לבטל מיד אחרי.',
      'import.title': 'ייבוא גיבוי', 'import.pick': 'בחרו קובץ גיבוי של ToSport (JSON).',
      'import.merge': 'הוספה לטיול הנוכחי', 'import.replace': 'החלפת הטיול הנוכחי', 'import.cancel': 'ביטול',
      'import.summary.one': 'בגיבוי: אירוע אחד.', 'import.summary.other': 'בגיבוי: {n} אירועים.',
      'import.done': 'הגיבוי יובא', 'import.exported': 'הגיבוי ירד למחשב',
      'import.error.not-json': 'הקובץ אינו קובץ JSON תקין.', 'import.error.too-large': 'הקובץ גדול מדי.',
      'import.error.wrong-format': 'זה לא קובץ גיבוי של ToSport.', 'import.error.unsupported-version': 'גרסת הגיבוי אינה נתמכת.',
      'import.error.no-trip': 'לא נמצא טיול בקובץ.', 'import.error.not-text': 'לא ניתן לקרוא את הקובץ.',
      'note.sameDayUnknown': 'שני אירועים באותו יום, ולאחד מהם אין שעה ידועה - אי אפשר לוודא שמתאים לשניהם.',
      'note.sameDayClose': 'שני אירועים באותו יום בהפרש קצר - ייתכן שלא אפשר להגיע לשניהם.',
      'note.sameDayTransfer': 'שני אירועים באותו יום בערים שונות - זמן הנסיעה לא נבדק.',
      'note.transferUnverified': 'מעבר מ{from} ל{to}: זמן הנסיעה לא נבדק (למשל מעבר ים או גבול).',
      'note.directions': 'מסלול בגוגל מפות',
      'peek.title': 'בטיול שלי', 'peek.more': 'ועוד {n}…',

      'map.loading': 'טוענים את המפה…', 'map.failed': 'המפה לא נטענה. אפשר להמשיך לעבוד עם הרשימה.',
      'map.hint': 'לחצו על סיכה כדי לראות את האירועים במקום. הסיכה לא משנה את יעד החיפוש.',
      'map.pinPrecise': 'סיכה מדויקת', 'map.pinApprox': 'מיקום משוער (מרכז העיר)',
      'map.count.events': 'מספר האירועים בכל סיכה',
      'map.close': 'סגירת הפאנל', 'map.searchHere': 'חיפוש סביב המקום הזה',
      'map.panelCount.one': 'אירוע אחד כאן', 'map.panelCount.other': '{n} אירועים כאן',
      'map.list': 'רשימת האירועים על המפה',

      'plan.title': 'תכנון טיול',
      'plan.soon': 'התכנון נטען…',

      'toast.close': 'סגירת ההודעה',
      'live.added': 'נוסף לטיול: {title}', 'live.removed': 'הוסר מהטיול: {title}',
      'dialog.close': 'סגירה',
      'legal.link': 'מידע משפטי ופרטיות', 'legal.title': 'מידע משפטי ופרטיות',
      'legal.p1': 'אתר אישי לתכנון טיולים, ללא כל זיקה למועדונים, לליגות או לגופי שידור.',
      'legal.p2': 'התאריכים והשעות באתר נלקחים ממקורות חיצוניים ואינם מחייבים. משחקים רבים נקבעים קדימה עם שעה זמנית או בלי שעה, ולעתים גם התאריך עצמו עשוי להשתנות. לפני רכישת כרטיסים, טיסות או לינה מומלץ לוודא את הפרטים באתר הרשמי. האתר אינו אחראי לשינויים, לביטולים או לנזק שנגרם מהסתמכות על המידע המוצג.',
      'legal.p3': 'סמלי הקבוצות והתחרויות מיועדים לזיהוי בלבד; כל הזכויות בהם שייכות לבעליהן, ואין בהצגתם כדי לרמז על חסות, אישור או שיתוף פעולה.',
      'legal.p4': 'האתר משתמש ב-Google Analytics כדי להבין אילו תכונות שימושיות. זה כרוך בשמירת עוגייה בדפדפן ובשליחת נתוני שימוש אנונימיים. לא נשלח טקסט חופשי שהוקלד ולא פרטי הטיול המלאים.',
      'legal.p5': 'קישורי הטיסה והלינה פותחים חיפוש רגיל אצל הספק, בלי מעורבות של האתר ובלי מחירים. אם וכשיופעל קישור שותפים, הזמנה דרכו עשויה לזכות את האתר בעמלה.',
      'footer.data': 'נתוני משחקים: <a href="https://www.api-football.com" target="_blank" rel="noopener">API-Football</a> · מיקומים: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">משתתפי OpenStreetMap</a> · שדות תעופה: <a href="https://ourairports.com/data/" target="_blank" rel="noopener">OurAirports</a> · אירועי ספורט נוספים: <a href="https://allsportdb.com" target="_blank" rel="noopener">AllSportDB</a>',
      'footer.version': 'גרסה {v}', 'footer.updated': 'הנתונים עודכנו ב־{when}',
      'weekdays.long': 'ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת',
      'weekdays.short': 'א׳|ב׳|ג׳|ד׳|ה׳|ו׳|ש׳'
    },
    en: {},
    ar: {}
  };
  var META = { he: { dir: 'rtl', lang: 'he' }, en: { dir: 'ltr', lang: 'en' }, ar: { dir: 'rtl', lang: 'ar' } };
  var READY = ['he'];          // locales with a complete translation of the visible flows
  var locale = 'he';

  function setLocale(l) { if (READY.indexOf(l) !== -1) locale = l; return locale; }
  function getLocale() { return locale; }
  function lookup(key) {
    var d = DICT[locale];
    if (d && d[key] != null) return d[key];
    return DICT.he[key];
  }
  function t(key, params) {
    var s = lookup(key);
    if (s == null) return key;
    return String(s).replace(/\{(\w+)\}/g, function (m, k) { return params && params[k] != null ? params[k] : ''; });
  }
  // Hebrew plural: "one" for exactly 1, otherwise "other" (add "two" later if a design needs it)
  function tn(key, n, params) {
    var p = {}; if (params) for (var k in params) p[k] = params[k]; p.n = n;
    return t(key + (n === 1 ? '.one' : '.other'), p);
  }
  function dir() { return META[locale].dir; }
  return { DICT: DICT, META: META, READY: READY, t: t, tn: tn, setLocale: setLocale, getLocale: getLocale, dir: dir };
});
