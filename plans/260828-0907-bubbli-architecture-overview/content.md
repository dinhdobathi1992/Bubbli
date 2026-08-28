# Bubbli — architecture overview / Tổng quan kiến trúc

Every claim below is taken from the repository at commit `98829a4`, not from a
plan document. Paths are the evidence.

---

## 1. Hero — the tension is the product / Sự căng thẳng chính là sản phẩm

**EN.** Bubbli is a learning assistant a child aged 4–15 can talk to, and a
safety instrument their guardian can trust — without the guardian reading
everything the child says.

A parent who can read every conversation has a surveillance tool, and a child
who knows it will not ask the question that matters. Bubbli holds the middle:
**a guardian is shown that something unsafe happened, and only an unsafe
conversation opens.** Everything below the severity gate stays between the child
and the assistant — recorded, but not readable.

That gate is one constant: `VISIBILITY_GATE = 'medium'` in
`src/lib/authz/index.ts`. Five severities rank below and above it: `info`,
`low`, `medium`, `high`, `critical`.

**VI.** Bubbli là một trợ lý học tập cho trẻ 4–15 tuổi, đồng thời là một công cụ
an toàn mà phụ huynh có thể tin tưởng — mà không cần đọc mọi điều đứa trẻ nói.

Một phụ huynh đọc được mọi cuộc trò chuyện thì đang nắm một công cụ giám sát, và
một đứa trẻ biết điều đó sẽ không bao giờ hỏi câu hỏi thật sự quan trọng. Bubbli
giữ ở giữa: **phụ huynh được cho biết rằng có điều gì đó không an toàn đã xảy ra,
và chỉ cuộc trò chuyện không an toàn mới được mở.** Mọi thứ dưới ngưỡng vẫn nằm
giữa đứa trẻ và trợ lý — được ghi lại, nhưng không đọc được.

---

## 2. The turn — two gates, in both directions / Một lượt trò chuyện

**EN.** `src/lib/chat/pipeline.ts` runs every message through the same path, and
the ordering is deliberate at each step.

| Step | What happens | Why it sits here |
|---|---|---|
| Idempotency | A retry is recognised | Buffered generation holds a request open for seconds; a retry must not double-flag or send a second crisis notification |
| Input gate | Layer 1 rules, then layer 2 classifier | Deterministic first: a linear-time rule table over raw, normalized and de-obfuscated forms of the message |
| Crisis copy | Composed **before** any write | So no later failure can lose it |
| TX1 | The child's message is persisted | |
| TX2 | Guardrail result + flag + `max_severity`, atomically | A flag and the severity it implies must not be able to disagree |
| Generation | The provider is called | |
| Output gate | The model's reply is graded too | The case where the AI itself is the hazard |
| TX3 | Assistant message + output result (+ flag when blocked) | |
| Notify | Guardians alerted, downstream of the response | A dead provider must never cost the child their reply |

Layer 1 lives in `src/lib/guardrails/`. Every rule that can collide with the
curriculum carries explicit exclusions — a homework product that blocks *"the
sex of a turtle"* or *"how to kill weeds"* has failed. Layer 2
(`SAFETY_CLASSIFIER_ENABLED`) is currently off, and enabling it without a wired
client is a hard startup refusal rather than a silent no-op.

**VI.** Mỗi tin nhắn đi qua cùng một đường ống, và thứ tự từng bước đều có chủ ý.
Lớp 1 là bảng luật tất định chạy tuyến tính, so khớp trên cả dạng thô, dạng chuẩn
hoá và dạng đã gỡ nguỵ trang của tin nhắn. Mọi luật có thể va vào chương trình
học đều mang ngoại lệ tường minh — một sản phẩm hỗ trợ làm bài tập mà chặn *"giới
tính của con rùa"* thì đã thất bại. Lớp 2 hiện đang tắt, và bật nó lên mà chưa nối
client sẽ khiến ứng dụng từ chối khởi động, chứ không âm thầm bỏ qua.

---

## 3. The database — 21 tables, and the invariants that matter / Cơ sở dữ liệu

**EN.** PostgreSQL, one datastore, no second store and no extra sub-processor
(`docs/decisions/0003`). Schema: `src/db/schema.ts`. Migrations: `drizzle/`.

