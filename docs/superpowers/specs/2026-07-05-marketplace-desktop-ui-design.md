# Design: Desktop-„Marketplaces"-UI (Folge-Plan 2)

- **Datum:** 2026-07-05
- **Branch:** `feature/marketplace-desktop-ui` (basiert auf `feature/marketplace-federation` / Plan 1)
- **Status:** Design (zur Review)

## Problem

Der Marketplace-Kern (Registry, Katalog-Provider Claude/Codex, Fetch, Install-Bridge) existiert aus Plan 1, ist aber **nur über die CLI** bedienbar. Die goose-Desktop-App (electron/React) bietet weder eine Ansicht noch einen Backend-Seam dafür. Ziel: eine Desktop-UI zum **Verwalten von Marketplaces, Browsen der Kataloge, Installieren ausgewählter Plugins** sowie zum **Verwalten installierter Plugins** (aktivieren/deaktivieren/updaten).

## Architektur-Entscheidung: ACP (nicht REST)

Das Desktop-Frontend konsumiert Config/Extensions **nicht** über REST (`crates/goose-server/.../config_management.rs` → `openapi.json`); `ui/desktop/src/api` existiert nicht — der REST-Weg ist für diesen Bereich toter Code. Das lebende Muster ist **ACP-JSON-RPC**. Wir folgen exakt der Extensions-Triade:

`custom_requests.rs` (Request/Response-Typen) → ACP-Handler (`crates/goose/src/acp/server/`) → `custom_dispatch.rs` → `just generate-acp-types` → `ui/sdk/src/generated` + `GooseExtClient` → `ui/desktop/src/acp/*.ts` → React-Hook/Context → View.

## Scope (v1, „voll")

**In Scope:** Quellen add/list/remove · Katalog browsen (installierbar vs. `Unsupported`) · Mehrfach-Installation mit Trust-Hinweis · installierte Plugins list/enable/disable/update.
**Non-Goals:** Marketplace-Hosting/Publishing; Import von Slash-Commands/Subagenten (Plan-1-Non-Goal bleibt); Windows-spezifische Sonderpfade; das Desktop-„agent extensions"-Modell (Plugins sind global installiert, nicht per Session).

## Komponenten

### 1. Rust-Kern — additive Funktionen in `crates/goose/src/plugins/`
- `list_installed_plugins() -> Vec<InstalledPlugin>` mit
  `InstalledPlugin { name: String, version: String, source: String, enabled: bool, auto_update: bool, updatable: bool }`.
  Quelle: Plugin-Verzeichnisse aus `plugin_install_dir()` + `project_plugin_install_dir` (analog `discovery`), Status aus der `config.yaml`-`plugins`-Map (`filter_by_config`), Metadaten aus `.goose-plugin-install.json` (`source`, `auto_update`, `source_type=="git"` ⇒ `updatable`).
- `set_plugin_enabled(name: &str, enabled: bool) -> Result<()>`: schreibt die **schreibbare** `config.yaml`-`plugins`-Map (`Config::set_param`/`update_param`), **nicht** `settings.json` (read-only). Ergänzt die vorhandene `filter_by_config`-Logik in `discovery.rs`.
- Wiederverwenden ohne Änderung: `update_plugin`, `marketplace::registry::{list,add,remove}_marketplace`, `marketplace::fetch::fetch_catalog`, `marketplace::install::install_catalog_plugin`.

### 2. ACP-Methoden
Neue Request/Response-Typen in `crates/goose-sdk-types/src/custom_requests.rs` (Muster: `#[derive(… JsonRpcRequest)] #[request(method="…", response=…)]`), Handler in neuem `crates/goose/src/acp/server/marketplace.rs`, Registrierung in `custom_dispatch.rs`:

| Methode | Kern-Aufruf | Anmerkung |
|---|---|---|
| `_goose/unstable/marketplace/list` | `registry::list_marketplaces` | schnell |
| `_goose/unstable/marketplace/add` | `registry::add_marketplace` | schnell |
| `_goose/unstable/marketplace/remove` | `registry::remove_marketplace` | schnell |
| `_goose/unstable/marketplace/browse` | `fetch::fetch_catalog` | **Netzwerk/Git (langsam)** |
| `_goose/unstable/marketplace/install` | einmal klonen + `install::install_catalog_plugin` je Auswahl | **Netzwerk/Git**, liefert je-Plugin-Ergebnis + importierte Komponenten (Skills/Hooks/MCP) für den Trust-Hinweis |
| `_goose/unstable/plugins/list` | `list_installed_plugins` | schnell |
| `_goose/unstable/plugins/set-enabled` | `set_plugin_enabled` | schnell |
| `_goose/unstable/plugins/update` | `update_plugin` | **Netzwerk/Git** |

`install` bekommt Marketplace-Name + Plugin-Namen; der Handler klont die Marketplace-Quelle **einmal** und installiert daraus (wie CLI-`handle_install`).

