# 🎒 Készülök

Vizuális segítség az iskolai felkészüléshez: mikor milyen órája van, mire kell készülni, mivel van elmaradva. Célja az önálló tanulás és a feladattudat fejlesztése, csillagokkal, sorozattal és jutalmakkal.

- **Gyerek mód (tablet):** mai teendők nagy pipákkal, órák és felszerelés, heti órarend színjelzéssel, közelgő dolgozatok haladás-sávval, dolgozat, házi feladat és órai téma felvétele néhány koppintással, jutalmak kérése csillagokért.
- **Szülői mód (PC):** áttekintés, heti órarend, jutalomkérések jóváhagyása, számonkérések szerkesztése (nehézség, ismétlések), házi feladatok, témák, napló.

Telepítés: **[TELEPITES.md](TELEPITES.md)**

## Felépítés

```
web/                PWA (statikus fájlok, build nincs) → GitHub Pages
  config.js         az Apps Script webalkalmazás URL-je
  js/logic.js       tiszta üzleti logika: órarend, teendők, ismétlés, sorozat, csillagok
  js/store.js       állapot és mentések (pipálás azonnal látszik, a mentés a háttérben fut)
  js/child.js       gyerek nézetek
  js/parent.js      szülői nézetek
  js/components.js  közös elemek
apps-script/        Google Apps Script: JSON API a Google táblázat fölött + táblázat-előkészítő
tests/              node:test tesztek (logika + a backend szimulált Google-környezetben)
```

Adatfolyam: az app (`fetch`, `text/plain` POST, CORS preflight nélkül) → Apps Script webalkalmazás → Google táblázat.
Bejelentkezés: Google Identity Services ID token → az Apps Script a `tokeninfo` végponttal ellenőrzi → kikeresi az e-mailt a Felhasználók lapon → saját, hosszú életű munkamenet-tokent ad (Munkamenetek lap).

## A szabályok röviden

- **Órai téma** („Órán vettük”): a tantárgy következő órájáig át kell nézni (az órarendből számolva). Ha elmarad, a *Pótolnivaló* közé kerül, és `potlas_max_nap` nap után lekerül onnan.
- **Számonkérés témája:** először át kell nézni, aztán a nehézségtől függően `N` ismétlés kell **külön napokon** a számonkérés előtti `ablak` napban (közepes: 1 / 3 nap, nehéz: 2 / 4 nap, könnyű: 0). Ha az első átnézés már az ablakba esik, az is beszámít.
- **Házi feladat:** csak kész / nincs kész. A határidő előtti utolsó tanítási naptól a mai teendők között van (addig a *Később is ráér* részben), a határidő után a *Pótolnivaló* közé kerül. A gyerek csak a mai pipáját vonhatja vissza.
- **Heti órarend:** minden óránál jelzi, hogy áll a felkészülés: ✓ kész, 🕐 ráér, 👀 készülj rá (most kell vele foglalkozni), ↺ pótolni.
- **Csillag:** tanulásonként (témánként naponta egy), házi feladatonként, plusz bónusz, ha egy számonkérés minden témája időben kész lett. Költéskor a szülő jóváhagyása vonja le.
- **Sorozat:** egymást követő napok legalább egy tanulással. Nem szakítja meg a hétvége, a szünet és az a nap, amikor nem volt mai teendő.

## Fejlesztés

```
npm test                           # logika + backend tesztek (Node 20+)
python -m http.server 8000 -d web  # helyi futtatás: http://localhost:8000
```

Helyi futtatáshoz a `http://localhost:8000` címet fel kell venni az OAuth-kliens JavaScript-forrásai közé. Új kiadásnál növeld a `web/sw.js` `VERSION` értékét.
