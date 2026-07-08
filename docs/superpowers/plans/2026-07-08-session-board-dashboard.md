# Session-Board (Kanban-Dashboard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** proose bekommt eine native `/board`-Seite, die Sessions als Kanban-Board (Waiting/Working/Done) zeigt und per Klick auf eine Karte direkt in die Session zurückspringt.

**Architecture:** Neue React-Seite in der Electron-Desktop-App. Ein neues persistiertes `done`-Flag auf Sessions (SQLite) wird über den bestehenden ACP-Layer geschrieben (`set_session_done`) und in der Session-Liste als `_meta.done` mitgeliefert. Live-Status (Working/Waiting) wird aus den vorhandenen `window`-`CustomEvent`s (`SESSION_STATUS_UPDATE`) abgeleitet — genau wie die Sidebar es heute schon tut. „Zurück in die Session" nutzt den vorhandenen `resumeSessionId`-Mechanismus.

**Tech Stack:** Rust (`sqlx`/SQLite, axum, ACP JSON-RPC via `#[custom_method]` proc-macro), generierter TS-SDK (`@aaif/goose-sdk`, `@hey-api/openapi-ts`), React 19 + TypeScript, Tailwind, vitest, Playwright. Native HTML5 Drag & Drop (keine neue Abhängigkeit).

## Global Constraints

- Entwicklung auf Branch `feature/session-board-dashboard` (ab `corporate`). Niemals auf `main`, niemals nach `upstream` pushen.
- Nur normale Sessions in v1 (Typen `user`, `scheduled` — wie `acpListSessions` bereits filtert). Keine Scheduled/Sub-Agent-eigenen Karten, kein Analytics/Health/Cost-Panel.
- Spaltenreihenfolge links→rechts: **Waiting → Working → Done**.
- Klassifizierungs-Priorität pro Session: **Done** (nur wenn letzte Aktivität ≤ 48 h, sonst ausgeblendet) → **Working** (streamt) → **Waiting** (alles andere).
- 48-h-Grenze = `48 * 60 * 60 * 1000` ms, gemessen an der letzten Aktivität (`lastMessageAt ?? updatedAt`).
- Keine neue npm-Abhängigkeit für Drag & Drop (native HTML5 DnD, Muster aus `MessageQueue.tsx`).
- `done` als echte SQLite-Spalte `done INTEGER NOT NULL DEFAULT 0` (nicht in `extension_data`).

---

### Task 1: `done` persistent in der Session-Storage (Rust)

**Files:**
- Modify: `crates/goose/src/session/session_manager.rs`

**Interfaces:**
- Consumes: bestehendes `SessionManager::update(id) -> SessionUpdateBuilder` und `SessionManager::get_session(id, with_conversation) -> Session`.
- Produces:
  - `Session.done: bool` (neues Feld, `#[serde(default)]`).
  - `SessionUpdateBuilder::done(bool) -> Self` (neuer Setter).
  - Verhalten: `sm.update(id).done(true).apply().await` persistiert; `get_session` und `list_sessions_paged` liefern `done`.

- [ ] **Step 1: Failing test schreiben**

Am Ende des `#[cfg(test)] mod tests` in `session_manager.rs` (Muster: `test_last_message_at_is_derived_from_messages`, ~Zeile 2374):

```rust
    #[tokio::test]
    async fn test_done_flag_round_trips() {
        let temp_dir = TempDir::new().unwrap();
        let sm = SessionManager::new(temp_dir.path().to_path_buf());
        let session = sm
            .create_session(
                PathBuf::from("/tmp/test"),
                "Done flag".to_string(),
                SessionType::User,
                GooseMode::default(),
            )
            .await
            .unwrap();

        // Default is false
        assert!(!session.done);
        let fresh = sm.get_session(&session.id, false).await.unwrap();
        assert!(!fresh.done);

        // Set true, reload
        sm.update(&session.id).done(true).apply().await.unwrap();
        let loaded = sm.get_session(&session.id, false).await.unwrap();
        assert!(loaded.done);

        // Appears in listing
        let page = sm
            .list_sessions_paged(SessionListPageQuery {
                filters: SessionListFilters::default(),
                cursor: None,
                page_size: 50,
                include_last_message_snippet: false,
            })
            .await
            .unwrap();
        let listed = page.sessions.iter().find(|s| s.id == session.id).unwrap();
        assert!(listed.done);

        // Unset again
        sm.update(&session.id).done(false).apply().await.unwrap();
        assert!(!sm.get_session(&session.id, false).await.unwrap().done);
    }
```

