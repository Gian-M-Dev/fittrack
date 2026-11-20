FITTRACK 2.0 – UPDATE FÜR DEIN IPHONE
=====================================

Diese Version ersetzt die festen A/B/C-Trainingspläne durch frei zusammenstellbare Workouts.

NEU
- Über 80 Übungen nach Muskelgruppen + Suche
- Eigene Übungen dauerhaft anlegen, gruppieren und löschen
- Pro Workout Übungen individuell auswählen, Sätze/kg/Wdh./RIR erfassen
- Trainingsdatum, Start- und Endzeit inkl. Training über Mitternacht
- Pausentimer 60/90/120/180 Sekunden oder eigene Dauer, Ton wenn App aktiv
- Trainingshistorie und nachträgliches Bearbeiten
- Statistik: Trainingskonstanz, Volumen-Last, Zeit, Muskelgruppen-Sätze,
  geschätztes 1RM pro Übung, Trendcharts, RIR, Körpergewicht, Ernährung
- Nährwerte (kcal, Eiweiß, Fett, Kohlenhydrate)
- Offline und JSON-Datenexport/-Import

UPDATE DES BESTEHENDEN GITHUB-REPOSITORIES
1. Auf deinem iPhone in FitTrack V1 zuerst "Mehr" > Backup (JSON) exportieren.
2. Wenn du FitTrack_2_Update.zip verwendest: ZIP entpacken und NUR
   diese vier Dateien in das Repository hochladen:
   index.html, app.js, styles.css, sw.js.
   README.txt kann auf GitHub bleiben oder weggelassen werden.
   Alle vorhandenen Icon-Dateien und manifest.webmanifest bleiben unverändert.
3. Wenn du stattdessen FitTrack_2_Vollversion.zip verwendest:
   acht App-Dateien ersetzen (zusätzlich manifest.webmanifest und drei Icons).
4. Öffne https://github.com/Gian-M-Dev/fittrack und wähle
   "Add file" > "Upload files". Dateien einzeln oder gesammelt auswählen.
   Bestätige ggf., dass vorhandene gleichnamige Dateien ersetzt werden.
   Wichtig: NICHT die ZIP-Datei hochladen und keine Unterordner anlegen.
5. Ganz unten "Commit changes" bestätigen.
6. GitHub Pages veröffentlicht Änderungen an deinem bestehenden Repository:
   https://gian-m-dev.github.io/fittrack/
7. iPhone mit Internet: installierte FitTrack-App vollständig schließen
   und wieder über den Home-Bildschirm öffnen. Bei Bedarf "Mehr" >
   "Auf neue Version prüfen" wählen und erneut öffnen.

DATENMIGRATION (WICHTIG)
- Altdaten werden beim ersten Start von V2 aus demselben lokalen Speicher
  (Schlüssel fittrack-local-v1) in fittrack-local-v2 kopiert.
- Der alte Speicher bleibt unangetastet. Gespeicherte Trainingseinheiten,
  Körpergewicht und Ernährung werden übernommen.
- Der umfangreichste begonnene V1-Entwurf wird nach Möglichkeit übernommen.
  Frühere selbst angelegte Übungen bleiben in der Bibliothek erhalten.
- Die App auf dem iPhone-Homescreen und die Website in Safari können
  unterschiedliche lokale Datenspeicher haben. Für Migration immer den
  Home-Bildschirm-Eintrag öffnen, den du bisher zum Tracken nutzt.
- Im Zweifelsfall Daten vorher exportieren; das Backup aus V1 kann V2 importieren.

DATENSCHUTZ
- Kein API-Schlüssel, keine kostenpflichtigen Dienste, keine Datenbank,
  keine Drittanbieter-Skripte, keine Datenübertragung für dein Training.
- Lokale Einträge sind nicht verschlüsselt. Regelmäßig private JSON-Backups erstellen.
- JSON-Backups NICHT ins öffentliche GitHub-Repository hochladen.
- GitHub Pages ist öffentlich, enthält aber nur den Programmcode.

PAUSENTIMER / IPHONE
- WebAudio-Piepser nach einer aktiven Start-Aktion.
- Funktioniert wenn die App aktiv/vorne ist und Ton erlaubt ist.
- Bei gesperrtem Telefon oder im Hintergrund kann iOS die Web-App stoppen;
  ein verlässlicher Alarm ist dann nicht gewährleistet.

STATISTIKEN
- Geschätztes 1RM nach Epley für 1–10 Wdh. mit Last > 0.
- Muskelgruppen-Sätze: nur primäre Muskeln; keine indirekten Sätze.
- Volumenlast (kg × Wdh.) ist KEIN direkter Indikator für Hypertrophie.
- RIR = subjektiv geschätzte Wiederholungen in Reserve.
- Gewichtstrend basiert auf bis zu sieben Einträgen, nicht zwingend sieben Tagen.

FitTrack bleibt kostenlos und unabhängig von kostenpflichtigen APIs.
