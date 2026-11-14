# Készülök – telepítési útmutató

Ez egyszeri beállítás, nagyjából 30–45 perc. A végén:

- az adatok egy Google táblázatban lesznek a ti fiókotokban,
- az alkalmazás egy ingyenes GitHub Pages címen fut,
- mindenki a saját Google-fiókjával jelentkezik be, a szerepet (szülő vagy gyerek) a táblázat dönti el.

Ehhez kell: egy Google-fiók (a szülőé, ebben lesz a táblázat) és egy ingyenes GitHub-fiók.

---

## 1. A táblázat és a szkript

1. A **szülői** Google-fiókkal hozz létre egy új, üres Google táblázatot, például *Készülök* néven.
2. Menü: **Bővítmények → Apps Script**. Megnyílik a szkriptszerkesztő.
3. Töröld a `Kód.gs` (vagy `Code.gs`) tartalmát, és másold be helyette az [`apps-script/Code.gs`](apps-script/Code.gs) teljes tartalmát.
4. Bal oldalt a **⚙️ Projektbeállítások** alatt kapcsold be: *„Az appsscript.json jegyzékfájl megjelenítése a szerkesztőben”*.
5. Vissza a szerkesztőbe, nyisd meg az `appsscript.json` fájlt, és cseréld le az [`apps-script/appsscript.json`](apps-script/appsscript.json) tartalmára.
6. Mentés (💾).

## 2. A lapok létrehozása

1. A szerkesztő tetején a függvényválasztóban válaszd ki: `tablazatElokeszitese`, majd kattints a **Futtatás** gombra.
2. A Google engedélyt kér. Az ablakban jelölj be **minden** pontot („Összes kijelölése”). Mivel ez a saját szkripted, megjelenik egy „A Google nem ellenőrizte ezt az alkalmazást” figyelmeztetés: **Speciális → Ugrás ide: … (nem biztonságos)** → **Engedélyezés**. Ez rendben van, a szkript csak a saját táblázatodhoz fér hozzá.
3. Lépj vissza a táblázatba. Megjelennek a lapok, mintaadatokkal. Később is futtathatod a **Készülök → Táblázat előkészítése** menüből, ilyenkor semmit nem ír felül, csak a hiányzó dolgokat pótolja.

## 3. Töltsétek ki a táblázatot

| Lap | Mit írjatok bele |
|---|---|
| **Felhasználók** | Minden családtag Google e-mail címe, neve és szerepe (`szülő` / `gyerek`). Akit nem írtok be, az nem tud belépni. A „Név” jelenik meg az appban („Szia, Bence!”). |
| **Tantárgyak** | A tantárgyak neve, színe (pl. `#4A6FA5`), ikonja (emoji) és ha kell, a felszerelés (pl. „tornazsák”). |
| **Órarend** | Nap (`Hétfő`…`Péntek`), hányadik óra, tantárgy (a Tantárgyak lapról választható). A **Hét** oszlop csak A/B hetes órarendnél kell (`A` vagy `B`, üresen mindkét héten). |
| **Csengetés** | Az órák kezdete és vége. Nem kötelező, ha kitöltitek, az óra mellett megjelenik az időpont. |
| **Szünetek** | Szünetek és tanítás nélküli napok (első és utolsó nap). Ezeken a napokon nincs óra, és a sorozat sem szakad meg. |
| **Házi feladatok** | Ezt nem kell kitölteni: az app tölti, amikor a gyerek (vagy ti) felvesztek egy házit. Ha hiányzik a lap, az első házi felvételekor magától létrejön. |
| **Jutalmak** | Mit kaphat és hány csillagért. Az „Aktív” oszlopban `nem`-mel elrejthetsz egy jutalmat. |
| **Beállítások** | Lásd lent. A `google_client_id` a 6. lépésben kerül ide. |

A mintaadatokat írjátok át vagy töröljétek. A fejléc-sort (1. sor) **ne** nevezzétek át, a program a fejlécek alapján találja meg az oszlopokat.

## 4. A szkript közzététele webalkalmazásként