**Family and identity**
`families` · `parents` · `children`

**Authentication — two principals, deliberately separate**
`auth_users` `auth_sessions` `auth_accounts` `auth_verifications` (Better Auth,
namespaced `auth_*`) · `child_devices` `child_sessions` `login_attempts`

**Conversation**
`conversations` · `messages` · `message_feedback`

**Safety**
`policy_versions` · `guardrail_results` · `flags` · `ai_provider_attempts`

**Oversight**
`family_pseudonyms` · `audit_events`

**Budget**
`quota_events` · `family_daily_quota`

### The invariants the schema itself enforces

These are the parts a reader would not guess, and each is a constraint or a
trigger rather than a convention:

- **`audit_events` is append-only.** Two triggers reject `UPDATE` and `TRUNCATE`
  outright — *"audit_events is append-only: % is not permitted (PRD 7.3)"*.
- **Severity may only rise.** `conversations_severity_monotonic` raises an
  exception on any attempt to lower or clear `max_severity`. A dismissal does
  not close a transcript.
- **`audit_events` carries no foreign keys.** It records what was *attempted*,
  including against rows that do not exist.
- **`login_attempts.family_id` is deliberately not a foreign key.** An attacker
  probing family codes must be recorded and throttled; an FK made those exact
  attempts throw instead.
- **Audit rows name pseudonyms, not people.** `family_pseudonyms` maps
  `parent` / `child` / `family` subjects to stable pseudonyms.
- **A message role is `child`, never `user`.** `messages_role_ck` allows
  `child`, `assistant`, `system` — the spelling every other chat codebase uses
  matches nothing here.
- **Four age bands, checked in the database.** `4-7`, `8-11`, `12`, `13-15`.
- **There is no `title` column anywhere.** Generating one would mean a model call
  over unflagged content, so the absence is the feature.
- **A flag points at the message that carried the content** — an output flag
  attaches to the *assistant* message, never the child's. The reviewed prior art
  attached both to the child, so moderators saw children flagged for what the
  model produced.
- **`audit_outcome_ck` allows `granted`, `delivered`, `denied`, `failed`.**
  `failed` is not an access decision: it records an attempt the decision
  permitted and the world refused.

**VI.** PostgreSQL, một kho dữ liệu duy nhất. Điểm đáng chú ý không phải là danh
sách bảng mà là các bất biến do chính lược đồ ép buộc: bảng `audit_events` chỉ
được ghi thêm (hai trigger chặn `UPDATE` và `TRUNCATE`); mức nghiêm trọng của một
cuộc trò chuyện chỉ có thể tăng, không bao giờ giảm hay bị xoá; bảng kiểm toán
không mang khoá ngoại vì nó ghi lại điều đã được *thử*, kể cả với những dòng không
tồn tại; và các dòng kiểm toán gọi tên bí danh, không gọi tên người.

---

## 4. The application — 24 surfaces, two principals / Cấu trúc ứng dụng

**EN.** Next.js App Router. Two route groups plus the API:

- `src/app/(child)/` — `chat`, `login`, `login/[code]`, `pair`
- `src/app/(parent)/parent/` — dashboard, `conversations/[id]`, `family`,
  `setup`, `sign-in`
- `src/app/api/` — `chat`, `child/*`, `parent/*`, `auth/[...all]`, `enquiry`,
  `health`

Twenty-one of those surfaces are server-rendered; three are `'use client'`.

### Two principals, and the order they resolve in

`getSession()` in `src/lib/auth/request-session.ts` asks the child store first
and Better Auth second. That order is deliberate: a request carrying both
resolves as the **child**, which is the safer failure — a child principal can
never read another conversation, whereas a parent principal can read `medium`+
transcripts.

`principalType` is derived server-side from *which store answered*. It is never
read from a client-supplied header, cookie field, or body claim.

- **Child** — a family join code plus a PIN, or a paired device. Eight
  characters from an alphabet with no `I`, `O`, `0` or `1`, so it survives being
  read aloud (`src/lib/auth/join-code.ts`).