> Falls `SessionListFilters` kein `Default` ableitet: stattdessen `SessionListFilters { types: None, working_dir: None, keyword: None, only_sessions_with_messages: false }` inline schreiben.

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `cd crates/goose && cargo test --lib session::session_manager::tests::test_done_flag_round_trips`
Expected: FAIL, Kompilierfehler „no field `done`" / „no method `done`".

- [ ] **Step 3: `Session`-Struct + Default + FromRow erweitern**

In der `Session`-Struct (endet ~Zeile 95, nach `last_message_snippet`):
```rust
    #[serde(default)]
    pub done: bool,
```
Im `impl Default for Session` (~Zeile 632, neben `user_set_name: false,`):
```rust
            done: false,
```
Im `impl sqlx::FromRow ... for Session`-Struct-Literal (~Zeile 745, neben `last_message_snippet: None,`):
```rust
            done: row.try_get("done").unwrap_or(false),
```

- [ ] **Step 4: Schema-Version, `create_schema` und Migration**

Konstante (~Zeile 26): `CURRENT_SCHEMA_VERSION` von `14` auf `15` erhöhen.

In `create_schema` in der `CREATE TABLE IF NOT EXISTS sessions (...)`-Spaltenliste (~Zeile 866, nach `project_id TEXT`):
```rust
                done INTEGER NOT NULL DEFAULT 0,
```
> Auf korrektes SQL-Komma achten (die neue Spalte davor mit Komma trennen).

In `apply_migration`, neuen Arm **nach** Arm `14` (vor `_ =>`, ~Zeile 1328) einfügen (Muster Arm 13):
```rust
            15 => {
                let has_done = sqlx::query_scalar::<_, i32>(
                    "SELECT COUNT(*) FROM pragma_table_info('sessions') WHERE name = 'done'",
                )
                .fetch_one(&mut **tx)
                .await?
                    > 0;
                if !has_done {
                    sqlx::query("ALTER TABLE sessions ADD COLUMN done INTEGER NOT NULL DEFAULT 0")
                        .execute(&mut **tx)
                        .await?;
                }
            }
```

- [ ] **Step 5: `SessionUpdateBuilder` erweitern**

Struct-Feld (~Zeile 126, neben `user_set_name: Option<bool>`):
```rust
    done: Option<bool>,
```
In `SessionUpdateBuilder::new` (~Zeile 157, neben `user_set_name: None,`):
```rust
            done: None,
```
Setter (Muster `archived_at`, ~Zeile 265):
```rust
    pub fn done(mut self, done: bool) -> Self {
        self.done = Some(done);
        self
    }
```
In `apply_update`: bei den `add_update!`-Aufrufen (neben `add_update!(builder.user_set_name, "user_set_name");`):
```rust
        add_update!(builder.done, "done");
```
und bei den Binds (neben `if let Some(user_set_name) = builder.user_set_name { q = q.bind(user_set_name); }`):
```rust
        if let Some(done) = builder.done {
            q = q.bind(done);
        }
```
> Reihenfolge der `add_update!`- und `bind`-Blöcke muss identisch sein (die Binds werden positional gesetzt). `done` an gleicher relativer Position in beiden Listen einfügen.

- [ ] **Step 6: `done` in beide SELECTs aufnehmen**

In `get_session` (Spaltenliste ~Zeile 1386-1394, nach `project_id`): `done` ergänzen.
In `list_sessions_matching` (`SELECT s.id, ... s.project_id` ~Zeile 1733-1741): `s.done` ergänzen.
> Beide nutzen `query_as::<_, Session>`, daher muss `done` im SELECT stehen, damit `FromRow` es lesen kann.

- [ ] **Step 7: Test ausführen — muss bestehen**

Run: `cd crates/goose && cargo test --lib session::session_manager::tests::test_done_flag_round_trips`
Expected: PASS.

- [ ] **Step 8: Regressionslauf der Session-Storage-Tests**

Run: `cd crates/goose && cargo test --lib session::session_manager`
Expected: PASS (alle Migrations-/Roundtrip-Tests grün).

- [ ] **Step 9: Commit**

```bash
git add crates/goose/src/session/session_manager.rs
git commit -m "feat(session): persist done flag on sessions (schema v15)"
```

---

### Task 2: `done` über ACP lesen & schreiben (Rust + SDK-Regenerierung)

**Files:**
- Modify: `crates/goose-sdk-types/src/custom_requests.rs`
- Modify: `crates/goose/src/acp/server/manage_sessions.rs`
- Modify: `crates/goose/src/acp/server/custom_dispatch.rs`
- Modify: `crates/goose/src/acp/response_builder.rs`
- Regenerate: `ui/sdk` (generierter Client)

