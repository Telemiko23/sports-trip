# שינוי שם / מיתוג המוצר

## בקוד (אוטומטי - אני עושה את זה)

שם המוצר והגרסה יושבים במקום אחד: [brand.js](brand.js) (`window.BRAND.name`, `window.BRAND.version`).
שינוי שם שם = כותרת הדף (`<title>`), הכותרת בראש האתר (המילה הראשונה רגילה, השאר מודגש
בצבע) והגרסה בפוטר - הכול מתעדכן. כל מה שצריך לומר לי: "שנה את שם המוצר ל-X".

לא נגעתי בכוונה בשם ב-User-Agent של הסקריפטים (`sports-trip-planner/1.0` ב-Python) - זה
מזהה את הפרויקט מול Nominatim/API-Football, לא שם פונה ללקוח, ואין סיבה לשנות אותו.
מסמכי ה-`.md` בתיקייה (README/ROADMAP/STATUS) מזכירים את השם הישן בטקסט חופשי - אני מעדכן אותם
יחד עם שינוי השם כשמבקשים.

## מחוץ לקוד (את אלה רק אתה יכול לעשות - חשבונות שלך)

### GitHub
1. Repo → Settings → General → Repository name → שם חדש.
2. **שים לב**: כתובת האתר (GitHub Pages) היא `telemiko23.github.io/<שם-הרפו>/` - היא תשתנה
   יחד עם שם הרפו, וה-URL הישן **לא** מנותב אוטומטית לחדש. (לגיט עצמו יש הפניה אוטומטית
   מהכתובת הישנה, לאתר לא.)
3. אחרי שינוי: להריץ אצלך `git remote set-url origin https://github.com/Telemiko23/<שם-חדש>.git`.
4. עדכון ה-URL של האתר ב-GA ו-Travelpayouts (למטה), ובקבצי STATUS.md.
5. **המלצה חזקה**: דומיין משלך (מחובר ל-GitHub Pages דרך CNAME, Settings → Pages → Custom
   domain) מנתק את המיתוג משם הרפו לחלוטין - אתר שנקרא `shem.com` לא תלוי ב-`github.io`,
   ובשינוי שם עתידי לא משנים כתובת. וזה גם מעלה מהימנות מול תוכניות שותפים (ראה
   הסירוב של Booking).

### Google Analytics 4
- Admin → Property settings → **Property name** (שם הנכס).
- Admin → Data streams → הסטרים → אפשר לערוך שם סטרים וכתובת האתר.
- ה-Measurement ID (`G-...`) **לא משתנה** - אין צורך לגעת בקוד.

### Travelpayouts
- **Project** = האתר שלך ב-Travelpayouts (Tools → Projects): שם ה-Project וה-URL שלו.
- שינוי ה-URL של Project שכבר הוגש לתוכניות עלול להפעיל בדיקה מחדש - כדאי לשנות שם/דומיין
  **לפני** בקשת חיבור חדשה ל-Booking, לא באמצע.