### 3. Codegen
`just generate-acp-schema` + `just generate-acp-types` → generierte Dateien in `crates/goose/acp-{schema,meta}.json` und `ui/sdk/src/generated/*` + `GooseExtClient`-Methoden. Generierte Dateien **mitcommitten** (CI `check-acp-schema` erzwingt Aktualität).

### 4. TS-Layer
- `ui/desktop/src/acp/marketplace.ts`: dünne Wrapper (`getAcpClient()` → `client.goose.marketplace…_unstable(...)`), Typ-Mapping SDK↔Desktop analog `acp/extensions.ts`.
- Hook `useMarketplace` (eigener Context oder Erweiterung, analog `useConfig`): State `sources`, `catalog`, `installedPlugins`; Aktionen `addSource/removeSource/browse/install/refreshInstalled/setPluginEnabled/updatePlugin` mit Lade-/Fehler-Flags.

### 5. UI — top-level „Marketplaces"-View
Registrierung wie `ExtensionsView`: `View`-Union in `utils/navigationUtils.ts`, Route in `App.tsx`. Komponente `components/marketplaces/MarketplacesView.tsx` in `MainPanelLayout`, mit drei Sektionen:
- **Sources**: Add-Formular (Name, Git-URL/Location, Kind = Claude|Codex) + Liste + Remove.
- **Browse**: Quelle wählen → `browse` → Katalogliste (installierbar vs. `Unsupported` markiert, Beschreibung) → Mehrfachauswahl (Checkboxen) → **Install** mit Fortschritt; **Trust-Dialog** vor/aus dem Install zeigt Quelle + Hooks/MCP-Präsenz (Parität zu CLI-FIX C).
- **Installed**: Liste (`list_installed_plugins`) mit Enable/Disable-Toggle (`set-enabled`) + Update-Button (`update`, nur wenn `updatable`).
- Alle Strings via `defineMessages`/i18n (CI erzwingt `i18n:check`).

## Datenfluss
UI-Aktion → `useMarketplace` → `acp/marketplace.ts` → `GooseExtClient` (ACP) → ACP-Handler → `goose::marketplace`/`goose::plugins` → `config.yaml` / Dateisystem / Git.

## Fehlerbehandlung & UX
- Langsame Ops (`browse/install/update`) mit Lade-/Fortschritts-States; Buttons währenddessen deaktiviert.
- `install` einer Mehrfachauswahl: je Plugin Erfolg/Fehler sammeln, Teilfehler klar anzeigen (nicht alles abbrechen).
- Nicht erreichbare/ungültige Quelle → Fehlermeldung pro Quelle, andere Sektionen bleiben nutzbar.
- Trust: vor Aktivierung Quelle + Komponenten (Skills/Hooks/MCP) sichtbar machen; Hooks führen lokale Kommandos aus (Warnung).
- ACP-Fehler → verständliche Toasts; keine rohen JSON-RPC-Fehler.

## Teststrategie
- **Rust-Unit:** `list_installed_plugins` (Fixture-Plugin-Dirs + config.yaml-Status) und `set_plugin_enabled` (Roundtrip in isolierter `Config`).
- **Vitest (Komponenten, ACP-Client gemockt):** Sources-Form (add/validate/remove), Browse-Auswahl+Install (inkl. Unsupported disabled, Trust-Dialog), Installed-Toggle/Update.
- **Playwright-E2E** (`ui/desktop/tests/e2e`): Flow add→browse→install gegen eine **lokale Git-Fixture-Marketplace**; benötigt laufendes `goosed` — falls im CI-Rahmen nicht stabil, als **manuelles Runbook** dokumentieren.
- Lint/Typecheck: `pnpm lint:check` (tsc + eslint `--max-warnings 0` + `i18n:check`) grün.

## Offene Punkte / spätere Phasen (v1 deferred)
Für Plan 2b bewusst **aus v1 ausgeklammert** (YAGNI) und mit „was noch zu tun ist"
im Backlog festgehalten: **`docs/marketplace-ui-future-work.md`**.
1. Auto-Update-Umschaltung pro Plugin in der UI (Kern hat `auto_update`-Flag; v1 zeigt es nur an).
2. Fortschritts-Streaming für lange Git-Ops (v1: einfacher Spinner/Busy-State statt echtem Progress).
3. Konflikt-UI bei gleichnamigen Plugins über mehrere Marketplaces (Plan-1-Non-Goal, weiterhin offen).

## Plan-2b-Entscheidungen (2026-07-05, bestätigt)
- **Scope = voll wie oben speziert**; die 3 offenen Punkte werden deferred (siehe Backlog).
- **Playwright-E2E ist Ziel** (Projektregel für UI-Features); manuelles Runbook nur
  dokumentierter Fallback bei CI-Instabilität von Playwright + `goosed`.