**Interfaces:**
- Consumes: `SessionManager::update(id).done(bool)` (Task 1).
- Produces:
  - ACP-Methode `_goose/unstable/session/done/set` mit Payload `{ sessionId, done }`, Antwort `EmptyResponse`.
  - `done: bool` im `_meta` jeder Session in `list_sessions`/`get_session_info`.
  - Nach SDK-Regenerierung: generierte Typen/Client-Methode für die neue Request.

- [ ] **Step 1: Request-Typ deklarieren**

In `crates/goose-sdk-types/src/custom_requests.rs` neben `RenameSessionRequest` (~Zeile 847):
```rust
/// Set the `done` flag on a session.
#[derive(Debug, Default, Clone, Serialize, Deserialize, JsonSchema, JsonRpcRequest)]
#[request(method = "_goose/unstable/session/done/set", response = EmptyResponse)]
#[serde(rename_all = "camelCase")]
pub struct SetSessionDoneRequest {
    pub session_id: String,
    pub done: bool,
}
```

- [ ] **Step 2: Handler implementieren**

In `crates/goose/src/acp/server/manage_sessions.rs` neben `on_rename_session` (~Zeile 247):
```rust
    pub(super) async fn on_set_session_done(
        &self,
        req: SetSessionDoneRequest,
    ) -> Result<EmptyResponse, agent_client_protocol::Error> {
        self.session_manager
            .update(&req.session_id)
            .done(req.done)
            .apply()
            .await
            .internal_err()?;
        Ok(EmptyResponse {})
    }
```
> `SetSessionDoneRequest`, `EmptyResponse`, `internal_err()` kommen via `use super::*;` (Zeile 1) herein. Falls `internal_err()` hier nicht sichtbar ist, Muster von `on_rename_session` verwenden: `.map_err(|e| agent_client_protocol::Error::internal_error().data(e.to_string()))?`.

- [ ] **Step 3: Dispatch registrieren**

In `crates/goose/src/acp/server/custom_dispatch.rs` neben `dispatch_rename_session` (~Zeile 738):
```rust
    #[custom_method(SetSessionDoneRequest)]
    async fn dispatch_set_session_done(
        &self,
        req: SetSessionDoneRequest,
    ) -> Result<EmptyResponse, agent_client_protocol::Error> {
        self.on_set_session_done(req).await
    }
```

- [ ] **Step 4: `done` im Session-`_meta` ausgeben**

In `crates/goose/src/acp/response_builder.rs` in der `SessionMeta`-Struct (~Zeile 26-66) ein Feld neben `user_set_name: bool` ergänzen:
```rust
    done: bool,
```
und im `impl From<&Session> for SessionMeta` (neben `user_set_name: session.user_set_name,`):
```rust
            done: session.done,
```
> `SessionMeta` nutzt `#[serde(rename_all = "camelCase")]` → erscheint als `"done"` im `_meta`. Wirkt automatisch in `build_session_info` (Liste **und** `get_session_info`).

- [ ] **Step 5: Backend kompilieren**

Run: `cd crates/goose && cargo build`
Expected: erfolgreich (auch `goose-sdk-types` baut mit).

- [ ] **Step 6: SDK regenerieren & bauen**

Run: `cd ui/desktop && pnpm run build-goose-sdk`
(entspricht `pnpm --filter @aaif/goose-sdk run build` = `generate` (`tsx generate-schema.ts`) + `tsc`.)
Expected: erfolgreich, keine TS-Fehler.

- [ ] **Step 7: Generierte Methode/Typen verifizieren**

Run: `grep -rn -i "SetSessionDone\|session/done/set\|sessionSetDone" ui/sdk/src/generated ui/sdk/src/goose-client.ts`
Expected: Treffer — der generierte Request-Typ und die Client-Methode (Namenskonvention `sessionSetDone_unstable` o. ä.) sind vorhanden.
> Den **exakten** generierten Methodennamen notieren; er wird in Task 3 verwendet. Falls die Generierung die Methode NICHT erzeugt (Custom-JSON-RPC evtl. nicht im OpenAPI-Schema erfasst): `generate-schema.ts` prüfen, wie andere `session/*`-Custom-Methoden aufgenommen werden, und analog ergänzen; erneut generieren.

- [ ] **Step 8: Commit**

```bash
git add crates/goose-sdk-types/src/custom_requests.rs \
        crates/goose/src/acp/server/manage_sessions.rs \
        crates/goose/src/acp/server/custom_dispatch.rs \
        crates/goose/src/acp/response_builder.rs \
        ui/sdk
git commit -m "feat(acp): set_session_done method + done in session meta"
```

---

### Task 3: Frontend-ACP-Wiring (`done` lesen/schreiben + Event)

