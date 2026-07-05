# Design: Marketplace-Föderation & -Verwaltung für goose

- **Datum:** 2026-07-04
- **Branch:** `feature/marketplace-federation`
- **Status:** Design (zur Review)

## Problem

goose installiert Plugins heute **einzeln** über `goose plugin install <git-url>`. Es gibt
**kein Marketplace-Konzept**: keine Möglichkeit, eine Katalog-Quelle zu registrieren, deren
Plugins zu durchsuchen und daraus eine Auswahl zu installieren. Gleichzeitig existieren reife
Plugin-Kataloge in fremden Ökosystemen (Claude Code: `.claude-plugin/marketplace.json`;
OpenAI Codex: Plugin-Directory). Deren Plugins bündeln Skills, Hooks und MCP-Server — also
genau die Bausteine, die goose **nativ** kennt (Skills = `SKILL.md`, Hooks = `hooks.json` mit
deckungsgleichen Event-Namen, MCP über `plugins/mcp_servers.rs`).

## Ziel (v1)

Eine **Verwaltung**, um Marketplaces hinzuzufügen und daraus **auszuwählen, welche Plugins
installiert werden** — für Claude- und Codex-Kataloge, über eine einheitliche goose-Oberfläche
(CLI **und** Desktop).

### In Scope (v1)
- Registry für Marketplace-Quellen (hinzufügen/auflisten/entfernen, User- und Projekt-Ebene).
- Katalog holen & normalisieren pro Quelle (Claude, Codex; Pass-through für Einzel-Repos).
- Plugin-Auswahl (Mehrfach) → Installation über die **bestehende** Installer-Maschinerie.
- Format-Adapter, damit der Installer Claude-/Codex-Plugin-Layouts importieren kann —
  beschränkt auf **Skills + Hooks + MCP-Server**.
- Auto-Update/Disable des vorhandenen Plugin-Systems wiederverwenden.

### Non-Goals (v1, spätere Phasen)
- Übersetzung von **Slash-Commands → Recipes** und **Subagenten → Subrecipes** (nur im Katalog
  *angezeigt*, nicht importiert).
- Publizieren/Hosten eines eigenen Marketplaces (nur konsumieren).
- Automatische Konfliktauflösung bei gleichnamigen Skills über mehrere Marketplaces hinaus vom
  bestehenden Namespacing (`plugin:skill`).

## Architektur (Ansatz A: Kern in `goose-core`, Oberflächen darüber)

```
Desktop "Marketplaces"-View ─┐
                             ├─→ goose::marketplace (neu)
CLI `goose marketplace …`  ──┘        │
                                      ├─ Registry (Config: settings.json)
                                      ├─ MarketplaceProvider (Trait)
                                      │    ├─ ClaudeProvider
                                      │    ├─ CodexProvider
                                      │    └─ PassthroughProvider (open/gemini Einzel-Repo)
                                      └─ Install-Bridge → goose::plugins::install_* (bestehend)
                                                              │
                                   plugins/formats/ (bestehend) + claude.rs + codex.rs (neu)
```

### 1. Marketplace-Registry (Config)
Neuer Abschnitt in den goose-Settings (User: `~/.config/goose/settings.json`,
Projekt: `<projekt>/.config/goose/settings.json`, lokal: `settings.local.json`):

```json
{
  "marketplaces": [
    { "name": "anthropic-official", "kind": "claude",
      "location": "https://github.com/anthropics/claude-plugins-official.git",
      "enabled": true }
  ]
}
```

Felder: `name` (eindeutig), `kind` (`claude|codex|open|gemini|custom`), `location` (Git-URL
oder HTTP-Endpoint), `enabled`. CRUD-Operationen ändern nur diesen Abschnitt.

### 2. Katalog-Provider
```rust
struct CatalogPlugin {
    name: String,
    description: Option<String>,
    source: PluginSource,      // Git-Repo (+ optionaler Subpfad) oder URL
    detected_format: Option<PluginFormat>,
    components: ComponentSummary, // skills/hooks/mcp/commands/subagents (nur Anzeige)
    marketplace: String,       // Herkunft
}

trait MarketplaceProvider {
    fn fetch_catalog(&self, src: &MarketplaceSource) -> Result<Vec<CatalogPlugin>>;
}
```
- **ClaudeProvider:** klont/liest `.claude-plugin/marketplace.json`, mappt jeden `plugins[]`-Eintrag
  (inkl. `source` als Repo-Subpfad) auf `CatalogPlugin`.