1. Az Apps Script szerkesztőben: **Telepítés → Új telepítés**.
2. Típus (⚙️): **Webalkalmazás**.
   - *Végrehajtás mint:* **Én**
   - *Hozzáférés:* **Bárki**

   Ettől még senki nem lát bele az adatokba: minden kérés csak érvényes bejelentkezéssel működik, a bejelentkezés pedig csak a Felhasználók lapon lévő fiókokkal.
3. **Telepítés** → másold ki a **webalkalmazás URL-jét** (`https://script.google.com/macros/s/…/exec`).
4. Írd be ezt az URL-t a [`web/config.js`](web/config.js) fájlba az `API_URL` értékeként.

> **Ha később módosul a `Code.gs`:** Telepítés → Telepítések kezelése → ✏️ → Verzió: **Új verzió** → Telepítés. Így az URL ugyanaz marad.

## 5. Az alkalmazás közzététele (GitHub Pages)

1. Hozz létre egy **nyilvános** GitHub repót, például `keszulok_a_sulira` néven. A kódban nincs személyes adat, az adatok a Google táblázatban maradnak.
2. Töltsd fel a **teljes projektmappát** (a gyökeret, amiben a `web`, `apps-script`, `tests` és `.github` mappa van, nem csak a `web`-et). A közzétételi folyamat a `.github` mappából indul, lefuttatja a teszteket, és csak a `web` mappa tartalma kerül ki a weboldalra. A parancsokat a projektmappában futtasd:
   ```
   cd C:\DEVELOPMENT\school-schedule
   git init
   git add .
   git commit -m "Készülök"
   git branch -M main
   git remote add origin https://github.com/FELHASZNALONEV/keszulok_a_sulira.git
   git push -u origin main
   ```
3. GitHub-on a repóban: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Az **Actions** fülön lefut a „Közzététel” munkafolyamat: lefuttatja a teszteket, és közzéteszi a `web/` mappát. A cím:
   `https://FELHASZNALONEV.github.io/keszulok_a_sulira/`

## 6. Google-bejelentkezés beállítása (OAuth kliensazonosító)

1. Nyisd meg a <https://console.cloud.google.com/> oldalt (bármelyik szülői fiókkal), és hozz létre egy új projektet, például *Keszulok* néven.
2. **API-k és szolgáltatások → OAuth-hozzájárulási képernyő** (újabb felületen: *Google Auth Platform*):
   - Alkalmazás neve: *Készülök*, támogatási e-mail: a tiéd.
   - Célközönség: **Külső** (External).
   - Ezután vagy **közzéteszed** („Publish app” / „Éles”), vagy tesztmódban hagyod, és a **Tesztfelhasználók** közé felveszed a család összes e-mail címét. Ellenőrzés egyik esetben sem kell, mert az app csak a nevet és az e-mail címet kéri.
3. **Ügyfelek / Hitelesítési adatok → Ügyfél létrehozása → OAuth-ügyfélazonosító**:
   - Típus: **Webes alkalmazás**
   - **Engedélyezett JavaScript-források:** `https://FELHASZNALONEV.github.io` (útvonal és perjel nélkül!)
   - Ha a gépen helyben is ki akarod próbálni, add hozzá ezt is: `http://localhost:8000`
4. Létrehozás után másold ki az **ügyfél-azonosítót** (`….apps.googleusercontent.com`), és írd be a táblázat **Beállítások** lapján a `google_client_id` sor **Érték** oszlopába.

## 7. Telepítés az eszközökre

**Android tablet (Chrome):**
1. Nyisd meg a `https://FELHASZNALONEV.github.io/keszulok_a_sulira/` címet.
2. Jelentkezz be a **gyerek** Google-fiókjával.
3. ⋮ menü → **Alkalmazás telepítése** (vagy *Hozzáadás a kezdőképernyőhöz → Telepítés*).
4. Ezután a kezdőképernyőről indul, saját ikonnal, teljes képernyőn.

> **Family Link:** ha a gyerek fiókja felügyelt, az első bejelentkezéskor lehet, hogy nektek kell jóváhagyni a Family Link alkalmazásban, hogy beléphessen a „Készülök” alkalmazásba. Ha a bejelentkezés elakad, először a Family Linkben nézzétek meg a függő kérelmeket és a harmadik féltől származó alkalmazásokra vonatkozó beállításokat.

