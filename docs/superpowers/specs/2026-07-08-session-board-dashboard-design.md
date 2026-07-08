# Session-Board (Kanban-Dashboard) — Design

**Datum:** 2026-07-08
**Status:** Freigegeben (Brainstorming abgeschlossen)
**Feature-Branch:** `feature/session-board-dashboard` (ab `corporate`)

## Ziel

proose bekommt ein Dashboard, das — inspiriert vom *Claude Code Agent Monitor* —
eine **Übersicht der Sessions als Kanban-Board** zeigt. Kernnutzen: mit **einem
Klick von einer Karte direkt zurück in die Session springen** und weiterarbeiten.

Anders als der Agent Monitor (eine eigenständige Web-App, die Claude Code von
außen über Hooks beobachtet) wird dies eine **native Seite innerhalb der
proose-Desktop-App** — proose besitzt den „Resume"-Baustein bereits.

## Nicht-Ziele (YAGNI für v1)

- Kein Analytics-/Health-/Cost-Panel (das war Extra-Scope des Agent Monitors).
- Scheduled Tasks und Sub-Agents erscheinen (noch) **nicht** als eigene Karten.
- Keine eigenständige Web-App, kein zweiter Server, keine separate DB.

## Architektur & Platzierung

- Neue Route **`/board`** in `ui/desktop/src/App.tsx` (`HashRouter`), registriert
  neben den bestehenden Routen (Hub, `sessions`, `schedules`, …).
- Sidebar-Eintrag in `ui/desktop/src/components/GooseSidebar/` (Label: „Board").
- Reine React/TypeScript-Seite; nutzt bestehende ACP-/Event-Infrastruktur.

## Spalten & Einordnung

Reihenfolge von links: **Waiting → Working → Done**.
Jede Session landet in **genau einer** Spalte. Klassifizierungs-Priorität:

1. **Done** — `done == true` **und** letzte Interaktion (`last_message_at`) ≤ 48 h.
   Ist eine als Done markierte Session länger als 48 h inaktiv, fällt sie
   **komplett vom Board** (selbstreinigend). Der `done`-Zustand bleibt in der DB
   erhalten; nur die Anzeige entfällt.
2. **Working** — die Session streamt gerade (aktiver Agent-Lauf).
3. **Waiting** — **alles Übrige, das nicht Done ist**: grüner Punkt/ungelesen,
   idle, gelesen-aber-offen, sowie Error-Sessions.

Sortierung innerhalb jeder Spalte: neueste Aktivität zuerst (`last_message_at` desc).

### Bezug zu vorhandenen Indikatoren

`ui/desktop/src/components/SessionIndicators.tsx` liefert bereits:
- `isStreaming` → blauer Spinner  ⇒ **Working**
- `hasUnread` → grüner Punkt („Has new activity")  ⇒ Teil von **Waiting**
- `hasError` → rotes Symbol  ⇒ Teil von **Waiting**

## Datenmodell / Backend

### `done`-Flag

- Neues, dauerhaftes Feld **`done`** pro Session.
- **Speicherung:** kleine SQLite-Migration in
  `crates/goose/src/session/session_manager.rs` (`run_migrations`), Spalte
  `done INTEGER NOT NULL DEFAULT 0`. Sauber filter-/sortierbar.
  (Alternative wäre das vorhandene `extension_data`-JSON ohne Migration — hier
  bewusst verworfen zugunsten einer echten Spalte.)
- `Session`-Struct und `SqlxFromRow`-Mapping um `done: bool` erweitern.

### API (ACP-Layer, wie von der UI genutzt)

- `SessionListItem` (in `crates/goose/src/acp/…` bzw. `ui/desktop/src/acp/sessions.ts`)
  um `done: boolean` erweitern, damit die Liste den Zustand mitliefert.
- Neue ACP-Methode **`set_session_done`** (analog zu `acpRenameSession`) zum
  Setzen/Zurücknehmen des Flags; Frontend-Wrapper `acpSetSessionDone(id, done)`.
  (Alternative: REST-Route `PUT /sessions/{id}/done` in
  `crates/goose-server/src/routes/session.rs` — hier zugunsten ACP verworfen,
  weil die Session-UI durchgängig ACP nutzt.)

### Live-Status (Working / Unread)

- Das Board abonniert den vorhandenen **`session_event_bus`**
  (`crates/goose-server/src/routes/session_events.rs` +
  `session_event_bus.rs`) bzw. den App-internen Active-Session-/Streaming-Zustand
  (`ChatSessionsContainer`/`activeSessions`), damit Karten **live** zwischen
  Waiting ↔ Working wechseln und „neue Aktivität" (unread) sofort erscheint.
- „Working" gilt praktisch für offene, streamende Sessions sowie laufende
  Scheduled-Runs (deren Sessions über den Daemon streamen).

## Karte & Interaktion

- **Karteninhalt:** Session-Name, Arbeitsverzeichnis (gekürzt), relative Zeit
  („vor 3 Std"), Nachrichtenanzahl, Status-Indikator, optional Snippet aus
  `last_message_snippet`.
- **Klick auf Karte ⇒ zurück in die Session:**
  `navigate('/pair?resumeSessionId=<id>')` (vorhandener Resume-Mechanismus).
  Das ist der zentrale „mit einem Klick weitermachen"-Flow.
- **Drag & Drop:** Karte von **Waiting → Done** setzt `done=true`;
  von **Done → Waiting** setzt `done=false`. **Working** ist **kein** Drop-Ziel
  (automatischer Zustand).
- **Shortcut-Button** auf der Karte: „Done" bzw. „Wieder öffnen".

## Fehler-/Randfälle

- Session als Done markiert **und** gleichzeitig streamend: Done gewinnt
  (bewusste Nutzeraktion) — landet in Done, sofern ≤ 48 h.
- Done-Session > 48 h inaktiv: nicht sichtbar, Flag bleibt; wird sie erneut
  aktiv (neue Nachricht), erscheint sie wieder in Done (≤ 48 h) — außer der
  Nutzer nimmt Done zurück.
- Leere Spalten zeigen einen Platzhalter.

## Tests (Projektregeln)

- **Unit-Tests** für die Spalten-Klassifizierung inkl. 48-h-Grenze
  (Done → Waiting → Working Priorität).
- **Backend-Test**: `set_session_done` persistiert korrekt; Session-Liste
  enthält `done`.
- **Playwright-E2E** (`ui/desktop` bzw. web-e2e): Karte→Resume-Navigation,
  Drag nach Done, Zurückziehen, 48-h-Ausblenden.

## Fork-Workflow

Entwicklung auf `feature/session-board-dashboard` (ab `corporate`), Integration
per Merge nach `corporate`. Niemals auf `main`, niemals nach `upstream` pushen.