**Files:**
- Modify: `ui/desktop/src/acp/sessions.ts`
- Modify: `ui/desktop/src/constants/events.ts`

**Interfaces:**
- Consumes: generierte SDK-Methode aus Task 2 (Name aus Task 2/Step 7).
- Produces:
  - `SessionListItem.done: boolean` (Default `false`).
  - `acpSetSessionDone(sessionId: string, done: boolean): Promise<void>`.
  - `AppEvents.SESSION_DONE_UPDATE = 'session-done-update'`.

- [ ] **Step 1: `done` in Typ + Mapping ergänzen**

In `ui/desktop/src/acp/sessions.ts`:
- `SessionListItem` (~Zeile 29-43): `done: boolean;` ergänzen.
- `GooseSessionInfoMeta` (~Zeile 15-27): `done?: boolean;` ergänzen.
- In `sessionInfoToListItem` (~Zeile 115-132) beim Zusammenbauen des Objekts:
```ts
    done: meta?.done ?? false,
```
> `meta` ist das aus `SessionInfo._meta` gelesene Objekt (wie `userSetName` dort schon gelesen wird — genau spiegeln).

- [ ] **Step 2: Setter-Funktion ergänzen**

Neben `acpRenameSession` (~Zeile 266):
```ts
export async function acpSetSessionDone(sessionId: string, done: boolean): Promise<void> {
  const client = await getAcpClient();
  await client.goose.sessionSetDone_unstable({ sessionId, done });
}
```
> `sessionSetDone_unstable` durch den in Task 2/Step 7 verifizierten exakten Methodennamen ersetzen.

- [ ] **Step 3: Event-Konstante ergänzen**

In `ui/desktop/src/constants/events.ts` im `AppEvents`-Enum neben `SESSION_STATUS_UPDATE`:
```ts
  SESSION_DONE_UPDATE = 'session-done-update',
```

- [ ] **Step 4: Typecheck**

Run: `cd ui/desktop && pnpm exec tsc --noEmit`
Expected: keine Fehler in `acp/sessions.ts`/`constants/events.ts` (die neue SDK-Methode ist typisiert).

- [ ] **Step 5: Commit**

```bash
git add ui/desktop/src/acp/sessions.ts ui/desktop/src/constants/events.ts
git commit -m "feat(ui): acpSetSessionDone + done on SessionListItem + done event"
```

---

### Task 4: Spalten-Klassifizierung als reine Funktion (+ vitest)

**Files:**
- Create: `ui/desktop/src/components/board/boardClassification.ts`
- Test: `ui/desktop/src/components/board/boardClassification.test.ts`

**Interfaces:**
- Produces:
  - `type BoardColumn = 'waiting' | 'working' | 'done';`
  - `const DONE_TTL_MS = 48 * 60 * 60 * 1000;`
  - `function classifySession(input, nowMs): BoardColumn | null` — `null` = ausgeblendet (Done & älter als 48 h).
  - Input-Shape:
    ```ts
    interface BoardClassifyInput {
      done: boolean;
      lastActivityMs: number;
      streamState?: 'idle' | 'loading' | 'streaming' | 'error';
    }
    ```

- [ ] **Step 1: Failing test schreiben**

`ui/desktop/src/components/board/boardClassification.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { classifySession, DONE_TTL_MS } from './boardClassification';

const NOW = 1_000_000_000_000;

describe('classifySession', () => {
  it('streaming session (not done) => working', () => {
    expect(classifySession({ done: false, lastActivityMs: NOW, streamState: 'streaming' }, NOW)).toBe('working');
  });

  it('non-done, idle => waiting', () => {
    expect(classifySession({ done: false, lastActivityMs: NOW, streamState: 'idle' }, NOW)).toBe('waiting');
  });

  it('non-done, no status => waiting', () => {
    expect(classifySession({ done: false, lastActivityMs: NOW }, NOW)).toBe('waiting');
  });

  it('error session (not done) => waiting', () => {
    expect(classifySession({ done: false, lastActivityMs: NOW, streamState: 'error' }, NOW)).toBe('waiting');
  });

  it('done within 48h => done', () => {
    expect(classifySession({ done: true, lastActivityMs: NOW - DONE_TTL_MS + 1000 }, NOW)).toBe('done');
  });

  it('done older than 48h => hidden (null)', () => {
    expect(classifySession({ done: true, lastActivityMs: NOW - DONE_TTL_MS - 1000 }, NOW)).toBeNull();
  });

  it('done wins over streaming', () => {
    expect(classifySession({ done: true, lastActivityMs: NOW, streamState: 'streaming' }, NOW)).toBe('done');
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `cd ui/desktop && pnpm exec vitest run src/components/board/boardClassification.test.ts`
Expected: FAIL (Modul existiert nicht).

- [ ] **Step 3: Implementierung schreiben**

`ui/desktop/src/components/board/boardClassification.ts`:
```ts
export type BoardColumn = 'waiting' | 'working' | 'done';