**PC (Chrome vagy Edge):** nyisd meg a címet, jelentkezz be a szülői fiókkal, majd a címsor jobb oldalán kattints a **Telepítés** ikonra.

**iPhone (Safari):** Megosztás → **Főképernyőhöz adás**. Az iOS a kezdőképernyőről indított alkalmazásokban néha máshogy kezeli a Google-bejelentkezési ablakot. Ha ott nem sikerül belépni, a Safariban megnyitva használható.

A bejelentkezés eszközönként egyszer kell. Utána az eszköz 180 napig bejelentkezve marad (a Beállításokban módosítható); ha közben használják, az idő mindig újraindul.

---

## Beállítások lap

| Kulcs | Alap | Jelentés |
|---|---|---|
| `kozepes_ismetles` / `kozepes_ablak` | 1 / 3 | Közepes nehézségnél: 1 ismétlés kell a számonkérés előtti 3 napban |
| `nehez_ismetles` / `nehez_ablak` | 2 / 4 | Nehéz: 2 ismétlés, külön napokon, az utolsó 4 napban |
| `konnyu_ismetles` / `konnyu_ablak` | 0 / 0 | Könnyű: elég egyszer átnézni |
| `alap_nehezseg` | közepes | A gyerek által felvett számonkérés nehézsége. A szülői módban számonkérésenként átállítható, és az ismétlésszám és az ablak külön is megadható. |
| `pont_atnezes`, `pont_ismetles` | 1, 1 | Csillag tanulásonként (egy témáért naponta egyszer jár) |
| `pont_hazi` | 1 | Csillag egy elkészült házi feladatért |
| `bonusz_dolgozat` | 5 | Bónusz, ha egy számonkérés minden témája időben kész lett |
| `elore_mutat_nap` | 2 | A számonkérés témái ennyi nappal az ismétlési időszak előtt kerülnek a „Mai teendők” közé (addig a „Később is ráér” részben vannak) |
| `potlas_max_nap` | 14 | Egy elmaradt órai átnézés ennyi napig marad a pótolnivalók között |
| `munkamenet_napok` | 180 | Ennyi nap használaton kívül után kell újra bejelentkezni |
| `ab_het_referencia` | – | A/B hetes órarendnél: egy tetszőleges dátum egy **A** hétről |

## Hasznos tudnivalók

- **Eszköz kiléptetése** (pl. elveszett a tablet): töröld a sorát a **Munkamenetek** lapon. Legfeljebb 10 percen belül érvényét veszti.
- **Kézi javítás:** a táblázat bármelyik lapját szerkesztheted. Az app a következő megnyitáskor vagy frissítéskor (szülői módban: ↻ Frissítés) látja a változást.
- **Csillagok:** az egyenleget a program a Napló, a számonkérések és a Kérések lapból számolja ki, külön tárolt egyenleg nincs. Ha egy pipát törölsz a Naplóból, a csillag is eltűnik.

## Hibaelhárítás

| Jelenség | Megoldás |
|---|---|
| „Ez a Google-fiók (…) nincs felvéve” | Írd be pontosan ezt a címet a Felhasználók lapra. |
| „nincs kitöltve a google_client_id” | 6. lépés, utolsó pont. |
| Nem jelenik meg a Google-gomb, vagy „origin_mismatch” hiba | Az OAuth-kliensnél a JavaScript-forrás pontosan `https://FELHASZNALONEV.github.io` legyen (útvonal nélkül). |
| „Az alkalmazás még nincs beállítva” | A `web/config.js` fájlban nincs kitöltve az `API_URL`. Javítsd, majd töltsd fel újra (git push). |
| A `Code.gs` módosítása nem látszik | Új verziót kell telepíteni (4. lépés, megjegyzés). |
| Az app frissítése nem látszik | Zárd be, és nyisd meg újra az appot. |
| „You do not have permission to call UrlFetchApp.fetch” | Az engedélykérésnél nem lett minden pont bejelölve. Az Apps Script szerkesztőben válaszd ki az `engedelyezes` függvényt → **Futtatás**, és az engedélykérő ablakban jelölj be **mindent** („Összes kijelölése”). |