- **Guardian** — email OTP only. No password exists to forget, reset, or leak,
  and receiving the code re-proves control of the mailbox on every sign-in —
  which is what makes `parents.auth_user_id` safe to trust as the family link.

### Module boundaries

| Path | Owns |
|---|---|
| `src/lib/guardrails/` | Rule table, normalizer, engine, classifier seam |
| `src/lib/chat/` | The turn pipeline, history window, a child's own read path |
| `src/lib/authz/` | Every principal assertion. Denials carry 404 by default |
| `src/lib/auth/` | Parent OTP, child PIN, device pairing, sessions, rate limits |
| `src/lib/notify/` | Guardian alerts — metadata only |
| `src/lib/parent/` | The guardian projection, and the audited transcript read |
| `src/lib/quota/` | Per-child window and per-family daily ceiling |
| `src/lib/audit/` | Pseudonyms and the append-only write |
| `src/config/` | Zod-validated settings; the only place `process.env` is read |

**VI.** Hai loại chủ thể được phân giải theo thứ tự có chủ ý: phiên của trẻ được
hỏi trước, Better Auth hỏi sau. Một yêu cầu mang cả hai sẽ được coi là **trẻ em** —
đó là hướng hỏng an toàn hơn, vì chủ thể trẻ em không bao giờ đọc được cuộc trò
chuyện của người khác, trong khi chủ thể phụ huynh thì có thể. Loại chủ thể được
suy ra ở phía máy chủ từ việc kho nào trả lời, không bao giờ đọc từ dữ liệu do
client gửi lên.

---

## 5. What holds it — the gates / Những cánh cổng giữ hệ thống

**EN.** The interesting property of this codebase is that its safety claims are
mechanically enforced, and several are enforced twice by mechanisms with
different blind spots.

**Isolation (G1), proven two ways.** A custom ESLint rule
(`eslint-rules/no-direct-message-query.js`) constrains *who may read
`messages.content`* — it sees RSC pages and Server Actions that no route
manifest can enumerate. A runtime suite (`tests/isolation/`) drives every
surface with each principal type and asserts *what actually comes back* — it
catches a leak travelling through a module the rule has already allow-listed.
Neither subsumes the other.

That suite treats an undriveable surface as a **failure**, never a skip. A
surface that throws before touching the database emits no evidence of a leak,
and "no evidence" must not read as "safe".

**Budget coverage.** `tests/routes/quota-coverage.test.ts` discovers which
routes can reach a model by walking the module graph — including
`await import()` — and fails any that does not check the quota. There is no
allow-list to forget to update.

**Guardrail precision (G4).** `pnpm corpus:eval` gates precision against
held-out cases and reports recall without gating it. A false positive blocks a
child's homework.

**Are the tests worth anything (G3).** `pnpm test:mutation` re-performs
"delete the guard and watch it go red" over the security-critical modules on
every CI run, because a one-time manual check decays at the next refactor.

**Configuration.** Zod-validated at startup. A missing or malformed value stops
the process rather than degrading, and `process.env` is banned outside the
config layer by lint.

**VI.** Điều đáng chú ý ở codebase này là các tuyên bố về an toàn được ép buộc
bằng máy móc, và nhiều tuyên bố được ép buộc hai lần bởi hai cơ chế có điểm mù
khác nhau. Một luật ESLint riêng giới hạn *ai được đọc* nội dung tin nhắn; một bộ
kiểm thử thời gian chạy lái thử mọi bề mặt và khẳng định *thứ thực sự trả về*.
Không cơ chế nào bao trùm cơ chế kia.

---

## References

- iOS Safari web push requires the site to be installed to the Home Screen as a
  PWA, on iOS 16.4 or later — the reason push is deferred as a guardian alert
  channel (`docs/decisions/0006-notification-transport.md`):
  - https://documentation.onesignal.com/docs/en/web-push-for-ios
  - https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide
  - https://pushalert.co/documentation/ios-web-push
- Repository evidence: `src/db/schema.ts`, `drizzle/`, `src/lib/chat/pipeline.ts`,
  `src/lib/authz/index.ts`, `src/lib/auth/request-session.ts`,
  `eslint-rules/no-direct-message-query.js`, `tests/isolation/`, `tests/routes/`.