export const DONE_TTL_MS = 48 * 60 * 60 * 1000;

export interface BoardClassifyInput {
  done: boolean;
  lastActivityMs: number;
  streamState?: 'idle' | 'loading' | 'streaming' | 'error';
}

/**
 * Ordnet eine Session genau einer Board-Spalte zu.
 * Priorität: Done (nur ≤ 48h alt) > Working (streamt) > Waiting.
 * Rückgabe `null` => nicht anzeigen (Done und letzte Aktivität > 48h her).
 */
export function classifySession(input: BoardClassifyInput, nowMs: number): BoardColumn | null {
  if (input.done) {
    return nowMs - input.lastActivityMs <= DONE_TTL_MS ? 'done' : null;
  }
  if (input.streamState === 'streaming') {
    return 'working';
  }
  return 'waiting';
}
```

- [ ] **Step 4: Test ausführen — muss bestehen**

Run: `cd ui/desktop && pnpm exec vitest run src/components/board/boardClassification.test.ts`
Expected: PASS (7 Tests).

- [ ] **Step 5: Commit**

```bash
git add ui/desktop/src/components/board/boardClassification.ts ui/desktop/src/components/board/boardClassification.test.ts
git commit -m "feat(board): pure column classification + tests"
```

---

### Task 5: Board-Seite (UI, Live-Status, Drag & Drop, Resume, Route, Nav)

**Files:**
- Create: `ui/desktop/src/components/board/BoardView.tsx`
- Create: `ui/desktop/src/components/board/BoardColumn.tsx`
- Create: `ui/desktop/src/components/board/BoardCard.tsx`
- Modify: `ui/desktop/src/App.tsx`
- Modify: `ui/desktop/src/hooks/useNavigationItems.ts`

**Interfaces:**
- Consumes: `acpListSessions`, `acpSetSessionDone`, `SessionListItem` (Task 3); `classifySession`, `BoardColumn`, `DONE_TTL_MS` (Task 4); `SessionIndicators`; `AppEvents`; `Card`; lucide-Icons.
- Produces: Route `/board` → `<BoardView />`; Nav-Eintrag `board`.

- [ ] **Step 1: `BoardCard.tsx` erstellen**

```tsx
import React from 'react';
import { Calendar, Folder, MessageSquareText, Check, RotateCcw } from 'lucide-react';
import { Card } from '../ui/card';
import { SessionIndicators } from '../SessionIndicators';
import type { SessionListItem } from '../../acp/sessions';
import type { BoardColumn } from './boardClassification';

interface BoardCardProps {
  session: SessionListItem;
  column: BoardColumn;
  isStreaming: boolean;
  hasUnread: boolean;
  hasError: boolean;
  onOpen: (id: string) => void;
  onToggleDone: (id: string, done: boolean) => void;
}

export const BoardCard = React.memo<BoardCardProps>(
  ({ session, column, isStreaming, hasUnread, hasError, onOpen, onToggleDone }) => {
    const lastActivity = session.lastMessageAt ?? session.updatedAt;
    return (
      <Card
        draggable={column !== 'working'}
        onDragStart={(e) => e.dataTransfer.setData('text/plain', session.id)}
        onClick={() => onOpen(session.id)}
        className="py-3 px-4 mb-2 hover:shadow-default cursor-pointer transition-all duration-150 relative group"
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm break-words line-clamp-2 flex-1">{session.name || session.id}</h3>
          <SessionIndicators isStreaming={isStreaming} hasUnread={hasUnread} hasError={hasError} />
        </div>
        <div className="flex items-center text-text-secondary text-xs mt-2">
          <Calendar className="w-3 h-3 mr-1 flex-shrink-0" />
          <span>{new Date(lastActivity).toLocaleString()}</span>
        </div>
        <div className="flex items-center text-text-secondary text-xs">
          <Folder className="w-3 h-3 mr-1 flex-shrink-0" />
          <span className="truncate">{session.workingDir}</span>
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center text-xs text-text-secondary">
            <MessageSquareText className="w-3 h-3 mr-1" />
            <span className="font-mono">{session.messageCount}</span>
          </div>
          <button
            className="opacity-0 group-hover:opacity-100 text-xs flex items-center gap-1 text-text-secondary hover:text-text-standard"
            onClick={(e) => {
              e.stopPropagation();
              onToggleDone(session.id, column !== 'done');
            }}
          >
            {column === 'done' ? (
              <>
                <RotateCcw className="w-3 h-3" /> Wieder öffnen
              </>
            ) : (
              <>
                <Check className="w-3 h-3" /> Done
              </>
            )}
          </button>
        </div>
      </Card>
    );
  }
);
BoardCard.displayName = 'BoardCard';
```
> Import-Pfad von `Card` verifizieren (in `SessionListView.tsx` importiert — denselben Pfad verwenden, z. B. `../ui/card`).

- [ ] **Step 2: `BoardColumn.tsx` erstellen**

```tsx
import React from 'react';
import type { BoardColumn as BoardColumnId } from './boardClassification';