- **CodexProvider:** liest das Codex-Plugin-Directory/-Manifest analog.
- **PassthroughProvider:** eine Einzel-Repo-URL wird als 1-Element-Katalog behandelt (nutzt die
  bestehende Formaterkennung open/gemini).

Ergebnisse werden **rate-limitiert gecacht** (analog zur bestehenden Auto-Update-Drosselung).

### 3. Format-Adapter (`crates/goose/src/plugins/formats/`)
Neben `open_plugins.rs`/`gemini.rs` kommen `claude.rs` und `codex.rs` hinzu und werden in
`formats/mod.rs` registriert. Aufgabe: aus einem geklonten Plugin-Verzeichnis (ggf. Subpfad)
**Skills (`SKILL.md`)**, **Hooks (`hooks.json`)** und **MCP-Server** erkennen und in das
vorhandene Importmodell (`PluginInstall`) übersetzen. Slash-Commands/Subagenten werden erkannt,
aber als *nicht importiert* gemeldet.

### 4. Install-Bridge
`goose::plugins::install_plugin_with_options` wird erweitert, sodass es zusätzlich zur reinen
Git-URL eine **aufgelöste `PluginSource`** (Repo + optionaler Subpfad + Format-Hint) annimmt.
Die Auswahl-Aktion ruft den Installer je gewähltem `CatalogPlugin`; Ergebnis (`PluginInstall`)
wird pro Plugin zurückgemeldet (importierte Skills/Hooks/MCP). Auto-Update & `disabledPlugins`
bleiben unverändert nutzbar.

### 5. Oberflächen
- **CLI:** `goose marketplace add <location> --kind <k> [--name <n>]`, `... list`,
  `... remove <name>`, `... browse <name>` (listet `CatalogPlugin`s), Installation über den
  bestehenden `goose plugin install` bzw. eine `--from-marketplace`-Auswahl.
- **Desktop:** neue View „Marketplaces": Quelle hinzufügen · Katalog browsen · Checkbox-Auswahl ·
  installieren · updaten · deaktivieren. Ruft dieselbe `goose-core`-API wie die CLI.

### 6. Trust/Sicherheit
Plugins können Instruktionen laden und Hooks lokale Kommandos ausführen. Die Verwaltung zeigt
**Quelle und Komponenten vor der Aktivierung** an und übernimmt die bestehende Doku-Warnung.
Private/Corporate-Marketplaces (`kind: custom`) sind dadurch first-class.

## Komponenten-Grenzen
- `marketplace::registry` — nur Config-CRUD, keine Netzwerklogik.
- `marketplace::provider` — nur Katalog holen/normalisieren, keine Installation.
- `plugins::formats::{claude,codex}` — nur Verzeichnis→Komponenten-Mapping, kein Netzwerk.
- `marketplace::install` — orchestriert Auswahl → bestehender Installer.
Jede Einheit ist isoliert testbar; UI/CLI sind dünne Adapter über der `goose-core`-API.

## Fehlerbehandlung
- Nicht erreichbare/ungültige Marketplace-Quelle → Fehler pro Quelle, andere Quellen laufen weiter.
- Unbekanntes/teilweise unterstütztes Plugin-Format → Plugin wird gelistet, Installation meldet
  klar, welche Komponenten importiert und welche übersprungen wurden.
- Fehlgeschlagene Einzel-Installation in einer Mehrfachauswahl → übrige Auswahl läuft weiter,
  Sammelbericht am Ende.

## Teststrategie
- **Unit (Rust):** Provider-Parsing (Claude-`marketplace.json`, Codex-Manifest) mit Fixtures;
  Format-Adapter mit Beispiel-Plugin-Verzeichnissen (Skills/Hooks/MCP); Registry-CRUD.
- **Integration:** End-to-End „Quelle registrieren → browsen → auswählen → installieren →
  Komponenten importiert" gegen lokale Fixture-Repos (keine externen Netzabhängigkeiten im Test).
- **UI:** Desktop-„Marketplaces"-Flow (hinzufügen/browsen/auswählen/installieren) als
  automatisierter Frontend-Test.

## Offene Punkte / spätere Phasen
1. Slash-Commands → Recipes, Subagenten → Subrecipes (Phase 2/3).
2. Namenskonflikte identischer Plugins/Skills über mehrere Marketplaces (Priorisierung/Pinning).
3. Signatur-/Integritätsprüfung von Marketplace-Quellen (über die Trust-Anzeige hinaus).