interface BoardColumnProps {
  id: BoardColumnId;
  title: string;
  count: number;
  isDropTarget: boolean;
  onDropSession?: (sessionId: string) => void;
  children: React.ReactNode;
}

export function BoardColumn({ id, title, count, isDropTarget, onDropSession, children }: BoardColumnProps) {
  const [over, setOver] = React.useState(false);
  return (
    <div
      className={`flex-1 min-w-[240px] flex flex-col rounded-lg bg-background-muted p-2 ${
        over ? 'ring-2 ring-borderProminent' : ''
      }`}
      onDragOver={isDropTarget ? (e) => { e.preventDefault(); setOver(true); } : undefined}
      onDragLeave={isDropTarget ? () => setOver(false) : undefined}
      onDrop={
        isDropTarget
          ? (e) => {
              e.preventDefault();
              setOver(false);
              const id = e.dataTransfer.getData('text/plain');
              if (id) onDropSession?.(id);
            }
          : undefined
      }
    >
      <div className="flex items-center justify-between px-1 py-2 text-sm font-medium">
        <span>{title}</span>
        <span className="text-text-secondary font-mono">{count}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {count === 0 ? <div className="text-xs text-text-secondary px-1 py-4">Keine Sessions</div> : children}
      </div>
    </div>
  );
}
```
> Tailwind-Tokens (`bg-background-muted`, `ring-borderProminent`) ggf. an vorhandene Tokens anpassen (siehe `SessionListView.tsx`/`Card`).

- [ ] **Step 3: `BoardView.tsx` erstellen**

```tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { acpListSessions, acpSetSessionDone, type SessionListItem } from '../../acp/sessions';
import { AppEvents } from '../../constants/events';
import { classifySession, type BoardColumn as BoardColumnId } from './boardClassification';
import { BoardColumn } from './BoardColumn';
import { BoardCard } from './BoardCard';

type StreamState = 'idle' | 'loading' | 'streaming' | 'error';
interface SessionStatus {
  streamState: StreamState;
  hasUnreadActivity: boolean;
}

const COLUMN_ORDER: BoardColumnId[] = ['waiting', 'working', 'done'];
const COLUMN_TITLES: Record<BoardColumnId, string> = {
  waiting: 'Waiting',
  working: 'Working',
  done: 'Done',
};

async function loadAllSessions(cap = 300): Promise<SessionListItem[]> {
  const all: SessionListItem[] = [];
  let cursor: string | null = null;
  do {
    const page = await acpListSessions(cursor);
    all.push(...page.sessions);
    cursor = page.nextCursor;
  } while (cursor && all.length < cap);
  return all;
}

export default function BoardView() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [statuses, setStatuses] = useState<Map<string, SessionStatus>>(new Map());
  const [nowMs, setNowMs] = useState(() => Date.now());

  const refresh = useCallback(() => {
    loadAllSessions().then(setSessions).catch((e) => console.error('board load failed', e));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live stream/unread state (mirrors NavigationPanel)
  useEffect(() => {
    const onStatus = (event: Event) => {
      const { sessionId, streamState } = (event as CustomEvent).detail as {
        sessionId: string;
        streamState: StreamState;
      };
      setStatuses((prev) => {
        const existing = prev.get(sessionId);
        const shouldMarkUnread = existing?.streamState === 'streaming' && streamState === 'idle';
        const next = new Map(prev);
        next.set(sessionId, {
          streamState,
          hasUnreadActivity: existing?.hasUnreadActivity || shouldMarkUnread,
        });
        return next;
      });
    };
    window.addEventListener(AppEvents.SESSION_STATUS_UPDATE, onStatus);
    return () => window.removeEventListener(AppEvents.SESSION_STATUS_UPDATE, onStatus);
  }, []);

  // Refresh list on create/delete/rename/done
  useEffect(() => {
    const events = [
      AppEvents.SESSION_CREATED,
      AppEvents.SESSION_DELETED,
      AppEvents.SESSION_RENAMED,
      AppEvents.SESSION_DONE_UPDATE,
    ];
    events.forEach((e) => window.addEventListener(e, refresh));
    return () => events.forEach((e) => window.removeEventListener(e, refresh));
  }, [refresh]);

  // Re-evaluate 48h boundary periodically
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const onOpen = useCallback(
    (id: string) => navigate(`/pair?resumeSessionId=${id}`),
    [navigate]
  );

  const onToggleDone = useCallback((id: string, done: boolean) => {
    // optimistic
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, done } : s)));
    acpSetSessionDone(id, done)
      .then(() => window.dispatchEvent(new CustomEvent(AppEvents.SESSION_DONE_UPDATE, { detail: { sessionId: id, done } })))
      .catch((e) => {
        console.error('set done failed', e);
        setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, done: !done } : s)));
      });
  }, []);

  const columns = useMemo(() => {
    const grouped: Record<BoardColumnId, SessionListItem[]> = { waiting: [], working: [], done: [] };
    for (const s of sessions) {
      const status = statuses.get(s.id);
      const lastActivityMs = Date.parse(s.lastMessageAt ?? s.updatedAt);
      const col = classifySession(
        { done: s.done, lastActivityMs, streamState: status?.streamState },
        nowMs
      );
      if (col) grouped[col].push(s);
    }
    for (const col of COLUMN_ORDER) {
      grouped[col].sort(
        (a, b) =>
          Date.parse(b.lastMessageAt ?? b.updatedAt) - Date.parse(a.lastMessageAt ?? a.updatedAt)
      );
    }
    return grouped;
  }, [sessions, statuses, nowMs]);

  return (
    <div className="h-full flex flex-col p-4">
      <h1 className="text-lg font-medium mb-4">Board</h1>
      <div className="flex-1 flex gap-3 overflow-x-auto">
        {COLUMN_ORDER.map((colId) => (
          <BoardColumn
            key={colId}
            id={colId}
            title={COLUMN_TITLES[colId]}
            count={columns[colId].length}
            isDropTarget={colId !== 'working'}
            onDropSession={(id) => onToggleDone(id, colId === 'done')}
          >
            {columns[colId].map((s) => {
              const status = statuses.get(s.id);
              return (
                <BoardCard
                  key={s.id}
                  session={s}
                  column={colId}
                  isStreaming={status?.streamState === 'streaming'}
                  hasUnread={status?.hasUnreadActivity ?? false}
                  hasError={status?.streamState === 'error'}
                  onOpen={onOpen}
                  onToggleDone={onToggleDone}
                />
              );
            })}
          </BoardColumn>
        ))}
      </div>
    </div>
  );
}
```
> Datentyp-Check: `SessionListItem.done` (Task 3) muss existieren. Der Import von `AppEvents.SESSION_CREATED/DELETED/RENAMED` muss zu `constants/events.ts` passen (dort bereits vorhanden).

- [ ] **Step 4: Route registrieren**

In `ui/desktop/src/App.tsx`:
- Import bei den anderen Page-Imports (~Zeile 33):
```tsx
import BoardView from './components/board/BoardView';
```
- Wrapper bei den anderen Route-Wrappern (~Zeile 218):
```tsx
const BoardRoute = () => {
  return <BoardView />;
};
```
- Route im `<Routes>`-Block innerhalb der `AppLayout`-Route (neben `path="sessions"`, ~Zeile 670):
```tsx
              <Route path="board" element={<BoardRoute />} />
```

- [ ] **Step 5: Nav-Eintrag ergänzen**

In `ui/desktop/src/hooks/useNavigationItems.ts`:
- Icon-Import (Zeile 1-11) erweitern: `KanbanSquare` aus `lucide-react`.
- In `NAV_ITEMS` (neben `sessions`):
```ts
  { id: 'board', path: '/board', label: 'Board', icon: KanbanSquare },
```
- In `navItemMessages`:
```ts
  board: {
    id: 'navigation.itemBoard',
    defaultMessage: 'Board',
  },
```

- [ ] **Step 6: Typecheck**

Run: `cd ui/desktop && pnpm exec tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 7: App manuell smoke-testen**

Run: `cd ui/desktop && pnpm run start`
Prüfen: Sidebar zeigt „Board"; `/board` zeigt drei Spalten; vorhandene Sessions erscheinen in Waiting; Klick auf Karte öffnet die Session (`/pair?resumeSessionId=…`); „Done"-Button verschiebt Karte nach Done; „Wieder öffnen" zurück; Drag von Waiting→Done und zurück funktioniert.
Expected: alles wie beschrieben.

- [ ] **Step 8: Commit**

```bash
git add ui/desktop/src/components/board/BoardView.tsx \
        ui/desktop/src/components/board/BoardColumn.tsx \
        ui/desktop/src/components/board/BoardCard.tsx \
        ui/desktop/src/App.tsx \
        ui/desktop/src/hooks/useNavigationItems.ts
git commit -m "feat(board): kanban board page with resume, done toggle, drag & drop"
```

---

### Task 6: Playwright-E2E fürs Board

**Files:**
- Create: `ui/desktop/e2e/board.spec.ts` (Pfad an bestehende Playwright-Struktur anpassen — siehe unten)

**Interfaces:**
- Consumes: laufende App mit `/board`-Route.

- [ ] **Step 1: Playwright-Setup lokalisieren**

Run: `cd ui/desktop && ls e2e 2>/dev/null; grep -n "playwright\|e2e" package.json`
Expected: vorhandenes E2E-Verzeichnis + Script gefunden. Datei/Selector-Konventionen der bestehenden Specs übernehmen (Test-IDs). Falls Selektoren fehlen, in Task 5 `data-testid` an Spalten (`board-column-<id>`) und Karten (`board-card`) ergänzen und Task 5 erneut committen.

- [ ] **Step 2: E2E-Spec schreiben**

Szenarien (an vorhandenes Test-Harness/Fixtures anpassen):
```ts
import { test, expect } from '@playwright/test';

test.describe('Session Board', () => {
  test('shows columns and opens a session on card click', async ({ page }) => {
    await page.goto('/#/board');
    await expect(page.getByText('Waiting')).toBeVisible();
    await expect(page.getByText('Working')).toBeVisible();
    await expect(page.getByText('Done')).toBeVisible();

    const card = page.getByTestId('board-card').first();
    await card.click();
    await expect(page).toHaveURL(/resumeSessionId=/);
  });

  test('mark done moves card to Done column and back', async ({ page }) => {
    await page.goto('/#/board');
    const card = page.getByTestId('board-card').first();
    await card.hover();
    await card.getByRole('button', { name: 'Done' }).click();
    const doneColumn = page.getByTestId('board-column-done');
    await expect(doneColumn.getByTestId('board-card')).toHaveCount(1);
    await doneColumn.getByTestId('board-card').first().hover();
    await doneColumn.getByRole('button', { name: 'Wieder öffnen' }).click();
    await expect(doneColumn.getByTestId('board-card')).toHaveCount(0);
  });
});
```
> Die 48-h-Ausblende-Logik ist bereits durch die vitest-Unit-Tests (Task 4) abgedeckt; ein E2E dafür ist optional (bräuchte Zeitmanipulation/Fixtures).

- [ ] **Step 3: E2E ausführen**

Run: `cd ui/desktop && pnpm run e2e` (exakten Script-Namen aus Step 1 verwenden)
Expected: Board-Tests grün.

- [ ] **Step 4: Commit**

```bash
git add ui/desktop/e2e/board.spec.ts
git commit -m "test(board): playwright e2e for resume + done toggle"
```

---

## Abschluss / Integration

- [ ] Alle Task-Tests grün (`cargo test --lib session::session_manager`, vitest board, Playwright board).
- [ ] `cd ui/desktop && pnpm exec tsc --noEmit` grün.
- [ ] Feature nach `corporate` mergen (superpowers:finishing-a-development-branch), niemals nach `main`/`upstream`.
- [ ] Lebende Doku ergänzen: Board-Feature in `docs/` beschreiben; diese Spec/Plan-Dateien nach Übernahme entfernen.

## Abweichungen vom Spec-Dokument (bewusst)

1. **Live-Status-Quelle:** Der Spec nannte den Backend-`session_event_bus`. Das Frontend hat dafür jedoch keine SSE-Anbindung; der etablierte Weg sind `window`-`CustomEvent`s (`SESSION_STATUS_UPDATE`), die aus offenen Chats (`BaseChat.tsx`) gefeuert werden. Der Plan nutzt diesen vorhandenen Mechanismus (identisch zur Sidebar). Konsequenz: „Working" ist zuverlässig für in der App **offene, streamende** Sessions; nicht geöffnete Hintergrund-Läufe erscheinen erst nach Refresh in Waiting. Für v1 akzeptiert.
2. **Drag & Drop:** Native HTML5 DnD statt einer neuen Bibliothek (Muster `MessageQueue.tsx`) — vermeidet eine zusätzliche Abhängigkeit.
3. **`done` in der Liste:** Wird als `_meta.done` transportiert (kein neues Listen-Feld im Kern-`SessionInfo`), da das Frontend `_meta` bereits generisch liest.
